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
