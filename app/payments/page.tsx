import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { PaymentDetails, PurchaseInvoice, SupplierBalance } from "@/lib/types";
import PaymentsClient from "./PaymentsClient";

export const metadata: Metadata = { title: "Payments" };

type Tab = "payments" | "purchases" | "suppliers";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab: Tab = tab === "purchases" || tab === "suppliers" ? tab : "payments";

  const supabase = await createClient();
  const [payments, purchases, suppliers, allSuppliers] = await Promise.all([
    supabase.from("payment_details").select("*").order("paid_at", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    supabase
      .from("purchase_balances")
      .select("*")
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("supplier_balances").select("*").eq("is_active", true).order("name"),
    supabase.from("distributors").select("id,name"),
  ]);

  if (payments.error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Payments could not be loaded</h1>
        <p className="mt-3 text-lead">
          Open Supabase, go to SQL Editor, and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">13_supplier_payments.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {payments.error.message}</p>
      </div>
    );
  }

  const supplierNames = Object.fromEntries((allSuppliers.data ?? []).map((s) => [s.id, s.name as string]));

  return (
    <PaymentsClient
      payments={(payments.data ?? []) as PaymentDetails[]}
      purchases={(purchases.data ?? []) as PurchaseInvoice[]}
      suppliers={(suppliers.data ?? []) as SupplierBalance[]}
      supplierNames={supplierNames}
      initialTab={initialTab}
    />
  );
}
