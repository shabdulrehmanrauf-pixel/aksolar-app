import type { Supplier, SupplierBalance } from "./types";
import { formatRs } from "./format";

/* ---------- Form rules ---------- */

export type SupplierFormValues = {
  name: string;
  phone: string;
  address: string;
  ntn_or_cnic: string;
  note: string;
  /** Typed as plain text; always >= 0. Direction below decides the sign the database stores. */
  opening_balance: string;
  opening_balance_direction: "we_owe" | "they_owe";
  opening_balance_date: string; // YYYY-MM-DD
};

export type SupplierErrors = Partial<Record<keyof SupplierFormValues, string>>;

export function validateSupplier(f: SupplierFormValues): SupplierErrors {
  const e: SupplierErrors = {};

  const name = f.name.trim();
  if (!name) e.name = "Enter the supplier's name.";
  else if (name.length > 120) e.name = "Name is too long. Use 120 characters or fewer.";

  const openingText = f.opening_balance.trim();
  if (openingText) {
    const n = Number(openingText.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      e.opening_balance = "Enter an opening balance of 0 or more.";
    } else if (n > 0 && !f.opening_balance_date) {
      e.opening_balance_date = "Add the \"as of\" date for the opening balance.";
    }
  }

  const reg = f.ntn_or_cnic.trim().replace(/[\s-]/g, "");
  if (reg && !/^(\d{7}|\d{13})$/.test(reg)) {
    e.ntn_or_cnic = "Use 7 digits for an NTN or 13 digits for a CNIC. Dashes are fine, other characters are not.";
  }

  return e;
}

/** Turns the typed amount + direction into the signed number the database stores (positive = we owe them). */
export function signedOpeningBalance(f: Pick<SupplierFormValues, "opening_balance" | "opening_balance_direction">): number {
  const n = Number(f.opening_balance.replace(/,/g, "")) || 0;
  return f.opening_balance_direction === "we_owe" ? n : -n;
}

export function supplierPayload(f: SupplierFormValues) {
  const hasOpening = f.opening_balance.trim().length > 0;
  return {
    name: f.name.trim(),
    phone: f.phone.trim() || null,
    address: f.address.trim() || null,
    note: f.note.trim() || null,
    ntn_or_cnic: f.ntn_or_cnic.trim().replace(/[\s-]/g, "") || null,
    opening_balance: signedOpeningBalance(f),
    opening_balance_date: hasOpening ? f.opening_balance_date || null : null,
  };
}

export function supplierToForm(s: Supplier | null): SupplierFormValues {
  const ob = s?.opening_balance ?? 0;
  return {
    name: s?.name ?? "",
    phone: s?.phone ?? "",
    address: s?.address ?? "",
    ntn_or_cnic: s?.ntn_or_cnic ?? "",
    note: s?.note ?? "",
    opening_balance: ob ? String(Math.abs(ob)) : "",
    opening_balance_direction: ob < 0 ? "they_owe" : "we_owe",
    opening_balance_date: s?.opening_balance_date ?? "",
  };
}

/** Case-insensitive match on name, phone, address or NTN/CNIC. */
export function supplierMatches(
  s: Pick<Supplier, "name" | "phone" | "address" | "ntn_or_cnic">,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [s.name, s.phone ?? "", s.address ?? "", s.ntn_or_cnic ?? ""].join(" ").toLowerCase();
  if (q.split(/\s+/).every((w) => hay.includes(w))) return true;
  const qd = q.replace(/\D/g, "");
  return qd.length >= 3 && (s.phone ?? "").includes(qd);
}

/* ---------- Balance wording (ledger screen header, Suppliers list rows) ---------- */

export type BalanceTone = "owe" | "advance" | "clear";

/** "We owe Rs 1,20,000" / "Advance paid Rs 5,000" / "All clear" */
export function balanceLabel(balance: number): { text: string; tone: BalanceTone } {
  const r = Math.round(balance * 100) / 100;
  if (r > 0) return { text: `We owe ${formatRs(r)}`, tone: "owe" };
  if (r < 0) return { text: `Advance paid ${formatRs(-r)}`, tone: "advance" };
  return { text: "All clear", tone: "clear" };
}

/** Which Suppliers-list tab (All / We owe / Advance) a supplier belongs under. */
export function supplierTab(s: Pick<SupplierBalance, "balance">): "we_owe" | "advance" {
  return s.balance < 0 ? "advance" : "we_owe";
}

/* ---------- Friendly database errors ---------- */

type DbError = { code?: string; message: string };

/** Turns a Supabase error into a sentence that says what happened and what to do. For a delete that
 * fails because the supplier has purchase bills/payments, use friendlyDeleteError(error, "supplier")
 * from lib/invoices.ts instead -- kept in one place since customers/items share the same shape. */
export function friendlySupplierError(error: DbError): string {
  if (error.code === "42883" || error.code === "PGRST202") {
    return "The suppliers setup is missing. Run 12_suppliers_purchases.sql in Supabase, then try again.";
  }
  if (error.code === "42P01") {
    return "The suppliers table is missing. Run 12_suppliers_purchases.sql in Supabase, then try again.";
  }
  if (error.code === "23505") {
    return "A supplier with this name already exists.";
  }
  return error.message;
}
