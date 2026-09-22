import Link from "next/link";
import Icon from "@/components/Icons";
import { createClient } from "@/lib/supabase/server";

type StockSummaryRow = { kind: "charging" | "claim"; status: string; count: number };
type ByDistributorRow = { distributor_id: string; distributor_name: string; status: string; count: number };

/** Small "batteries currently in the shop" card, reading the battery_stock_summary and
 * battery_claims_by_distributor views from 06_battery_services.sql. Shown only once that
 * migration has been run and there is something to show. */
export default async function BatteryStockCard() {
  const supabase = await createClient();
  const [summaryRes, byDistRes] = await Promise.all([
    supabase.from("battery_stock_summary").select("*"),
    supabase.from("battery_claims_by_distributor").select("*"),
  ]);

  if (summaryRes.error) return null; // 06_battery_services.sql not run yet -- say nothing here, Battery services explains it

  const rows = (summaryRes.data ?? []) as StockSummaryRow[];
  const byDistributor = (byDistRes.data ?? []) as ByDistributorRow[];

  const charging = rows.filter((r) => r.kind === "charging").reduce((s, r) => s + r.count, 0);
  const claims = rows.filter((r) => r.kind === "claim").reduce((s, r) => s + r.count, 0);

  if (charging === 0 && claims === 0) return null;

  return (
    <Link
      href="/battery-services"
      className="card card-hover anim-rise flex flex-wrap items-center gap-4 p-4"
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-focus/10 text-focus">
        <Icon name="plug" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Batteries currently in the shop</span>
        <span className="block text-sm text-lead">
          {charging} in for charging · {claims} on warranty claim
          {byDistributor.length > 0 &&
            ` (${byDistributor.map((d) => `${d.count} with ${d.distributor_name}`).join(", ")})`}
        </span>
      </span>
      <Icon name="chevron" className="h-4 w-4 text-lead/60" />
    </Link>
  );
}
