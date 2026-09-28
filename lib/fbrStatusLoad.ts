import { createClient } from "@/lib/supabase/server";
import { FBR_COLUMNS, fbrInfoFromRow, type FbrInfo } from "@/lib/fbrStatus";

/**
 * Reads FBR status from Supabase. Server only.
 * If the FBR tables are missing or the request fails for any reason, these return "nothing"
 * so Sales and the bill page keep working exactly as before.
 */

/** FBR status for the latest bills, keyed by invoice id. */
export async function loadFbrStatuses(): Promise<Record<string, FbrInfo>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("fbr_invoices")
      .select(FBR_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error || !data) return {};
    const out: Record<string, FbrInfo> = {};
    for (const row of data) {
      const info = fbrInfoFromRow(row);
      if (info) {
        const { invoiceId, ...rest } = info;
        out[invoiceId] = rest;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** FBR status for one bill, or null if it is not an FBR bill. */
export async function loadFbrStatus(invoiceId: string): Promise<FbrInfo | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("fbr_invoices").select(FBR_COLUMNS).eq("invoice_id", invoiceId).maybeSingle();
    if (error || !data) return null;
    const info = fbrInfoFromRow(data);
    if (!info) return null;
    const { invoiceId: _id, ...rest } = info;
    void _id;
    return rest;
  } catch {
    return null;
  }
}
