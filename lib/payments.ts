import type { PaymentDetails, SupplierPaymentMethod } from "./types";
import { formatDay, parseAmount, todayKarachi } from "./invoices";

/* Payment methods and their labels are shared with F1's "paid now" -- see lib/purchases.ts
 * (SUPPLIER_PAYMENT_METHODS, supplierMethodLabel). Nothing new needed here. */

/* ---------- Validation ---------- */

export type PaymentFormErrors = {
  supplier?: string;
  amount?: string;
  paid_at?: string;
  cheque_number?: string;
};

export function validatePayment(f: {
  supplierId: string | null;
  amountText: string;
  dueTotal: number | null; // null when on-account (no cap from a specific bill)
  paidAt: string;
  method: SupplierPaymentMethod;
  chequeNumber: string;
}): PaymentFormErrors {
  const e: PaymentFormErrors = {};

  if (!f.supplierId) e.supplier = "Choose a supplier.";

  const amount = parseAmount(f.amountText);
  if (amount == null || amount <= 0) {
    e.amount = "Enter an amount greater than zero, with up to 2 decimals.";
  } else if (f.dueTotal != null && amount > f.dueTotal) {
    e.amount = `That is more than the amount due (Rs ${f.dueTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}).`;
  }

  if (!f.paidAt) e.paid_at = "Choose a date.";
  else if (f.paidAt > todayKarachi()) e.paid_at = "The payment date cannot be in the future.";

  if (f.method === "cheque" && !f.chequeNumber.trim()) {
    e.cheque_number = "Enter the cheque number.";
  }

  return e;
}

/* ---------- Search ---------- */

/** Matches the payment number, supplier name, the bill it's against, reference/cheque number and date. */
export function paymentMatches(
  p: Pick<PaymentDetails, "payment_number" | "supplier_name" | "purchase_number" | "reference" | "cheque_number" | "paid_at">,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    p.payment_number,
    p.supplier_name,
    p.purchase_number ?? "",
    p.reference ?? "",
    p.cheque_number ?? "",
    p.paid_at,
    formatDay(p.paid_at),
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/* ---------- Friendly database errors ---------- */

type DbError = { code?: string; message: string };

/** Turns a Supabase error into a sentence that says what happened and what to do. Messages the
 * database already writes in plain English (over the amount due, cheque number missing) pass through. */
export function friendlyPaymentError(error: DbError): string {
  if (error.code === "42883" || error.code === "PGRST202") {
    return "The payments setup is missing. Run 13_supplier_payments.sql in Supabase, then try again.";
  }
  if (error.code === "42P01") {
    return "The payments table is missing. Run 12_suppliers_purchases.sql and 13_supplier_payments.sql in Supabase, then try again.";
  }
  return error.message;
}
