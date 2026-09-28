import type { Customer, RegistrationType } from "./types";

export const REGISTRATION_TYPES: { value: RegistrationType; label: string; hint: string }[] = [
  { value: "Unregistered", label: "Unregistered", hint: "Walk-in or regular customer without an NTN." },
  { value: "Registered", label: "Registered", hint: "Has an NTN or CNIC on the FBR record. Required for tax invoices." },
];

/* ---------- Phone ---------- */

/** Removes spaces, dashes and brackets. +92 300 1234567 becomes 03001234567. */
export function normalizePhone(raw: string): string {
  let t = raw.trim().replace(/[\s\-().]/g, "");
  if (t.startsWith("+92")) t = "0" + t.slice(3);
  else if (t.startsWith("0092")) t = "0" + t.slice(4);
  else if (/^92\d{10}$/.test(t)) t = "0" + t.slice(2);
  return t;
}

export function isValidPhone(normalized: string): boolean {
  return /^\+?\d{10,15}$/.test(normalized);
}

/** 03001234567 -> 0300 1234567 (only for 11-digit local numbers). */
export function formatPhone(phone: string | null): string {
  if (!phone) return "";
  return /^0\d{10}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4)}` : phone;
}

/** Link that opens a WhatsApp chat. Local 03xx numbers become 92 3xx. */
export function whatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "92" + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}

/* ---------- CNIC / NTN ---------- */

/** Accepts 42101-1234567-1 or 42101 1234567 1 and returns digits (or the text with junk left in, so validation can complain). */
export function cleanRegNo(raw: string): string {
  return raw.trim().replace(/[\s-]/g, "");
}

export function regNoKind(digits: string): "CNIC" | "NTN" | null {
  if (/^\d{13}$/.test(digits)) return "CNIC";
  if (/^\d{7}$/.test(digits)) return "NTN";
  return null;
}

export function formatRegNo(digits: string | null): string {
  if (!digits) return "";
  return /^\d{13}$/.test(digits)
    ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
    : digits;
}

/* ---------- Form rules (shared with the future CSV import) ---------- */

export type CustomerFormValues = {
  name: string;
  phone: string;
  address: string;
  registration_type: RegistrationType;
  cnic_or_ntn: string;
  province?: string; // exact FBR province name; optional so the AI assistant's proposals keep working
};

export type CustomerErrors = Partial<Record<keyof CustomerFormValues, string>>;

export function validateCustomer(f: CustomerFormValues): CustomerErrors {
  const e: CustomerErrors = {};

  const name = f.name.trim();
  if (!name) e.name = "Enter the customer's name.";
  else if (name.length > 120) e.name = "Name is too long. Use 120 characters or fewer.";

  const phone = normalizePhone(f.phone);
  if (phone && !isValidPhone(phone)) {
    e.phone = "Enter a phone number with 10 to 15 digits, for example 0300 1234567.";
  }

  const reg = cleanRegNo(f.cnic_or_ntn);
  if (reg) {
    if (!regNoKind(reg)) {
      e.cnic_or_ntn = "Use 13 digits for a CNIC or 7 digits for an NTN. Dashes are fine, other characters are not.";
    }
  } else if (f.registration_type === "Registered") {
    e.cnic_or_ntn = "Registered customers need a CNIC (13 digits) or an NTN (7 digits).";
  }

  return e;
}

export function customerPayload(f: CustomerFormValues) {
  return {
    name: f.name.trim(),
    phone: normalizePhone(f.phone) || null,
    address: f.address.trim() || null,
    registration_type: f.registration_type,
    cnic_or_ntn: cleanRegNo(f.cnic_or_ntn) || null,
    ...(f.province === undefined ? {} : { province: f.province.trim() || null }),
  };
}

export function customerToForm(c: Customer | null): CustomerFormValues {
  return {
    name: c?.name ?? "",
    phone: c?.phone ?? "",
    address: c?.address ?? "",
    registration_type: c?.registration_type ?? "Unregistered",
    cnic_or_ntn: c?.cnic_or_ntn ?? "",
    province: c?.province ?? "",
  };
}

/** Case-insensitive match on name, phone or CNIC/NTN. Digits in the query also match phone numbers typed with spaces. */
export function customerMatches(c: Pick<Customer, "name" | "phone" | "cnic_or_ntn" | "address">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [c.name, c.phone ?? "", c.cnic_or_ntn ?? "", c.address ?? ""].join(" ").toLowerCase();
  if (q.split(/\s+/).every((w) => hay.includes(w))) return true;
  const qd = q.replace(/\D/g, "");
  return qd.length >= 3 && ((c.phone ?? "").includes(qd) || (c.cnic_or_ntn ?? "").includes(qd));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}
