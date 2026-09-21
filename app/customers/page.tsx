import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import CustomersClient from "./CustomersClient";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Customers could not be loaded</h1>
        <p className="mt-3 text-lead">
          The app is connected, but Supabase did not return the customer list. The most common
          reason is that the database table has not been created yet. Open Supabase, go to SQL
          Editor, and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">02_customers.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {error.message}</p>
      </div>
    );
  }

  return <CustomersClient customers={(data ?? []) as Customer[]} />;
}
