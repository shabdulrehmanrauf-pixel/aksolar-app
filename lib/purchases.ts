import type { PurchaseInvoice, SupplierPaymentMethod } from "./types";
import { round2, parseAmount, parseQty, todayKarachi, formatDay } from "./invoices";

export const MAX_PURCHASE_LINES = 20;

/* ---------- Payment methods (supplier side: cash, cheque, online, EasyPaisa, JazzCash -- decision D2) ---------- */

export const SUPPLIER_PAYMENT_METHODS: { value: SupplierPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "online", label: "Online transfer" },
  { value: "easypaisa", label: "EasyPaisa" },
  { value: "jazzcash", label: "JazzCash" },
];

export function supplierMethodLabel(m: SupplierPaymentMethod): string {
  return SUPPLIER_PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;
}

/* ---------- Lines & totals: calculated here in code, database recomputes independently ---------- */

export type NewPurchaseItemDraft = {
  category: "battery" | "panel" | "accessory";
  brand: string;
  model: string;
  type?: string;
  voltage?: string;
  plates?: string;
  ah_rating?: string;
  wattage?: string;
  warranty_months?: string;
  sale_price?: string;
  reorder_level?: string;
  hs_code?: string;
  uom?: string;
};

export type PurchaseLineDraft = {
  /** null when this line is a brand-new product (see new_item). */
  inventory_id: string | null;
  new_item?: NewPurchaseItemDraft | null;
  /** Shown on screen only -- the server writes its own snapshot description. */
  display_name: string;
  /** The item's cost_price right now, for the "Cost changed from Rs X" hint. Null for a new product. */
  current_cost_price: number | null;
  quantity: string;   // typed text
  unit_cost: string;  // typed text
  keep_old_cost: boolean;
};

export const lineAmount = (qty: number, unitCost: number) => round2(qty * unitCost);

export function purchaseTotals(lines: { quantity: number; unit_cost: number }[], discount: number, freight: number) {
  const subtotal = round2(lines.reduce((sum, l) => sum + lineAmount(l.quantity, l.unit_cost), 0));
  const total = round2(subtotal - discount + freight);
  return { subtotal, total };
}

/** True when the typed cost differs from the item's current cost_price -- shows "Cost changed from Rs X". */
export function costChanged(currentCostPrice: number | null, typedUnitCost: number): boolean {
  return currentCostPrice != null && round2(currentCostPrice) !== round2(typedUnitCost);
}

/** Same rule as sale bills: the same product cannot appear twice (merge quantities instead). A
 * brand-new product line is always distinct, since it has no inventory_id yet. */
export function hasDuplicateProducts(lines: { inventory_id: string | null }[]): boolean {
  const ids = lines.map((l) => l.inventory_id).filter((id): id is string => !!id);
  return new Set(ids).size !== ids.length;
}

/* ---------- Validation ---------- */

export type PurchaseLineErrors = { product?: string; quantity?: string; unit_cost?: string };

export function validatePurchaseLine(l: PurchaseLineDraft): PurchaseLineErrors {
  const e: PurchaseLineErrors = {};
  if (!l.inventory_id && !l.new_item) e.product = "Choose a product, or add it as new.";
  if (parseQty(l.quantity) == null) e.quantity = "Enter a whole number of 1 or more.";
  const cost = parseAmount(l.unit_cost);
  if (cost == null || cost < 0) e.unit_cost = "Enter a cost of 0 or more.";
  return e;
}

export type PurchaseFormErrors = {
  supplier?: string;
  invoice_date?: string;
  lines?: string;
  discount?: string;
  paid_now?: string;
  cheque_number?: string;
};

export function validatePurchaseHeader(f: {
  supplierId: string | null;
  newSupplierName: string;
  invoiceDate: string;
  lineCount: number;
  subtotal: number;
  discount: string;
  paidNow: string;
  total: number;
  method: SupplierPaymentMethod;
  chequeNumber: string;
}): PurchaseFormErrors {
  const e: PurchaseFormErrors = {};

  if (!f.supplierId && !f.newSupplierName.trim()) {
    e.supplier = "Choose a supplier, or type a name to add a new one.";
  }

  if (!f.invoiceDate) e.invoice_date = "Choose a date.";
  else if (f.invoiceDate > todayKarachi()) e.invoice_date = "The bill date cannot be in the future.";

  if (f.lineCount === 0) e.lines = "Add at least one product.";
  else if (f.lineCount > MAX_PURCHASE_LINES) {
    e.lines = `A bill can have up to ${MAX_PURCHASE_LINES} products. Save this one and make a second bill for the rest.`;
  }

  const discount = parseAmount(f.discount || "0");
  if (discount == null || discount < 0) e.discount = "Enter a discount of 0 or more.";
  else if (discount > f.subtotal) e.discount = "The discount cannot be more than the subtotal.";

  const paidText = f.paidNow.trim();
  if (paidText) {
    const paid = parseAmount(paidText);
    if (paid == null || paid < 0) e.paid_now = "Enter an amount of 0 or more.";
    else if (paid > f.total) e.paid_now = "That is more than the bill total.";
    else if (paid > 0 && f.method === "cheque" && !f.chequeNumber.trim()) {
      e.cheque_number = "Enter the cheque number.";
    }
  }

  return e;
}

/* ---------- Search ---------- */

/** Matches the purchase number, supplier's invoice number, note, date and supplier name. */
export function purchaseMatches(
  p: Pick<PurchaseInvoice, "purchase_number" | "supplier_invoice_number" | "note" | "invoice_date">,
  supplierName: string,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    p.purchase_number,
    p.supplier_invoice_number ?? "",
    p.note ?? "",
    p.invoice_date,
    formatDay(p.invoice_date),
    supplierName,
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/* ---------- Payload for the create_purchase() RPC call ---------- */

export function purchaseLinePayload(l: {
  inventory_id: string | null;
  new_item?: NewPurchaseItemDraft | null;
  quantity: number;
  unit_cost: number;
  keep_old_cost: boolean;
}) {
  return {
    inventory_id: l.inventory_id,
    new_item: l.inventory_id ? null : newItemPayload(l.new_item!),
    quantity: l.quantity,
    unit_cost: round2(l.unit_cost),
    keep_old_cost: l.keep_old_cost,
  };
}

function newItemPayload(n: NewPurchaseItemDraft) {
  return {
    category: n.category,
    brand: n.brand.trim(),
    model: n.model.trim(),
    type: n.type?.trim() || null,
    voltage: n.voltage || null,
    plates: n.plates || null,
    ah_rating: n.ah_rating || null,
    wattage: n.wattage || null,
    warranty_months: n.warranty_months || null,
    sale_price: n.sale_price || null,
    reorder_level: n.reorder_level || null,
    hs_code: n.hs_code?.trim() || null,
    uom: n.uom?.trim() || null,
  };
}

/* ---------- Friendly database errors ---------- */

type DbError = { code?: string; message: string };

/** Turns a Supabase error into a sentence that says what happened and what to do. Messages the database
 * already writes in plain English (duplicate bill number, over 20 lines, stock would go negative) are
 * passed through as-is. */
export function friendlyPurchaseError(error: DbError): string {
  if (error.code === "42883" || error.code === "PGRST202") {
    return "The purchases setup is missing. Run 12_suppliers_purchases.sql in Supabase, then try again.";
  }
  if (error.code === "42P01") {
    return "The purchases table is missing. Run 12_suppliers_purchases.sql in Supabase, then try again.";
  }
  return error.message;
}
