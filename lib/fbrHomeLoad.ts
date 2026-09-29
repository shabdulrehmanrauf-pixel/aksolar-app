import { createClient } from "@/lib/supabase/server";
import { isSenderOffline, type FbrHomeWarnings } from "@/lib/fbrHome";

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

    const [heartbeat, failed, unknown] = await Promise.all([
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
    ]);

    const flatten = (res: typeof failed) =>
      toRows(
        ((res.data ?? []) as unknown as { invoices: Row | Row[] }[]).map((r) =>
          Array.isArray(r.invoices) ? r.invoices[0] : r.invoices,
        ),
      );

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
    };
  } catch {
    return null;
  }
}

import type { FbrReadiness } from "@/lib/fbrReadiness";
import { isSenderOffline as _isSenderOffline } from "@/lib/fbrHome";

/**
 * Go-live readiness (Phase D8). Server only. Returns null when the FBR tables cannot be read.
 * Unlike loadFbrHomeWarnings, this does not require fbr_enabled -- it is meant to be checked
 * before switching FBR (and the environment) on for real.
 */
export async function loadFbrReadiness(): Promise<FbrReadiness | null> {
  try {
    const supabase = await createClient();
    const [profile, heartbeat, notReady, lists, failed, unknown] = await Promise.all([
      supabase.from("business_profile").select("fbr_environment").maybeSingle(),
      supabase.from("fbr_heartbeat").select("last_seen").maybeSingle(),
      supabase
        .from("inventory")
        .select("id", { count: "exact", head: true })
        .eq("is_taxable", true)
        .or("hs_code.is.null,fbr_rate_desc.is.null"),
      supabase.from("fbr_reference").select("kind", { count: "exact", head: true }).eq("kind", "province"),
      supabase.from("fbr_invoices").select("invoice_id", { count: "exact", head: true }).eq("fbr_status", "failed"),
      supabase.from("fbr_invoices").select("invoice_id", { count: "exact", head: true }).eq("fbr_status", "unknown"),
    ]);
    return {
      environment: profile.data?.fbr_environment === "production" ? "production" : "sandbox",
      itemsNotReady: notReady.count ?? 0,
      listsLoaded: (lists.count ?? 0) > 0,
      failedCount: failed.count ?? 0,
      unknownCount: unknown.count ?? 0,
      senderSeenRecently: !_isSenderOffline((heartbeat.data?.last_seen as string | null) ?? null),
    };
  } catch {
    return null;
  }
}
