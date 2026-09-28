import { getBrowserClient } from "@/lib/supabase/lazy";
import { offlineDb, hasIndexedDb } from "./db";
import { checkRealConnectivity } from "./net";
import { notifySyncListeners } from "./sync";

export type SimpleTable = "inventory" | "customers";

type SaveResult = { error: string | null; code?: string; offline: boolean; id: string };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Insert or update one row of `table`.
 *
 * Always writes to Dexie first so the screen updates instantly. If we are online,
 * it also tries Supabase right away; if that fails (offline, or a dropped
 * connection mid-request) the same change is queued in pending_sync and sent
 * automatically once the connection is back (see lib/offline/sync.ts).
 */
export async function offlineSave(
  table: SimpleTable,
  existingId: string | null,
  payload: Record<string, unknown>
): Promise<SaveResult> {
  const id = existingId ?? newId();
  const now = new Date().toISOString();
  const record = { ...payload, id, updated_at: now, created_at: payload.created_at ?? now };

  if (hasIndexedDb()) {
    // @ts-expect-error -- table is one of the two simple tables, both keyed by id
    await offlineDb[table].put(record);
  }

  const online = await checkRealConnectivity();
  if (online) {
    try {
      const supabase = await getBrowserClient();
      const { error } = existingId
        ? await supabase.from(table).update(payload).eq("id", id)
        : await supabase.from(table).insert({ ...payload, id });
      if (!error) {
        notifySyncListeners();
        return { error: null, offline: false, id };
      }
      // Fall through to queue -- e.g. a constraint the user can't fix by waiting
      // (bad phone number) will keep failing, but we still don't want to lose the
      // change, so we surface the message immediately instead of queueing it blindly
      // when it looks like a validation error rather than a connectivity one.
      if (isLikelyValidationError(error)) {
        return { error: error.message, code: error.code, offline: false, id };
      }
    } catch {
      // network dropped mid-request -- queue below
    }
  }

  if (hasIndexedDb()) {
    await offlineDb.pending_sync.add({
      table_name: table,
      record_id: id,
      action: existingId ? "update" : "create",
      payload: { ...payload, id },
      created_at: now,
      synced: false,
    });
  }
  return { error: null, offline: true, id };
}

export async function offlineDelete(
  table: SimpleTable,
  id: string
): Promise<{ error: string | null; code?: string; offline: boolean }> {
  const online = await checkRealConnectivity();

  if (online) {
    try {
      const supabase = await getBrowserClient();
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (!error) {
        if (hasIndexedDb()) await offlineDb[table].delete(id);
        notifySyncListeners();
        return { error: null, offline: false };
      }
      // A delete blocked by a foreign key (item used on a bill) or another data
      // problem is permanent, not something that will succeed later -- surface
      // it now and leave the row exactly as it was (nothing was deleted anywhere).
      if (isLikelyValidationError(error)) {
        return { error: error.message, code: error.code, offline: false };
      }
      // Anything else (e.g. a timeout) falls through to the offline path below.
    } catch {
      // network dropped mid-request -- fall through to the offline path below
    }
  }

  // Offline, or the request above failed for a connectivity-shaped reason:
  // delete locally now and let the sync engine retry the real delete later.
  if (hasIndexedDb()) {
    await offlineDb[table].delete(id);
    await offlineDb.pending_sync.add({
      table_name: table,
      record_id: id,
      action: "delete",
      payload: {},
      created_at: new Date().toISOString(),
      synced: false,
    });
  }
  return { error: null, offline: true };
}

function isLikelyValidationError(error: { code?: string }): boolean {
  // 22*/23* Postgres error classes are data problems (bad input, constraint violation),
  // not connectivity problems -- no point queueing those, they will just fail again.
  // 42501 = "not allowed for your role": waiting will not fix it either.
  return !!error.code && /^(22|23|42501)/.test(error.code);
}
