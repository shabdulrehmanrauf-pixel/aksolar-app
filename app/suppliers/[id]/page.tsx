import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LedgerRow, PurchaseInvoice, Supplier, SupplierBalance } from "@/lib/types";
import SupplierLedger from "./SupplierLedger";

export const metadata: Metadata = { title: "Supplier" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [supplier, others, ledger, purchases] = await Promise.all([
    supabase.from("supplier_balances").select("*").eq("id", id).maybeSingle(),
    supabase.from("distributors").select("id,name").neq("id", id),
    supabase.from("supplier_ledger").select("*").eq("supplier_id", id).order("event_date").order("event_created_at"),
    supabase
      .from("purchase_balances")
      .select("*")
      .eq("supplier_id", id)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (supplier.error || !supplier.data) notFound();

  return (
    <SupplierLedger
      supplier={supplier.data as SupplierBalance}
      others={(others.data ?? []) as Pick<Supplier, "id" | "name">[]}
      ledger={((ledger.data ?? []) as LedgerRow[]).reverse()}
      ledgerReady={!ledger.error}
      purchases={(purchases.data ?? []) as PurchaseInvoice[]}
      purchasesReady={!purchases.error}
    />
  );
}
