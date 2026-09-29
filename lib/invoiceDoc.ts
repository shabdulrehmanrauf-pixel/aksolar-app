import { createClient } from "@/lib/supabase/server";
import { loadFbrPrint } from "@/lib/fbrPrintLoad";
import type { FbrPrintData } from "@/lib/fbrPrint";
import type { BusinessProfile, Invoice, InvoiceItem, Payment } from "@/lib/types";

export type InvoiceDocument = {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
  seller: BusinessProfile;
  /** FBR particulars. null or missing = not an FBR bill (prints and shares as before). */
  fbr?: FbrPrintData | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_SELLER: BusinessProfile = {
  business_name: "Al Karam Batteries & Solar",
  ntn: null,
  address: "Shop#13 Blessing Centre, Plot Number SB 45, Block K, North Nazimabad, Karachi",
  province: "Sindh",
  phone: "03453177965",
};

/** Loads one bill with its lines, payments and the shop's own details. Returns null if it does not exist. Server only. */
export async function loadInvoiceDocument(id: string): Promise<InvoiceDocument | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [inv, items, pays, seller, fbr] = await Promise.all([
    supabase.from("invoice_balances").select("*").eq("id", id).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at").order("description"),
    supabase.from("payments").select("*").eq("invoice_id", id).order("paid_at"),
    supabase.from("business_profile").select("business_name,ntn,address,province,phone").maybeSingle(),
    loadFbrPrint(id),
  ]);
  if (inv.error || !inv.data) return null;
  return {
    invoice: inv.data as Invoice,
    items: (items.data ?? []) as InvoiceItem[],
    payments: (pays.data ?? []) as Payment[],
    seller: (seller.data as BusinessProfile | null) ?? DEFAULT_SELLER,
    fbr,
  };
}
