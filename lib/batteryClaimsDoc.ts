import { createClient } from "@/lib/supabase/server";
import type { BatteryClaim, BusinessProfile, Distributor, Invoice } from "@/lib/types";
import { DEFAULT_SELLER } from "@/lib/invoiceDoc";

export type ClaimSlipDocument = {
  claim: BatteryClaim;
  distributor: Distributor | null;
  originalInvoice: Pick<Invoice, "id" | "invoice_number" | "invoice_date"> | null;
  seller: BusinessProfile;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads one battery claim slip, its distributor and original bill (if any). Returns null if it does not exist. Server only. */
export async function loadClaimSlipDocument(id: string): Promise<ClaimSlipDocument | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [claimRes, seller] = await Promise.all([
    supabase.from("battery_claims").select("*").eq("id", id).maybeSingle(),
    supabase.from("business_profile").select("business_name,ntn,address,province,phone").maybeSingle(),
  ]);
  if (claimRes.error || !claimRes.data) return null;
  const claim = claimRes.data as BatteryClaim;

  const [distRes, invRes] = await Promise.all([
    claim.distributor_id
      ? supabase.from("distributors").select("*").eq("id", claim.distributor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    claim.original_invoice_id
      ? supabase.from("invoices").select("id,invoice_number,invoice_date").eq("id", claim.original_invoice_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    claim,
    distributor: (distRes.data as Distributor | null) ?? null,
    originalInvoice: (invRes.data as Pick<Invoice, "id" | "invoice_number" | "invoice_date"> | null) ?? null,
    seller: (seller.data as BusinessProfile | null) ?? DEFAULT_SELLER,
  };
}
