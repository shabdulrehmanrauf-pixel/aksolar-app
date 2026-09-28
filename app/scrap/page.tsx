import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canOpen } from "@/lib/roles";
import { loadRoleInfo } from "@/lib/rolesServer";
import type { ScrapBatteryInventory, ScrapBatterySale } from "@/lib/types";
import ScrapClient from "./ScrapClient";

export const metadata: Metadata = { title: "Scrap" };

export default async function ScrapPage() {
  if (!canOpen(await loadRoleInfo(), "/scrap")) redirect("/");
  const supabase = await createClient();
  const [stockRes, salesRes, soldRes] = await Promise.all([
    supabase
      .from("scrap_battery_inventory")
      .select("*")
      .eq("status", "in_stock")
      .order("received_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("scrap_battery_sales")
      .select("*")
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    // Sold batteries, fetched so each sale row can expand to show exactly which batteries were in that lot.
    supabase
      .from("scrap_battery_inventory")
      .select("*")
      .eq("status", "sold")
      .order("intake_number"),
  ]);

  if (stockRes.error && salesRes.error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Scrap could not be loaded</h1>
        <p className="mt-3 text-lead">
          The app is connected, but Supabase did not return the scrap battery data. Open Supabase, go to SQL
          Editor, and run <code className="rounded bg-plate px-1.5 py-0.5 text-casing">07_scrap_battery.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {stockRes.error?.message ?? salesRes.error?.message}</p>
      </div>
    );
  }

  return (
    <ScrapClient
      stock={(stockRes.data ?? []) as ScrapBatteryInventory[]}
      sales={(salesRes.data ?? []) as ScrapBatterySale[]}
      soldBatteries={(soldRes.data ?? []) as ScrapBatteryInventory[]}
      setupIncomplete={!!stockRes.error || !!salesRes.error}
    />
  );
}
