import { createClient } from "@/lib/supabase/server";
import type { BusinessProfile, PurchaseInvoice, PurchaseItem, Supplier, SupplierPayment } from "@/lib/types";
import { DEFAULT_SELLER } from "@/lib/invoiceDoc";

export type PurchaseDocument = {
  purchase: PurchaseInvoice;
  items: PurchaseItem[];
  payments: SupplierPayment[];
  supplier: Supplier;
  seller: BusinessProfile;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads one purchase bill with its lines, any payment made at save time, and the supplier's own
 * details. Returns null if it does not exist. Server only. */
export async function loadPurchaseDocument(id: string): Promise<PurchaseDocument | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const purchase = await supabase.from("purchase_balances").select("*").eq("id", id).maybeSingle();
  if (purchase.error || !purchase.data) return null;

  const [items, pays, supplier, seller] = await Promise.all([
    supabase.from("purchase_items").select("*").eq("purchase_id", id).order("created_at"),
    supabase.from("supplier_payments").select("*").eq("purchase_id", id).order("paid_at"),
    supabase.from("distributors").select("*").eq("id", (purchase.data as PurchaseInvoice).supplier_id).maybeSingle(),
    supabase.from("business_profile").select("business_name,ntn,address,province,phone").maybeSingle(),
  ]);
  if (!supplier.data) return null;

  return {
    purchase: purchase.data as PurchaseInvoice,
    items: (items.data ?? []) as PurchaseItem[],
    payments: (pays.data ?? []) as SupplierPayment[],
    supplier: supplier.data as Supplier,
    seller: (seller.data as BusinessProfile | null) ?? DEFAULT_SELLER,
  };
}
