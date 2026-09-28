import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/types";
import { loadFbrStatuses } from "@/lib/fbrStatusLoad";
import SalesClient, { type ChargingSaleRow, type ClaimSaleRow } from "./SalesClient";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const supabase = await createClient();
  const [invRes, chargingRes, claimRes, fbrByInvoice] = await Promise.all([
    supabase
      .from("invoice_balances")
      .select("*")
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    // Every charging slip is a sale, whatever its status -- the price is quoted at intake.
    supabase
      .from("charging_jobs")
      .select("id,slip_number,customer_name,customer_phone,price,received_date,status")
      .order("received_date", { ascending: false })
      .limit(1000),
    // Only claims where the customer was actually charged something (acid, service etc.) count as a sale.
    supabase
      .from("battery_claims")
      .select("id,claim_number,customer_name,customer_phone,extra_charges,received_date,status")
      .gt("extra_charges", 0)
      .order("received_date", { ascending: false })
      .limit(1000),
    // FBR status per bill (D5a). Never fails the page: if the FBR tables are missing this is just empty.
    loadFbrStatuses(),
  ]);
  const { data, error } = invRes;

  if (error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Sales could not be loaded</h1>
        <p className="mt-3 text-lead">
          The app is connected, but Supabase did not return the bills. The most common reason is that the invoicing
          tables have not been created yet. Open Supabase, go to SQL Editor, and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">03_invoices.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {error.message}</p>
      </div>
    );
  }

  // Battery-services tables are optional (06_battery_services.sql) -- if they're not set up yet
  // (or the request fails for any other reason), just show bills as before rather than breaking
  // the whole Sales page over it.
  const chargingJobs = (chargingRes.data ?? []) as ChargingSaleRow[];
  const batteryClaims = (claimRes.data ?? []) as ClaimSaleRow[];

  return (
    <SalesClient
      invoices={(data ?? []) as Invoice[]}
      chargingJobs={chargingJobs}
      batteryClaims={batteryClaims}
      fbrByInvoice={fbrByInvoice}
      initialFilter={filter === "due" ? "due" : "all"}
    />
  );
}
