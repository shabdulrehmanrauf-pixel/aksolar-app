import { createClient } from "@/lib/supabase/server";
import type { BusinessProfile, ScrapBatteryInventory, ScrapBatterySale } from "@/lib/types";
import { DEFAULT_SELLER } from "@/lib/invoiceDoc";

export type ScrapSaleSlipDocument = {
  sale: ScrapBatterySale;
  batteries: ScrapBatteryInventory[];
  seller: BusinessProfile;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads one scrap sale slip: the sale itself, the batteries sold in that lot, and the shop's own details. Returns null if it does not exist. Server only. */
export async function loadScrapSaleSlipDocument(id: string): Promise<ScrapSaleSlipDocument | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [saleRes, seller] = await Promise.all([
    supabase.from("scrap_battery_sales").select("*").eq("id", id).maybeSingle(),
    supabase.from("business_profile").select("business_name,ntn,address,province,phone").maybeSingle(),
  ]);
  if (saleRes.error || !saleRes.data) return null;
  const sale = saleRes.data as ScrapBatterySale;

  const batteriesRes = await supabase
    .from("scrap_battery_inventory")
    .select("*")
    .eq("sold_in_sale_id", id)
    .order("intake_number");

  return {
    sale,
    batteries: (batteriesRes.data ?? []) as ScrapBatteryInventory[],
    seller: (seller.data as BusinessProfile | null) ?? DEFAULT_SELLER,
  };
}
