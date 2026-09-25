import type { Invoice, PaymentMethod, PaymentStatus } from "./types";

/* ---------- Money: always calculated here in code, never typed by hand ---------- */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const lineAmount = (qty: number, rate: number) => round2(qty * rate);

/** Turns text typed in an amount box into a number. Commas are fine. Returns null if it is not a valid amount (max 2 decimals). */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

/** Whole number of 1 or more, or null. */
export function parseQty(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 ? n : null;
}

export function paymentStatusFor(total: number, paid: number): PaymentStatus {
  if (paid >= total) return "Paid";
  if (paid <= 0) return "Credit";
  return "Partial";
}

/* ---------- Labels ---------- */

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export function methodLabel(m: PaymentMethod): string {
  return PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  Paid: "Paid",
  Partial: "Part paid",
  Credit: "Udhaar",
};

/* ---------- Dates (Pakistan time, so server and browser agree) ---------- */

/** Today as YYYY-MM-DD in Pakistan time. */
export function todayKarachi(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(now);
}

/** Adds days to a YYYY-MM-DD string (calendar arithmetic, no time zones involved). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** 2026-09-21 -> 21 Sep 2026 */
export function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

/** 3:45 pm, Pakistan time */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  }).format(new Date(iso));
}

/* ---------- Search ---------- */

/** Matches the bill number, customer name, phone, note and date (2026-09-21, 21 Sep, Sep 2026 ...). */
export function invoiceMatches(
  inv: Pick<Invoice, "invoice_number" | "buyer_name" | "buyer_phone" | "note" | "invoice_date">,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [inv.invoice_number, inv.buyer_name, inv.buyer_phone ?? "", inv.note ?? "", inv.invoice_date, formatDay(inv.invoice_date)]
    .join(" ")
    .toLowerCase();
  if (q.split(/\s+/).every((w) => hay.includes(w))) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 && (inv.buyer_phone ?? "").includes(digits);
}

/* ---------- Friendly database errors ---------- */

type DbError = { code?: string; message: string };

/** Turns a Supabase error into a sentence that says what happened and what to do. */
export function friendlyInvoiceError(error: DbError): string {
  if (error.code === "42883" || error.code === "PGRST202") {
    return "The invoicing setup is missing. Run 03_invoices.sql in Supabase, then try again.";
  }
  if (error.code === "42P01") {
    return "The invoices table is missing. Run 03_invoices.sql in Supabase, then try again.";
  }
  if (error.code === "23514" && /quantity/i.test(error.message)) {
    return "Not enough stock for one of the items. Lower the quantity and try again.";
  }
  return error.message;
}

/** Message shown when a customer, item or supplier cannot be deleted because bills use it. */
export function friendlyDeleteError(error: DbError, what: "customer" | "item" | "supplier"): string {
  if (error.code === "23503") {
    if (what === "customer") return "This customer has bills, so they cannot be deleted. Bills must stay in your records.";
    if (what === "supplier") return "This supplier has purchase bills or payments, so it cannot be deleted. Mark it inactive instead.";
    return "This item is on a bill, so it cannot be deleted. Set its quantity to 0 instead.";
  }
  return `Could not delete. ${error.message}`;
}
