import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type {
  BatteryClaim,
  ChargingJob,
  ChargingPriceListItem,
  Customer,
  Distributor,
} from "@/lib/types";
import BatteryServicesClient from "./BatteryServicesClient";

export const metadata: Metadata = { title: "Battery services" };

export default async function BatteryServicesPage() {
  const supabase = await createClient();
  const [jobsRes, claimsRes, distRes, priceRes, custRes] = await Promise.all([
    supabase.from("charging_jobs").select("*").order("received_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("battery_claims").select("*").order("received_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("distributors").select("*").order("name"),
    supabase.from("charging_price_list").select("*").order("price"),
    supabase.from("customers").select("id,name,phone").order("name"),
  ]);

  if (jobsRes.error && claimsRes.error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Battery services could not be loaded</h1>
        <p className="mt-3 text-lead">
          The app is connected, but Supabase did not return charging jobs or battery claims. Open
          Supabase, go to SQL Editor, and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">06_battery_services.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">
          Details: {jobsRes.error?.message ?? claimsRes.error?.message}
        </p>
      </div>
    );
  }

  return (
    <BatteryServicesClient
      jobs={(jobsRes.data ?? []) as ChargingJob[]}
      claims={(claimsRes.data ?? []) as BatteryClaim[]}
      distributors={(distRes.data ?? []) as Distributor[]}
      priceList={(priceRes.data ?? []) as ChargingPriceListItem[]}
      customers={(custRes.data ?? []) as Pick<Customer, "id" | "name" | "phone">[]}
      setupIncomplete={!!jobsRes.error || !!claimsRes.error}
    />
  );
}
