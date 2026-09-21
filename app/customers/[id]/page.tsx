import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import CustomerProfile from "./CustomerProfile";

export const metadata: Metadata = { title: "Customer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [customer, others] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("customers").select("id,name,phone").neq("id", id).not("phone", "is", null),
  ]);

  if (customer.error || !customer.data) notFound();

  return (
    <CustomerProfile
      customer={customer.data as Customer}
      others={(others.data ?? []) as Pick<Customer, "id" | "name" | "phone">[]}
    />
  );
}
