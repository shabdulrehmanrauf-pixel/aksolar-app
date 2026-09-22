export type Category = "battery" | "panel" | "accessory";

export type InventoryItem = {
  id: string;
  category: Category;
  brand: string;
  model: string;
  type: string | null;
  voltage: number | null;
  plates: number | null;
  ah_rating: number | null;
  wattage: number | null;
  warranty_months: number | null;
  cost_price: number;
  sale_price: number;
  quantity: number;
  reorder_level: number;
  hs_code: string | null;
  uom: string;
  created_at: string;
  updated_at: string;
};

export type RegistrationType = "Registered" | "Unregistered";

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  registration_type: RegistrationType;
  cnic_or_ntn: string | null;
  created_at: string;
  updated_at: string;
};

/* ---------- Invoicing (Phase 3) ---------- */

export type PaymentMethod = "cash" | "bank" | "other";
export type PaymentStatus = "Paid" | "Partial" | "Credit";
export type InvoiceStatus = "Valid" | "Cancelled" | "Edited";

/** One row of the invoice_balances view: the invoice plus what has been paid and what is still due. */
export type Invoice = {
  id: string;
  invoice_number: string;
  invoice_type: "Sale Invoice" | "Debit Note";
  invoice_date: string; // YYYY-MM-DD
  customer_id: string | null;
  buyer_name: string;
  buyer_registration_type: RegistrationType;
  buyer_cnic_or_ntn: string | null;
  buyer_address: string | null;
  buyer_phone: string | null;
  note: string | null;
  total_value: number;
  status: InvoiceStatus;
  payment_status: PaymentStatus;
  created_at: string;
  paid_total: number;
  due_total: number;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  inventory_id: string;
  description: string;
  hs_code: string | null;
  uom: string;
  quantity: number;
  rate: number;
  value_excl_tax: number;
  sales_tax: number;
  total: number;
};

export type Payment = {
  id: string;
  invoice_id: string;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  note: string | null;
};

export type BusinessProfile = {
  business_name: string;
  ntn: string | null;
  address: string | null;
  province: string | null;
  phone: string | null;
};

/* ---------- Battery charging slips + battery claims (Phase 6) ---------- */
/* Neither of these is an FBR document. They are shop-only slips, kept out of public.invoices. */

export type Distributor = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
};

/** One row of the suggested-price list shown when starting a new charging job. Always editable per slip. */
export type ChargingPriceListItem = {
  id: string;
  label: string;
  price: number;
};

export type ChargingJobStatus = "in_shop" | "collected" | "unclaimed";

/** Whether the battery came back working, or turned out to be faulty, once
 * charged. Only set once the job is handed back (status "collected"). */
export type ChargingOutcome = "charged" | "faulty";

/** A customer's own battery, dropped off to be charged. */
export type ChargingJob = {
  id: string;
  slip_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  battery_brand: string;
  battery_model: string;
  battery_number: string | null;
  price: number;
  note: string | null;
  received_date: string; // YYYY-MM-DD
  due_date: string;      // received_date + 3 days
  status: ChargingJobStatus;
  collected_at: string | null;
  created_at: string;
  // Set by record_charging_handover (07_charging_handover.sql) when the
  // battery is handed back to the customer.
  outcome: ChargingOutcome | null;
  handover_amount: number | null;
  handover_note: string | null;
};

export type BatteryClaimStatus =
  | "received"            // taken in from the customer
  | "sent_to_distributor" // sent off for warranty inspection
  | "approved"            // distributor accepted the claim
  | "rejected"            // distributor declined the claim
  | "given_to_customer"   // replacement handed over, customer's slip collected back
  | "settled";            // we have recovered the claim from the distributor

/** A battery bought from us, sent back to its distributor under warranty. */
export type BatteryClaim = {
  id: string;
  claim_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  battery_brand: string;
  battery_model: string;
  battery_number: string | null;
  original_invoice_id: string | null;
  distributor_id: string | null;
  claim_amount: number | null;    // value of the replacement, recovered from the distributor
  extra_charges: number | null;   // optional: acid, service charges etc, collected from the customer directly
  note: string | null;
  status: BatteryClaimStatus;
  received_date: string;
  sent_to_distributor_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  given_to_customer_at: string | null;
  settled_at: string | null;
  created_at: string;
};
