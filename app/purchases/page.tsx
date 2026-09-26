import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { PurchaseInvoice } from "@/lib/types";
import PurchasesClient from "./PurchasesClient";

export const metadata: Metadata = { title: "Purchases" };

type Filter = "all" | "due" | "paid";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const initialFilter: Filter = filter === "due" || filter === "paid" ? filter : "all";

  const supabase = await createClient();
  const [purchases, suppliers] = await Promise.all([
    supabase
      .from("purchase_balances")
      .select("*")
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("distributors").select("id,name"),
  ]);

  if (purchases.error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Purchases could not be loaded</h1>
        <p className="mt-3 text-lead">
          Open Supabase, go to SQL Editor, and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">12_suppliers_purchases.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {purchases.error.message}</p>
      </div>
    );
  }

  const supplierNames = Object.fromEntries((suppliers.data ?? []).map((s) => [s.id, s.name as string]));

  return (
    <PurchasesClient
      purchases={(purchases.data ?? []) as PurchaseInvoice[]}
      supplierNames={supplierNames}
      initialFilter={initialFilter}
    />
  );
}
