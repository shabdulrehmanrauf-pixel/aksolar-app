import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/types";
import SalesClient from "./SalesClient";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoice_balances")
    .select("*")
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);

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

  return <SalesClient invoices={(data ?? []) as Invoice[]} initialFilter={filter === "due" ? "due" : "all"} />;
}
