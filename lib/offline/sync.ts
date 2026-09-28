import { getBrowserClient } from "@/lib/supabase/lazy";
import type { Customer, Invoice, InventoryItem, InvoiceItem } from "@/lib/types";
import { offlineDb, hasIndexedDb, type LocalInvoice, type PendingAction } from "./db";
import { checkRealConnectivity, isBrowserOnline } from "./net";

export type SyncStatus = "offline" | "syncing" | "synced" | "error";

let status: SyncStatus = "offline";
let pendingCount = 0;
let lastError: string | null = null;
let running = false;
let started = false;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSyncStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called by lib/offline/dataLayer.ts (and anything else) after any change, so the
 *  status badge and any open lists can react without polling. */
export function notifySyncListeners() {
  for (const l of listeners) l();
}

export function getSyncSnapshot() {
  return { status, pendingCount, lastError };
}

function setStatus(next: SyncStatus, error: string | null = null) {
  status = next;
  lastError = error;
  notifySyncListeners();
}

async function refreshPendingCount() {
  if (!hasIndexedDb()) return;
  const all = await offlineDb.pending_sync.toArray();
  pendingCount = all.filter((a) => !a.synced).length;
  notifySyncListeners();
}

/* ---------------------------------------------------------------------- */
/* Push: send every queued change to Supabase, oldest first.               */
/* ---------------------------------------------------------------------- */

async function pushOne(action: PendingAction): Promise<{ ok: boolean; error?: string; resultId?: string }> {
  const supabase = await getBrowserClient();

  if (action.action === "rpc" && action.rpc_name) {
    const params = await substituteLocalInvoiceId(action.payload);
    const stillWaiting = Object.values(params).some(
      (v) => typeof v === "string" && v.startsWith("__LOCAL_INVOICE__:")
    );
    if (stillWaiting) {
      // The create_invoice this depends on hasn't gone through yet (e.g. it
      // failed earlier in this same run) -- wait for the next sync attempt
      // rather than sending Postgres a placeholder as if it were a real id.
      return { ok: false, error: "Waiting for the related bill to sync first." };
    }
    const { data, error } = await supabase.rpc(action.rpc_name, params);
    if (error) return { ok: false, error: error.message };
    return { ok: true, resultId: typeof data === "string" ? data : undefined };
  }

  if (action.action === "delete") {
    const { error } = await supabase.from(action.table_name as "inventory" | "customers").delete().eq("id", action.record_id);
    if (error && error.code !== "PGRST116") return { ok: false, error: error.message };
    return { ok: true };
  }

  // create / update on a plain table -- upsert covers both, since payload always carries the id.
  const { error } = await supabase.from(action.table_name as "inventory" | "customers").upsert(action.payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Once create_invoice has returned the real invoice id, `promoteLocalInvoice`
 * (below) rewrites the cached invoice row to carry that real id while keeping
 * `local_id` as the join key. A later record_scrap_intake action -- possibly
 * not run until the *next* time the app is open, if the first sync attempt
 * was interrupted -- looks the real id up here rather than from memory, so it
 * survives a page reload or the app being closed.
 */
async function substituteLocalInvoiceId(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && value.startsWith("__LOCAL_INVOICE__:")) {
      const localId = value.slice("__LOCAL_INVOICE__:".length);
      const promoted = hasIndexedDb() ? await offlineDb.invoices.where("local_id").equals(localId).first() : undefined;
      out[key] = promoted && !promoted.pending ? promoted.id : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function push(): Promise<boolean> {
  if (!hasIndexedDb()) return true;
  const all = await offlineDb.pending_sync.orderBy("id").toArray();
  const actions = all.filter((a) => !a.synced);
  let allOk = true;

  for (const action of actions) {
    const result = await pushOne(action);
    if (!result.ok) {
      allOk = false;
      await offlineDb.pending_sync.update(action.id!, { last_error: result.error });
      // Keep processing the rest of the queue -- one stuck row (e.g. a validation
      // error) should not block unrelated changes from syncing.
      continue;
    }

    if (action.action === "rpc" && (action.rpc_name === "create_invoice" || action.rpc_name === "create_fbr_bill") && result.resultId) {
      // Swap the temporary local invoice row for the real server id so the list
      // and detail screens stop showing "Pending sync" for this bill. Any
      // queued record_scrap_intake action in the same group will find the
      // real id via substituteLocalInvoiceId on its own turn (or next sync).
      await promoteLocalInvoice(action.record_id, result.resultId);
    }

    await offlineDb.pending_sync.update(action.id!, { synced: true });
  }

  // Tidy up: drop rows that made it, keep the failed ones for the next attempt.
  const toClear = (await offlineDb.pending_sync.toArray()).filter((a) => a.synced).map((a) => a.id!);
  if (toClear.length > 0) await offlineDb.pending_sync.bulkDelete(toClear);
  await refreshPendingCount();
  return allOk;
}

async function promoteLocalInvoice(localId: string, realId: string) {
  const local = await offlineDb.invoices.get(localId);
  if (local) {
    await offlineDb.invoices.delete(localId);
    await offlineDb.invoices.put({ ...local, id: realId, pending: false });
  }
  const items = await offlineDb.invoice_items.where("invoice_id").equals(localId).toArray();
  for (const item of items) {
    await offlineDb.invoice_items.delete(item.id);
    await offlineDb.invoice_items.put({ ...item, id: crypto.randomUUID(), invoice_id: realId });
  }
}

/* ---------------------------------------------------------------------- */
/* Pull: refresh the local cache from Supabase.                            */
/* ---------------------------------------------------------------------- */

async function pull() {
  if (!hasIndexedDb()) return;
  const supabase = await getBrowserClient();

  // Don't let a fresh pull overwrite rows that still have a change waiting to go out.
  const stillPending = (await offlineDb.pending_sync.toArray()).filter((a) => !a.synced);
  const dirtyIds = new Set(stillPending.map((a) => a.record_id));

  const [inv, cust, sales] = await Promise.all([
    supabase.from("inventory").select("*"),
    supabase.from("customers").select("*"),
    supabase.from("invoice_balances").select("*").order("invoice_date", { ascending: false }).limit(1000),
  ]);

  if (!inv.error && inv.data) {
    const rows = (inv.data as InventoryItem[]).filter((r) => !dirtyIds.has(r.id));
    await offlineDb.inventory.bulkPut(rows);
  }
  if (!cust.error && cust.data) {
    const rows = (cust.data as Customer[]).filter((r) => !dirtyIds.has(r.id));
    await offlineDb.customers.bulkPut(rows);
  }
  if (!sales.error && sales.data) {
    const rows = (sales.data as Invoice[])
      .filter((r) => !dirtyIds.has(r.id))
      .map((r) => ({ ...r, pending: false, local_id: r.id }) as LocalInvoice);
    await offlineDb.invoices.bulkPut(rows);
  }

  await offlineDb.meta.put({ key: "last_pull", value: new Date().toISOString() });
}

/* ---------------------------------------------------------------------- */
/* Public entry point                                                      */
/* ---------------------------------------------------------------------- */

export async function runSync(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const online = await checkRealConnectivity();
    if (!online) {
      setStatus("offline");
      await refreshPendingCount();
      return;
    }
    setStatus("syncing");
    const ok = await push();
    await pull();
    setStatus(ok ? "synced" : "error", ok ? null : "Some changes could not be sent. They will retry automatically.");
  } catch {
    setStatus("error", "Sync failed unexpectedly. It will retry automatically.");
  } finally {
    running = false;
  }
}

/** Call once, near the root of the app (see components/SyncProvider.tsx). */
export function startAutoSync() {
  if (started || typeof window === "undefined") return;
  started = true;

  refreshPendingCount();
  setStatus(isBrowserOnline() ? "syncing" : "offline");
  void runSync();

  window.addEventListener("online", () => void runSync());
  window.addEventListener("offline", () => setStatus("offline"));

  // Belt-and-braces: retry every 30s while online, in case an earlier attempt
  // failed quietly (e.g. Supabase was briefly down rather than the device).
  setInterval(() => {
    if (isBrowserOnline()) void runSync();
  }, 30_000);
}

/** Exposed for a manual "Sync now" button if you want one later. */
export const manualSync = runSync;
