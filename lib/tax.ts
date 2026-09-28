/**
 * FBR tax maths for ONE bill line. This is the same maths as the database function
 * public._fbr_line_figures() in supabase/18_fbr.sql. The database is the final authority:
 * this file only shows the figures on screen before saving. If the two ever differ, the database wins.
 *
 * Rates are never hard-coded. The rate always comes from the item (fbr_rate_desc, e.g. "18%").
 *
 * PROVISIONAL (settle with PRAL in phase D6): Third Schedule lines use the printed retail price x quantity
 * as "fixedNotifiedValueOrRetailPrice". Only this file and _fbr_line_figures() need to change.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type TaxLineInput = {
  name: string;
  saleType: string | null;
  rateDesc: string | null;
  qty: number;
  price: number;
  retailPrice: number | null;
  sroScheduleNo: string | null;
  sroItemSerialNo: string | null;
  pricesIncludeTax: boolean;
};

export type TaxLineResult =
  | {
      ok: true;
      value: number; // FBR valueSalesExcludingST
      tax: number; // FBR salesTaxApplicable
      total: number; // FBR totalValues
      fixed: number; // FBR fixedNotifiedValueOrRetailPrice
      add: number; // tax ADDED to what the customer pays
      rate: number;
    }
  | { ok: false; error: string };

export const isThirdSchedule = (saleType: string | null | undefined) => /^3rd schedule/i.test(saleType ?? "");
export const needsSro = (saleType: string | null | undefined) => /reduced|^exempt/i.test((saleType ?? "").trim());

/** "18%" -> 18, "Exempt" -> 0, anything else -> null */
export function parseRate(desc: string | null | undefined): number | null {
  const t = (desc ?? "").trim();
  if (!t) return null;
  if (/^exempt/i.test(t)) return 0;
  const m = /^(\d+(?:\.\d+)?)\s*%$/.exec(t);
  return m ? Number(m[1]) : null;
}

export function taxLine(i: TaxLineInput): TaxLineResult {
  const rate = parseRate(i.rateDesc);
  if (!(i.rateDesc ?? "").trim()) {
    return { ok: false, error: `Set the GST rate for ${i.name} in Inventory before making an FBR bill (for example 18%).` };
  }
  if (rate == null) {
    return { ok: false, error: `The GST rate of ${i.name} (${i.rateDesc}) is not valid. Use a form like 18%.` };
  }
  if (needsSro(i.saleType) && (!(i.sroScheduleNo ?? "").trim() || !(i.sroItemSerialNo ?? "").trim())) {
    return { ok: false, error: `${i.name} needs its SRO / Schedule number and item serial in Inventory (FBR errors 0077, 0078).` };
  }

  const line = round2(i.qty * round2(i.price));

  if (isThirdSchedule(i.saleType)) {
    if (i.retailPrice == null || i.retailPrice <= 0) {
      return { ok: false, error: `${i.name} is a Third Schedule item. Enter its printed retail price in Inventory (FBR error 0090).` };
    }
    const fixed = round2(i.retailPrice * i.qty);
    const tax = round2((fixed * rate) / 100);
    return { ok: true, value: line, tax, total: round2(line + tax), fixed, add: 0, rate };
  }
  if (i.pricesIncludeTax) {
    const value = round2(line / (1 + rate / 100));
    return { ok: true, value, tax: round2(line - value), total: line, fixed: 0, add: 0, rate };
  }
  const tax = round2((line * rate) / 100);
  return { ok: true, value: line, tax, total: round2(line + tax), fixed: 0, add: tax, rate };
}

export type BillTaxSummary = {
  pretax: number; // what the lines add up to before any GST added on top
  taxAdded: number; // GST added on top (customer pays this extra)
  taxReported: number; // total FBR tax, including Third Schedule tax already inside the price
  grand: number; // what the customer pays
  errors: string[];
};

export function billTax(lines: TaxLineInput[]): BillTaxSummary {
  let pretax = 0;
  let taxAdded = 0;
  let taxReported = 0;
  const errors: string[] = [];
  for (const l of lines) {
    pretax += round2(l.qty * round2(l.price));
    const r = taxLine(l);
    if (r.ok) {
      taxAdded += r.add;
      taxReported += r.tax;
    } else if (!errors.includes(r.error)) {
      errors.push(r.error);
    }
  }
  return {
    pretax: round2(pretax),
    taxAdded: round2(taxAdded),
    taxReported: round2(taxReported),
    grand: round2(pretax + taxAdded),
    errors,
  };
}
