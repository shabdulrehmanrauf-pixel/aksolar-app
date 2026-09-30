import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/types";
import UdhaarClient from "./UdhaarClient";

export const metadata: Metadata = { title: "Udhaar" };

export default async function UdhaarPage() {
  const supabase = await createClient();
  // Only bills that are not cancelled and still have money due. Oldest bill first.
  const [{ data, error }, customersRes] = await Promise.all([
    supabase
    .from("invoice_balances")
    .select("*")
    .neq("status", "Cancelled")
    .gt("due_total", 0)
    .order("invoice_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(2000),
    // Saved customers, for the "Add udhaar" form.
    supabase.from("customers").select("id,name,phone").order("name", { ascending: true }).limit(3000),
  ]);

  if (error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Udhaar could not be loaded</h1>
        <p className="mt-3 text-lead">
          The app is connected, but Supabase did not return the bills. Open Supabase, go to SQL Editor, and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">03_invoices.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {error.message}</p>
      </div>
    );
  }

  return <UdhaarClient
      serverInvoices={(data ?? []) as Invoice[]}
      customers={(customersRes.data ?? []) as { id: string; name: string; phone: string | null }[]}
    />;
}
