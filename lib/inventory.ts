import type { Category, InventoryItem } from "./types";

export const CATEGORIES: { value: Category; label: string; plural: string }[] = [
  { value: "battery", label: "Battery", plural: "Batteries" },
  { value: "panel", label: "Solar panel", plural: "Solar panels" },
  { value: "accessory", label: "Accessory", plural: "Accessories" },
];

export const BATTERY_TYPES = ["Lithium", "Tubular", "Lead-acid", "Dry"];

export const PANEL_TYPES = [
  "Monocrystalline",
  "Polycrystalline",
  "Bifacial",
  "N-type",
];

export const ACCESSORY_TYPES = [
  "UPS",
  "Inverter",
  "Solar inverter",
  "Battery water",
  "Battery charger",
  "Charge controller",
  "Solar cable",
  "MC4 connector",
  "Mounting structure",
  "Battery terminal",
  "Battery clamp",
  "Battery trolley",
  "Battery stand",
  "Voltage stabilizer (AVR)",
  "Distribution box (DB)",
  "Junction box",
  "Circuit breaker (MCB)",
  "Fuse",
  "Earthing kit",
  "Net metering kit",
  "Battery tester",
  "Extension board",
];

/** The stock-type options shown under a category (Batteries: Lithium, Tubular ...). */
export function typeOptionsFor(category: Category): string[] {
  return category === "battery" ? BATTERY_TYPES : category === "panel" ? PANEL_TYPES : ACCESSORY_TYPES;
}

/**
 * Groups spelling variations into one type, so "lithium", "Li-ion", "lead acid" and "Lead-acid" all filter together.
 * Anything it does not recognise keeps its own name. A blank type becomes "Other".
 */
export function normalizeType(type: string | null | undefined): string {
  const t = (type ?? "").trim();
  if (!t) return "Other";
  const known = [...BATTERY_TYPES, ...PANEL_TYPES, ...ACCESSORY_TYPES].find((k) => k.toLowerCase() === t.toLowerCase());
  if (known) return known;
  if (/lithium|li-?ion|lifepo/i.test(t)) return "Lithium";
  if (/tubular/i.test(t)) return "Tubular";
  if (/\bdry\b/i.test(t)) return "Dry";
  if (/lead|acid|flooded/i.test(t)) return "Lead-acid";
  if (/\bups\b/i.test(t)) return "UPS";
  if (/water|electrolyte/i.test(t)) return "Battery water";
  return t;
}

/** Short name for the filter buttons. */
export function typeLabel(type: string): string {
  return type === "Lead-acid" ? "Acid (lead-acid)" : type;
}

export const DEFAULT_UOM = "Numbers, pieces, units";

export function categoryLabel(category: Category): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

/** Low means at or below the reorder level (this also covers out of stock). */
export function isLow(item: Pick<InventoryItem, "quantity" | "reorder_level">) {
  return item.quantity <= item.reorder_level;
}

export function isOut(item: Pick<InventoryItem, "quantity">) {
  return item.quantity <= 0;
}

/** One readable line of specs, depending on the kind of item. */
export function itemSpecs(item: InventoryItem): string {
  const parts: string[] = [];
  if (item.type) parts.push(item.type);
  if (item.category === "battery") {
    if (item.voltage != null) parts.push(`${item.voltage}\u00a0V`);
    if (item.plates != null) parts.push(`${item.plates}\u00a0plates`);
    if (item.ah_rating != null) parts.push(`${item.ah_rating}\u00a0Ah`);
  }
  if (item.category === "panel" && item.wattage != null) {
    parts.push(`${item.wattage}\u00a0W`);
  }
  if (item.warranty_months) parts.push(`${item.warranty_months}\u00a0months warranty`);
  return parts.join(", ");
}

/* ---------- Search (shared by the search box and the AI assistant) ---------- */

type StockSearchable = Pick<InventoryItem, "brand" | "model" | "type" | "category"> &
  Partial<Pick<InventoryItem, "voltage" | "plates" | "ah_rating" | "wattage">>;

/** Splits what a person typed into lower-case words. Punctuation and hyphens are ignored, so "Osaka 200Ah?" and "12V-200Ah" both work. */
export function searchWords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** The text an item is searched against: brand, model, type, category and its main specs (200Ah, 12V, 550W). */
function stockHaystack(s: StockSearchable): string {
  const specs: string[] = [];
  if (s.ah_rating != null) specs.push(`${s.ah_rating}ah`);
  if (s.voltage != null) specs.push(`${s.voltage}v`);
  if (s.wattage != null) specs.push(`${s.wattage}w`);
  if (s.plates != null) specs.push(`${s.plates}plates`);
  return `${s.brand} ${s.model} ${s.type ?? ""} ${categoryLabel(s.category)} ${specs.join(" ")}`.toLowerCase();
}

/** How many of the typed words appear in the item. */
export function stockMatchScore(s: StockSearchable, query: string): number {
  const hay = stockHaystack(s);
  return searchWords(query).filter((w) => hay.includes(w)).length;
}

/** True when every typed word is found in the item's brand, model, type, category or specs. */
export function stockMatches(s: StockSearchable, query: string): boolean {
  const words = searchWords(query);
  if (words.length === 0) return true;
  const hay = stockHaystack(s);
  return words.every((w) => hay.includes(w));
}

/* ---------- Add / edit item rules (shared by the Add item form and the AI assistant) ---------- */

/** Every field is text, exactly as typed in the Add item form. */
export type ItemFormValues = {
  category: Category;
  brand: string;
  model: string;
  type: string;
  voltage: string;
  plates: string;
  ah_rating: string;
  wattage: string;
  warranty_months: string;
  cost_price: string;
  sale_price: string;
  quantity: string;
  reorder_level: string;
  hs_code: string;
  uom: string;
  // FBR tax setup. Optional so the AI assistant's item proposals (which never set them) keep working.
  sale_type?: string;
  fbr_rate_desc?: string;
  is_taxable?: boolean;
  retail_price?: string;
  sro_schedule_no?: string;
  sro_item_serial_no?: string;
};

export type ItemErrors = Partial<Record<keyof ItemFormValues, string>>;

/** A money amount with up to 2 decimals. */
export const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const WHOLE = /^\d+$/;

type SpecKey = "voltage" | "plates" | "ah_rating" | "wattage" | "warranty_months";

export function validateItem(f: ItemFormValues, opts?: { fbrOn?: boolean }): ItemErrors {
  const e: ItemErrors = {};
  if (!f.brand.trim()) e.brand = "Enter the brand.";
  if (!f.model.trim()) e.model = "Enter the model.";
  if (f.category === "battery" && !f.type) e.type = "Choose the battery type.";

  const optionalDecimal = (key: SpecKey, label: string) => {
    const v = f[key].trim();
    if (v && (!MONEY_RE.test(v) || Number(v) <= 0)) e[key] = `${label} must be a number above 0.`;
  };
  const optionalWhole = (key: SpecKey, label: string) => {
    const v = f[key].trim();
    if (v && (!WHOLE.test(v) || Number(v) <= 0)) e[key] = `${label} must be a whole number above 0.`;
  };

  if (f.category === "battery") {
    optionalDecimal("voltage", "Voltage");
    optionalWhole("plates", "Plates");
    optionalDecimal("ah_rating", "Ah rating");
  }
  if (f.category === "panel") optionalWhole("wattage", "Wattage");
  optionalWhole("warranty_months", "Warranty");

  if (!MONEY_RE.test(f.cost_price.trim())) e.cost_price = "Enter the cost price, for example 42000. Up to 2 decimals.";
  if (!MONEY_RE.test(f.sale_price.trim())) e.sale_price = "Enter the sale price, for example 45000. Up to 2 decimals.";
  if (!WHOLE.test(f.quantity.trim())) e.quantity = "Enter a whole number, 0 or more.";
  if (!WHOLE.test(f.reorder_level.trim())) e.reorder_level = "Enter a whole number, 0 or more.";

  const hs = f.hs_code.trim();
  if (hs && !/^\d{4}\.\d{4}$/.test(hs)) e.hs_code = "Use 4 digits, a dot, then 4 digits. Example: 8507.2000";
  if (!f.uom.trim()) e.uom = "Enter the unit of measure.";

  // FBR tax setup (only checked when the form has these fields)
  if (f.is_taxable !== undefined) {
    const rp = (f.retail_price ?? "").trim();
    if (rp && (!MONEY_RE.test(rp) || Number(rp) <= 0)) e.retail_price = "Retail price must be a number above 0.";
    if (/^3rd schedule/i.test(f.sale_type ?? "") && !rp) e.retail_price = "Third Schedule items need the printed retail price.";
    if (f.is_taxable && opts?.fbrOn) {
      const rate = (f.fbr_rate_desc ?? "").trim();
      if (!rate) e.fbr_rate_desc = "Enter the GST rate, for example 18%.";
      else if (!/^\d+(\.\d+)?\s*%$/.test(rate) && !/^exempt/i.test(rate)) e.fbr_rate_desc = "Use a form like 18%, or Exempt.";
      if (!hs) e.hs_code = "A taxable item needs an HS code for FBR. Example: 8507.2000";
    }
    if (/reduced|^exempt/i.test(f.sale_type ?? "")) {
      if (!(f.sro_schedule_no ?? "").trim()) e.sro_schedule_no = "Enter the SRO / Schedule number (FBR error 0077).";
      if (!(f.sro_item_serial_no ?? "").trim()) e.sro_item_serial_no = "Enter the SRO item serial (FBR error 0078).";
    }
  }

  return e;
}

/** The exact row that gets saved to the inventory table. Call only after validateItem() found no errors. */
export function itemPayload(f: ItemFormValues) {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const isBattery = f.category === "battery";
  const isPanel = f.category === "panel";
  return {
    category: f.category,
    brand: f.brand.trim(),
    model: f.model.trim(),
    type: f.type.trim() || null,
    voltage: isBattery ? num(f.voltage) : null,
    plates: isBattery ? num(f.plates) : null,
    ah_rating: isBattery ? num(f.ah_rating) : null,
    wattage: isPanel ? num(f.wattage) : null,
    warranty_months: num(f.warranty_months),
    cost_price: Number(f.cost_price),
    sale_price: Number(f.sale_price),
    quantity: Number(f.quantity),
    reorder_level: Number(f.reorder_level),
    hs_code: f.hs_code.trim() || null,
    uom: f.uom.trim(),
    // FBR fields are saved only when the form has them, so nothing is overwritten by forms that do not.
    ...(f.is_taxable === undefined
      ? {}
      : {
          is_taxable: f.is_taxable,
          sale_type: (f.sale_type ?? "").trim() || "Goods at standard rate (default)",
          fbr_rate_desc: (f.fbr_rate_desc ?? "").trim() || null,
          retail_price: (f.retail_price ?? "").trim() === "" ? null : Number(f.retail_price),
          sro_schedule_no: (f.sro_schedule_no ?? "").trim() || null,
          sro_item_serial_no: (f.sro_item_serial_no ?? "").trim() || null,
        }),
  };
}
