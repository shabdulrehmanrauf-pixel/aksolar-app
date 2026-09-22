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
