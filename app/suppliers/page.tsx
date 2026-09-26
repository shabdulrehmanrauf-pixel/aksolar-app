import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { SupplierBalance } from "@/lib/types";
import SuppliersClient from "./SuppliersClient";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_balances")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Suppliers could not be loaded</h1>
        <p className="mt-3 text-lead">
          The app is connected, but Supabase did not return the supplier list. The most common
          reason is that the purchases tables have not been created yet. Open Supabase, go to SQL
          Editor, and run <code className="rounded bg-plate px-1.5 py-0.5 text-casing">12_suppliers_purchases.sql</code>{" "}
          then <code className="rounded bg-plate px-1.5 py-0.5 text-casing">12b_supplier_save.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {error.message}</p>
      </div>
    );
  }

  return <SuppliersClient suppliers={(data ?? []) as SupplierBalance[]} />;
}
