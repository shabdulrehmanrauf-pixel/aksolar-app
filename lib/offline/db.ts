import Dexie, { type Table } from "dexie";
import type { Customer, Invoice, InvoiceItem, InventoryItem } from "@/lib/types";

/**
 * Offline cache + outbox for AK Solar.
 *
 * How data flows:
 * - Every read the app does for inventory/customers/sales first goes through Dexie.
 *   Whenever a server fetch succeeds, we mirror the rows into Dexie so the same
 *   screen still has something to show the next time there is no connection.
 * - Every write (add/edit/delete/create-invoice) is written to Dexie immediately,
 *   then either sent to Supabase right away (if online) or dropped into
 *   `pending_sync` to be sent later by lib/offline/sync.ts.
 *
 * Conflict rule: last write wins. With 1-2 devices this is enough -- see the
 * companion instructions doc for the one nuance around `updated_at`.
 */

/** A row cached locally for an invoice created while offline, before it has a real
 *  server invoice number. Replaced by the real row once `create_invoice` runs. */
export type LocalInvoice = Invoice & {
  /** true until the matching pending_sync "create_invoice" action has finished. */
  pending: boolean;
  /** Client-generated id used to join this row to its pending_sync action and its items. */
  local_id: string;
};

export type PendingAction = {
  id?: number; // Dexie auto-increment primary key
  /** The Supabase table name for create/update/delete. "rpc" for a Postgres function call. */
  table_name: "inventory" | "customers" | "invoices" | "invoice_items" | "rpc";
  /** For "rpc" actions, the Postgres function to call (e.g. "create_invoice"). */
  rpc_name?: string;
  record_id: string;
  action: "create" | "update" | "delete" | "rpc";
  /** Full row (create/update) or RPC params (rpc). Unused for delete. */
  payload: Record<string, unknown>;
  /** Groups a create_invoice call with the record_scrap_intake calls that must follow it,
   *  so the sync engine can substitute the real invoice id once it comes back. */
  group_id?: string;
  /** Some params of an "rpc" action may be the string "__LOCAL_INVOICE__" -- the sync
   *  engine replaces it with the real invoice id once create_invoice has succeeded. */
  created_at: string;
  synced: boolean;
  /** Set when a sync attempt fails, so the UI/status badge can explain why it is stuck. */
  last_error?: string;
};

export type SyncMeta = {
  key: string; // e.g. "inventory_last_pull", "customers_last_pull"
  value: string;
};

class OfflineDB extends Dexie {
  inventory!: Table<InventoryItem, string>;
  customers!: Table<Customer, string>;
  invoices!: Table<LocalInvoice, string>;
  invoice_items!: Table<InvoiceItem, string>;
  pending_sync!: Table<PendingAction, number>;
  meta!: Table<SyncMeta, string>;

  constructor() {
    super("aksolar-offline");
    this.version(1).stores({
      // Primary key first, then indexes we actually filter/sort by.
      inventory: "id, category, brand, model, updated_at",
      customers: "id, name, phone, updated_at",
      invoices: "id, local_id, invoice_date, status",
      invoice_items: "id, invoice_id",
      pending_sync: "++id, group_id, table_name",
      meta: "key",
    });
  }
}

/** Single shared instance. Dexie is safe to use straight away -- it opens lazily. */
export const offlineDb = new OfflineDB();

/** True only in the browser. Every offline helper checks this before touching Dexie,
 *  since these modules are also imported by server components for their types. */
export const hasIndexedDb = () => typeof window !== "undefined" && "indexedDB" in window;
