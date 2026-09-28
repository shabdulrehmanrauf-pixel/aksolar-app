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
  // FBR tax setup (phase D1/D3). Optional: rows cached before the database upgrade do not have them.
  sale_type?: string | null;
  fbr_rate_desc?: string | null;
  is_taxable?: boolean | null;
  retail_price?: number | null;
  sro_schedule_no?: string | null;
  sro_item_serial_no?: string | null;
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
  province?: string | null; // exact FBR province name (phase D1/D3)
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

/* ---------- Suppliers & Purchases (Phase F1) ---------- */
/* "Supplier" is the shop-facing word for a row in the same `distributors` table Battery claims already
 * uses (decision D1) -- extended with the columns below. `Distributor` above stays as-is so existing
 * Battery claims code keeps working unchanged; use `Supplier` for anything in Suppliers/Purchases. */

export type SupplierPaymentMethod = "cash" | "cheque" | "online" | "easypaisa" | "jazzcash";
export type ChequeStatus = "issued" | "cleared" | "bounced";
export type PurchaseStatus = "Valid" | "Cancelled";

export type Supplier = Distributor & {
  ntn_or_cnic: string | null;
  opening_balance: number;              // positive = we owed them as of the date below
  opening_balance_date: string | null;  // YYYY-MM-DD
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** One row of the `supplier_balances` view. Powers the Suppliers list and the "Total we owe" figure. */
export type SupplierBalance = Supplier & {
  total_bought: number;
  total_paid: number;
  balance: number; // positive = we owe them, negative = they owe us (advance)
  last_purchase_date: string | null;
  last_payment_date: string | null;
};

/** One row of the `purchase_balances` view: the purchase bill plus what has been paid and what is still due. */
export type PurchaseInvoice = {
  id: string;
  purchase_number: string;      // PB-000001
  supplier_id: string;
  supplier_invoice_number: string | null;
  invoice_date: string;         // YYYY-MM-DD
  subtotal: number;
  discount: number;
  freight: number;
  total_value: number;
  note: string | null;
  status: PurchaseStatus;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  paid_total: number;
  due_total: number;
  payment_tag: "Paid" | "Part paid" | "Unpaid";
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  inventory_id: string;
  description: string;  // snapshot of brand/model/specs at the time of purchase
  quantity: number;
  unit_cost: number;
  line_total: number;
  created_at: string;
};

/** A row in `supplier_payments`. The table is created in F1 (create_purchase writes to it for
 * "paid now" purchases); the Payments screen and record/cancel functions arrive in F2. */
export type SupplierPayment = {
  id: string;
  payment_number: string;       // SP-000001
  supplier_id: string;
  purchase_id: string | null;   // null = on-account, not tied to one bill
  amount: number;
  method: SupplierPaymentMethod;
  paid_at: string;              // YYYY-MM-DD
  reference: string | null;
  cheque_number: string | null;
  cheque_date: string | null;
  bank_name: string | null;
  cheque_status: ChequeStatus | null;
  note: string | null;
  status: PurchaseStatus;
  cancel_reason: string | null;
  created_at: string;
};

/** One row of the `payment_details` view (Phase F2): a supplier payment with the supplier's name and,
 * if it was made against one specific bill, that bill's number, already joined in. */
export type PaymentDetails = SupplierPayment & {
  supplier_name: string;
  purchase_number: string | null;
};

export type LedgerEntryType = "opening" | "purchase" | "payment";

/** One row of the `supplier_ledger` view: an opening balance, a purchase bill, or a payment, in date
 * order with a running balance. Positive amount/balance = we owe the supplier. */
export type LedgerRow = {
  supplier_id: string;
  event_date: string;        // YYYY-MM-DD
  event_created_at: string;
  entry_type: LedgerEntryType;
  entry_label: string;       // "Opening balance" / "Purchase bill" / "Payment - Cash" etc.
  reference: string | null;  // e.g. "PB-000012 / Supplier inv 8841" or "SP-000031"
  ref_id: string | null;
  amount: number;            // signed: + bought, - paid
  running_balance: number;
};

/* ---------- Expenses (Phase F3) ---------- */
/* Expenses share their payment-method list with supplier payments (decision D2) -- see
 * SupplierPaymentMethod above and SUPPLIER_PAYMENT_METHODS in lib/purchases.ts, reused as-is. */

export type ExpenseStatus = "Valid" | "Cancelled";

/** One row of `expense_categories` (decision D11's seeded list). `excluded_from_profit` is true only
 * for "Owner withdrawal" -- it counts in the cash book but not in Net profit, once F4 builds those. */
export type ExpenseCategory = {
  id: string;
  name: string;
  sort_order: number;
  excluded_from_profit: boolean;
  is_active: boolean;
  created_at: string;
};

export type Expense = {
  id: string;
  expense_number: string;       // EX-000001
  category_id: string;
  amount: number;
  expense_date: string;         // YYYY-MM-DD
  method: SupplierPaymentMethod;
  paid_to: string | null;
  reference: string | null;
  cheque_number: string | null;
  cheque_date: string | null;
  bank_name: string | null;
  note: string | null;
  status: ExpenseStatus;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** One row of the `expense_details` view: an expense with its category's name and profit flag joined in. */
export type ExpenseDetails = Expense & {
  category_name: string;
  excluded_from_profit: boolean;
};

export type StockMovementReason = "opening" | "purchase" | "purchase_cancel" | "adjustment" | "sale";

/** A row in `stock_movements` (decision D6): the audit trail behind every quantity change. */
export type StockMovement = {
  id: string;
  inventory_id: string;
  change: number; // +/-
  reason: StockMovementReason;
  ref_table: string | null;
  ref_id: string | null;
  note: string | null;
  created_at: string;
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

/* ---------- Scrap batteries: old batteries taken in exchange, sold in bulk by weight (Phase 7) ---------- */
/* See supabase/07_scrap_battery.sql. Not resaleable stock -- kept separate from public.inventory. */

export type ScrapBatteryStatus = "in_stock" | "sold";

/** One old battery taken in, either as part of a bill's exchange (see NewBill.tsx) or added by hand. */
export type ScrapBatteryInventory = {
  id: string;
  intake_number: string;
  invoice_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  brand: string;
  model: string;
  battery_type: string | null;
  battery_number: string | null;
  quantity: number;
  estimated_weight_kg: number | null;
  note: string | null;
  status: ScrapBatteryStatus;
  received_date: string; // YYYY-MM-DD
  sold_in_sale_id: string | null;
  created_at: string;
};

/** One bulk, weighed sale of scrap batteries to a scrap/kabari buyer. */
export type ScrapBatterySale = {
  id: string;
  sale_number: string;
  buyer_name: string;
  buyer_phone: string | null;
  total_weight_kg: number;
  rate_per_kg: number;
  total_amount: number; // computed = total_weight_kg * rate_per_kg
  sale_date: string; // YYYY-MM-DD
  note: string | null;
  created_at: string;
};

/** One row from the public.scrap_stock_summary view: what's on hand right now. */
export type ScrapStockSummary = {
  batches_in_stock: number;
  batteries_in_stock: number;
  estimated_weight_in_stock_kg: number;
  batches_sold: number;
  batteries_sold: number;
};
