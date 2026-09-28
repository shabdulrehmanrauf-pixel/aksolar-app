/**
 * FBR particulars on the printed bill (Phase D5b). Pure helpers, safe in server and client code.
 * Reads what the app already saved (fbr_invoices, fbr_invoice_items). No tax maths is invented here:
 * every figure is either an FBR figure saved at billing time, or a plain sum of saved figures.
 */
import type { FbrStatus } from "@/lib/fbrStatus";

export type FbrPrintLine = {
  invoiceItemId: string;
  rateDesc: string | null; // e.g. "18%"
  saleType: string | null;
  valueExclTax: number; // FBR valueSalesExcludingST
  taxAmount: number; // FBR salesTaxApplicable
  fixedValue: number; // FBR fixedNotifiedValueOrRetailPrice (Third Schedule only, else 0)
  totalValues: number; // FBR totalValues
};

export type FbrPrintData = {
  status: FbrStatus;
  /** The invoice number FBR gave back. Only present once status is "sent". */
  number: string | null;
  environment: "sandbox" | "production";
  submittedAt: string | null;
  lines: FbrPrintLine[];
};

export const FBR_PRINT_HEADER_COLUMNS = "fbr_status,fbr_invoice_number,environment,submitted_at";
export const FBR_PRINT_LINE_COLUMNS =
  "invoice_item_id,fbr_rate_desc,sale_type,value_sales_excl_st,sales_tax_applicable,fixed_notified_value,total_values";

export const FBR_VERIFY_TEXT = "Verify this invoice with the FBR Tax Asaan mobile app.";
export const FBR_LOGO_URL = "/fbr-logo.png";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const STATUSES: FbrStatus[] = ["pending", "sending", "sent", "failed", "unknown"];

export function fbrPrintHeaderFromRow(row: unknown): Omit<FbrPrintData, "lines"> | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const status = r.fbr_status as FbrStatus;
  if (!STATUSES.includes(status)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    status,
    number: str(r.fbr_invoice_number),
    environment: r.environment === "production" ? "production" : "sandbox",
    submittedAt: str(r.submitted_at),
  };
}

export function fbrPrintLineFromRow(row: unknown): FbrPrintLine | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.invoice_item_id !== "string") return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    invoiceItemId: r.invoice_item_id,
    rateDesc: str(r.fbr_rate_desc),
    saleType: str(r.sale_type),
    valueExclTax: num(r.value_sales_excl_st),
    taxAmount: num(r.sales_tax_applicable),
    fixedValue: num(r.fixed_notified_value),
    totalValues: num(r.total_values),
  };
}

/** True when the printed bill must show the FBR number and QR: FBR accepted it and gave a number. */
export function fbrHasNumber(f: Pick<FbrPrintData, "status" | "number">): boolean {
  return f.status === "sent" && !!f.number;
}

export type FbrPrintRow = {
  itemId: string;
  /** false when this bill line has no saved FBR figures (should not happen; shown as a dash). */
  known: boolean;
  rateDesc: string;
  valueExclTax: number;
  taxAmount: number;
  /** Sales tax is already inside the price the customer pays (Third Schedule, or prices that include tax). */
  taxInside: boolean;
  /** What the customer pays for this line. */
  payable: number;
};

export type FbrPrintTotals = {
  rows: FbrPrintRow[];
  /** Sum of the bill lines (price x quantity). */
  subtotal: number;
  /** GST added on top of the lines. Equals bill total minus subtotal, the same number the database saved. */
  taxAdded: number;
  /** Sales tax that is already inside the prices. Shown as information only. */
  taxIncluded: number;
};

export function computeFbrPrint(
  billTotal: number,
  items: { id: string; total: number }[],
  lines: FbrPrintLine[],
): FbrPrintTotals {
  const byItem = new Map(lines.map((l) => [l.invoiceItemId, l]));
  let subtotal = 0;
  let taxIncluded = 0;
  const rows: FbrPrintRow[] = items.map((it) => {
    subtotal += it.total;
    const l = byItem.get(it.id);
    if (!l) {
      return { itemId: it.id, known: false, rateDesc: "", valueExclTax: 0, taxAmount: 0, taxInside: false, payable: it.total };
    }
    // Third Schedule: the printed price already carries the tax. Or the shop prices include tax:
    // then FBR's total equals what the customer pays for the line.
    const inside = l.fixedValue > 0 || (l.taxAmount > 0 && Math.abs(l.totalValues - it.total) < 0.005);
    if (inside) taxIncluded += l.taxAmount;
    return {
      itemId: it.id,
      known: true,
      rateDesc: l.rateDesc ?? "",
      valueExclTax: l.valueExclTax,
      taxAmount: l.taxAmount,
      taxInside: inside,
      payable: inside ? it.total : round2(it.total + l.taxAmount),
    };
  });
  return {
    rows,
    subtotal: round2(subtotal),
    taxAdded: Math.max(0, round2(billTotal - subtotal)),
    taxIncluded: round2(taxIncluded),
  };
}
