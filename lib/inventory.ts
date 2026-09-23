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
  "Battery water",
  "Battery charger",
  "Charge controller",
  "Solar cable",
  "MC4 connector",
  "Mounting structure",
  "Battery terminal",
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
