import { addDays, formatDay } from "./invoices";

export type RangeKey = "today" | "yesterday" | "month" | "quarter" | "year";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
];

export function parseRange(value: string | undefined): RangeKey {
  return RANGES.some((r) => r.key === value) ? (value as RangeKey) : "today";
}

export type Period = {
  key: RangeKey;
  from: string; // YYYY-MM-DD
  to: string;
  /** "day" or "month": how the sales chart is grouped */
  bucket: "day" | "month";
  singleDay: boolean;
  label: string;
};

/** Works out the dates for a range, from today's date in Pakistan time. */
export function periodFor(key: RangeKey, today: string): Period {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (key) {
    case "yesterday": {
      const d = addDays(today, -1);
      return { key, from: d, to: d, bucket: "day", singleDay: true, label: formatDay(d) };
    }
    case "month": {
      const from = `${y}-${pad(m)}-01`;
      return { key, from, to: today, bucket: "day", singleDay: false, label: `${formatDay(from)} to ${formatDay(today)}` };
    }
    case "quarter": {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      const from = `${y}-${pad(qm)}-01`;
      return { key, from, to: today, bucket: "month", singleDay: false, label: `${formatDay(from)} to ${formatDay(today)}` };
    }
    case "year": {
      const from = `${y}-01-01`;
      return { key, from, to: today, bucket: "month", singleDay: false, label: `${formatDay(from)} to ${formatDay(today)}` };
    }
    default:
      return { key: "today", from: today, to: today, bucket: "day", singleDay: true, label: formatDay(today) };
  }
}

export type ReportSummary = {
  sales_total: number;
  invoice_count: number;
  gross_profit: number;
  cash_received: number;
  received_on_older_bills: number;
  by_method: { cash: number; bank: number; other: number };
  credit_given: number;
  daily: { day: string; sales: number; count: number }[];
  top_items: { description: string; quantity: number; revenue: number }[];
};

/* ---------- F4: cash book + the rest of the Reports totals ---------- */

/** From `cash_book_summary(from, to)` -- 15_cash_book.sql. All figures are "cash" (method = 'cash')
 * only: a cheque, bank transfer, EasyPaisa or JazzCash movement never appears here. */
export type CashBookSummary = {
  opening_balance_as_of: string; // YYYY-MM-DD, the owner's saved "as of" date
  opening_for_period: number;    // that balance, rolled forward to the start of the requested period
  cash_sales: number;
  other_cash_income: number;
  other_cash_income_breakdown: { scrap: number; charging: number; claims: number };
  cash_paid_to_suppliers: number;
  cash_expenses: number;
  closing_balance: number;       // cash in hand at the end of the period
};

/** From `financial_summary(from, to)` -- 15_cash_book.sql. Combine with ReportSummary.gross_profit to
 * get Net profit: gross_profit - (expenses_total - expenses_excluded_total). */
export type FinancialSummary = {
  expenses_total: number;
  expenses_excluded_total: number; // "Owner withdrawal" -- counted in the cash book, not in Net profit
  purchases_total: number;
  paid_to_suppliers_total: number;
  we_owe_total: number;   // point-in-time (now), not period-bound -- same as "Udhaar to collect"
  we_owe_count: number;
};

/** Net profit = gross profit (from sales) minus expenses, excluding Owner withdrawal rows. */
export function netProfit(gross_profit: number, financial: FinancialSummary): number {
  return gross_profit - (financial.expenses_total - financial.expenses_excluded_total);
}
