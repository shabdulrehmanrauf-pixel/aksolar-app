import { createClient } from "@/lib/supabase/server";
import { isSenderOffline, type FbrHomeWarnings } from "@/lib/fbrHome";
import { todayKarachi } from "@/lib/invoices";

const SAMPLE = 3;

type Row = { id: string; invoice_number: string; buyer_name: string };
const toRows = (rows: unknown): { id: string; invoiceNumber: string; buyerName: string }[] =>
  Array.isArray(rows)
    ? (rows as Row[]).map((r) => ({ id: r.id, invoiceNumber: r.invoice_number, buyerName: r.buyer_name }))
    : [];

/**
 * FBR warnings for the Home screen. Server only.
 * Returns null when FBR is off, or when the FBR tables cannot be read, so Home never breaks.
 */
export async function loadFbrHomeWarnings(): Promise<FbrHomeWarnings | null> {
  try {
    const supabase = await createClient();

    const profile = await supabase.from("business_profile").select("fbr_enabled").maybeSingle();
    if (profile.error || !profile.data?.fbr_enabled) return null;

    const [heartbeat, failed, unknown, unreported] = await Promise.all([
      supabase.from("fbr_heartbeat").select("last_seen,environment").maybeSingle(),
      supabase
        .from("fbr_invoices")
        .select("invoices!inner(id,invoice_number,buyer_name)", { count: "exact" })
        .eq("fbr_status", "failed")
        .order("updated_at", { ascending: false })
        .limit(SAMPLE),
      supabase
        .from("fbr_invoices")
        .select("invoices!inner(id,invoice_number,buyer_name)", { count: "exact" })
        .eq("fbr_status", "unknown")
        .order("updated_at", { ascending: false })
        .limit(SAMPLE),
      supabase
        .from("audit_log")
        .select("record_id,new_data", { count: "exact" })
        .eq("table_name", "invoices")
        .eq("action", "create")
        .eq("new_data->>fbr_skipped", "true")
        .gte("created_at", `${todayKarachi()}T00:00:00+05:00`)
        .order("created_at", { ascending: false })
        .limit(SAMPLE),
    ]);

    const flatten = (res: typeof failed) =>
      toRows(
        ((res.data ?? []) as unknown as { invoices: Row | Row[] }[]).map((r) =>
          Array.isArray(r.invoices) ? r.invoices[0] : r.invoices,
        ),
      );

    // Unreported bills: audit_log has no buyer_name/invoice_number, so fetch those from invoice_balances.
    const unreportedIds = ((unreported.data ?? []) as { record_id: string | null }[])
      .map((r) => r.record_id)
      .filter((id): id is string => !!id);
    let unreportedSample: { id: string; invoiceNumber: string; buyerName: string }[] = [];
    if (unreportedIds.length > 0) {
      const inv = await supabase
        .from("invoice_balances")
        .select("id,invoice_number,buyer_name")
        .in("id", unreportedIds);
      unreportedSample = toRows(inv.data);
    }

    const lastSeen = (heartbeat.data?.last_seen as string | null) ?? null;
    return {
      enabled: true,
      environment: heartbeat.data?.environment === "production" ? "production" : "sandbox",
      senderOffline: isSenderOffline(lastSeen),
      senderLastSeen: lastSeen,
      failedCount: failed.count ?? 0,
      failedSample: flatten(failed),
      unknownCount: unknown.count ?? 0,
      unknownSample: flatten(unknown),
      unreportedTodayCount: unreported.count ?? 0,
      unreportedTodaySample: unreportedSample,
    };
  } catch {
    return null;
  }
}
