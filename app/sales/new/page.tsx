import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import type { BillProposal } from "@/lib/ai/proposalTypes";
import NewBill, { type BillCustomer, type BillDraft, type BillItem } from "./NewBill";

export const metadata: Metadata = { title: "New bill" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ customer?: string; ai?: string }> }) {
  const { customer, ai } = await searchParams;
  const supabase = await createClient();

  const [inventory, customers] = await Promise.all([
    supabase
      .from("inventory")
      .select("id,category,brand,model,type,voltage,plates,ah_rating,wattage,warranty_months,cost_price,sale_price,quantity,hs_code,uom,sale_type,fbr_rate_desc,is_taxable,retail_price,sro_schedule_no,sro_item_serial_no")
      .order("brand")
      .order("model"),
    supabase.from("customers").select("id,name,phone,registration_type,cnic_or_ntn,province,address").order("name"),
  ]);

  if (inventory.error || customers.error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">The bill screen could not be loaded</h1>
        <p className="mt-3 text-lead">
          Stock or customers did not load. Open Inventory and Customers to check they work, then try again.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {(inventory.error ?? customers.error)?.message}</p>
      </div>
    );
  }

  const people = (customers.data ?? []) as (Pick<Customer, "id" | "name" | "phone" | "registration_type" | "cnic_or_ntn" | "province" | "address">)[];
  let initialCustomerId = customer && UUID.test(customer) && people.some((p) => p.id === customer) ? customer : null;

  // Opened from the assistant's "Edit" button: fill the normal screen with what it prepared.
  // The row is read with the signed-in user's session, so only their own proposals load.
  let draft: BillDraft | null = null;
  if (ai && UUID.test(ai)) {
    const { data: action } = await supabase
      .from("ai_actions")
      .select("kind,status,proposal")
      .eq("id", ai)
      .maybeSingle();
    if (action && action.kind === "create_bill" && (action.status === "edited" || action.status === "proposed")) {
      const p = action.proposal as BillProposal;
      const stockIds = new Set((inventory.data ?? []).map((s) => s.id as string));
      if (p.customer.id && people.some((c) => c.id === p.customer.id)) initialCustomerId = p.customer.id;
      draft = {
        walkinName: p.customer.id || p.customer.name === "Walk-in customer" ? "" : p.customer.name,
        note: p.note ?? "",
        lines: p.lines.filter((l) => stockIds.has(l.itemId)).map((l) => ({ itemId: l.itemId, qty: String(l.qty), rate: String(l.rate) })),
        mode: p.mode,
        partText: p.mode === "part" ? String(p.paid) : "",
        method: p.method,
      };
    }
  }

  return (
    <NewBill
      stock={(inventory.data ?? []) as unknown as BillItem[]}
      customers={people as BillCustomer[]}
      initialCustomerId={initialCustomerId}
      initialDraft={draft}
    />
  );
}

