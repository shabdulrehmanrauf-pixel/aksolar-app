import type { ScrapBatteryInventory, ScrapBatterySale } from "./types";
import { formatDay } from "./invoices";

/** Matches the intake number, brand, model, battery number, customer and received date. */
export function scrapIntakeMatches(row: ScrapBatteryInventory, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.intake_number,
    row.brand,
    row.model,
    row.battery_type ?? "",
    row.battery_number ?? "",
    row.customer_name ?? "",
    row.note ?? "",
    row.received_date,
    formatDay(row.received_date),
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/** Matches the sale number, buyer name/phone, note and sale date. */
export function scrapSaleMatches(sale: ScrapBatterySale, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [sale.sale_number, sale.buyer_name, sale.buyer_phone ?? "", sale.note ?? "", sale.sale_date, formatDay(sale.sale_date)]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
