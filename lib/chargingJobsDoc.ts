import { createClient } from "@/lib/supabase/server";
import type { BusinessProfile, ChargingJob } from "@/lib/types";
import { DEFAULT_SELLER } from "@/lib/invoiceDoc";

export type ChargingSlipDocument = {
  job: ChargingJob;
  seller: BusinessProfile;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads one charging slip and the shop's own details. Returns null if it does not exist. Server only. */
export async function loadChargingSlipDocument(id: string): Promise<ChargingSlipDocument | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [job, seller] = await Promise.all([
    supabase.from("charging_jobs").select("*").eq("id", id).maybeSingle(),
    supabase.from("business_profile").select("business_name,ntn,address,province,phone").maybeSingle(),
  ]);
  if (job.error || !job.data) return null;
  return {
    job: job.data as ChargingJob,
    seller: (seller.data as BusinessProfile | null) ?? DEFAULT_SELLER,
  };
}
