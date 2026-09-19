import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";
import InventoryClient from "./InventoryClient";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .order("brand", { ascending: true })
    .order("model", { ascending: true });

  if (error) {
    return (
      <div className="max-w-xl rounded-lg border border-terminal/40 bg-white p-6">
        <h1 className="font-display text-3xl font-bold">
          Inventory could not be loaded
        </h1>
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

  return <InventoryClient items={(data ?? []) as InventoryItem[]} />;
}
