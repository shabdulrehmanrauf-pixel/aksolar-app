import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import CustomerProfile, { type CustomerBill } from "./CustomerProfile";

export const metadata: Metadata = { title: "Customer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [customer, others, bills] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("customers").select("id,name,phone").neq("id", id).not("phone", "is", null),
    supabase
      .from("invoice_balances")
      .select("id,invoice_number,invoice_date,total_value,paid_total,due_total,payment_status,status")
      .eq("customer_id", id)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (customer.error || !customer.data) notFound();

  return (
    <CustomerProfile
      customer={customer.data as Customer}
      others={(others.data ?? []) as Pick<Customer, "id" | "name" | "phone">[]}
      bills={(bills.data ?? []) as CustomerBill[]}
      billsReady={!bills.error}
    />
  );
}
