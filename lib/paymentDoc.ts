import { createClient } from "@/lib/supabase/server";
import type { BusinessProfile, PurchaseInvoice, Supplier, SupplierPayment } from "@/lib/types";
import { DEFAULT_SELLER } from "@/lib/invoiceDoc";

export type PaymentDocument = {
  payment: SupplierPayment;
  supplier: Supplier;
  purchase: PurchaseInvoice | null; // null = on-account payment, not tied to one bill
  seller: BusinessProfile;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads one supplier payment with the supplier's own details, the bill it was made against (if any),
 * and the seller's business profile for the voucher print. Returns null if it does not exist. Server only. */
export async function loadPaymentDocument(id: string): Promise<PaymentDocument | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const payment = await supabase.from("supplier_payments").select("*").eq("id", id).maybeSingle();
  if (payment.error || !payment.data) return null;

  const row = payment.data as SupplierPayment;
  const [supplier, purchase, seller] = await Promise.all([
    supabase.from("distributors").select("*").eq("id", row.supplier_id).maybeSingle(),
    row.purchase_id
      ? supabase.from("purchase_balances").select("*").eq("id", row.purchase_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("business_profile").select("business_name,ntn,address,province,phone").maybeSingle(),
  ]);
  if (!supplier.data) return null;

  return {
    payment: row,
    supplier: supplier.data as Supplier,
    purchase: (purchase.data as PurchaseInvoice | null) ?? null,
    seller: (seller.data as BusinessProfile | null) ?? DEFAULT_SELLER,
  };
}
