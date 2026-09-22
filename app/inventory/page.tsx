import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";
import BatteryStockCard from "./BatteryStockCard";
import InventoryClient from "./InventoryClient";

export const metadata: Metadata = { title: "Inventory" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  // Links from Home and the search box: /inventory?filter=low and /inventory?q=Osaka
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const lowOnly = sp.filter === "low";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .order("brand", { ascending: true })
    .order("model", { ascending: true });

  if (error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Inventory could not be loaded</h1>
        <p className="mt-3 text-lead">
          The app is connected, but Supabase did not return the stock list. The
          most common reason is that the database table has not been created
          yet. Open Supabase, go to SQL Editor, and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">
            01_inventory.sql
          </code>
          .
        </p>
        <p className="mt-3 text-sm text-lead">Details: {error.message}</p>
      </div>
    );
  }

  return (
    <InventoryClient
      // A new key makes the list start fresh when a link changes the search or the filter.
      key={`${q}|${lowOnly}`}
      items={(data ?? []) as InventoryItem[]}
      initialQuery={q}
      initialLow={lowOnly}
      banner={<BatteryStockCard />}
    />
  );
}
