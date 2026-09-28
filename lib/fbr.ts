/** FBR helpers shared by the New bill, Inventory, Customer and FBR lists screens. */

export type FbrKind = "hs_code" | "uom" | "province" | "rate" | "sale_type" | "sro" | "hs_uom";

export const FBR_KINDS: { kind: FbrKind; label: string; hint: string }[] = [
  { kind: "province", label: "Provinces", hint: "FBR /pdi/v1/provinces" },
  { kind: "uom", label: "Units of measure", hint: "FBR /pdi/v1/uom" },
  { kind: "hs_code", label: "HS codes", hint: "FBR /pdi/v1/itemdesccode" },
  { kind: "sale_type", label: "Sale types", hint: "FBR /pdi/v1/transtypecode" },
  { kind: "rate", label: "Tax rates", hint: "FBR /pdi/v2/SaleTypeToRate" },
  { kind: "sro", label: "SRO items", hint: "FBR /pdi/v2/SROItem" },
];

/**
 * Used only until the real FBR list is loaded. The spelling MUST match the FBR provinces list
 * (FBR error 0073/0074). Load the real list on the FBR lists page and it replaces these.
 */
export const FALLBACK_PROVINCES = [
  "SINDH",
  "PUNJAB",
  "KHYBER PAKHTUNKHWA",
  "BALOCHISTAN",
  "CAPITAL TERRITORY",
  "GILGIT BALTISTAN",
  "AZAD JAMMU AND KASHMIR",
];

export const FALLBACK_SALE_TYPES = [
  "Goods at standard rate (default)",
  "Goods at Reduced Rate",
  "3rd Schedule Goods",
  "Exempt goods",
  "Goods at zero-rate",
];

export const FALLBACK_RATES = ["18%", "10%", "0%", "Exempt"];

export type FbrRefRow = { code: string; label: string | null; payload: Record<string, unknown> | null };

export type FbrSettings = {
  enabled: boolean;
  environment: "sandbox" | "production";
  pricesIncludeTax: boolean;
  shopProvince: string | null;
};

export const FBR_OFF: FbrSettings = { enabled: false, environment: "sandbox", pricesIncludeTax: false, shopProvince: null };

/** Item fields an FBR bill needs. */
export type FbrItemFields = {
  hs_code?: string | null;
  uom?: string | null;
  sale_type?: string | null;
  fbr_rate_desc?: string | null;
  is_taxable?: boolean | null;
  retail_price?: number | null;
  sro_schedule_no?: string | null;
  sro_item_serial_no?: string | null;
};

/**
 * Turns the list FBR sends back (or what is pasted from the FBR portal / Postman) into rows for fbr_reference.
 * FBR uses different key names per list, so we look for the usual ones, ignoring upper/lower case.
 * Rows we cannot read are skipped and counted.
 */
const KEYS: Record<FbrKind, { code: string[]; label: string[] }> = {
  province: { code: ["stateprovincedesc", "province", "name"], label: ["stateprovincedesc", "province", "name"] },
  uom: { code: ["description", "uom", "uom_desc"], label: ["description", "uom", "uom_desc"] },
  hs_code: { code: ["hs_code", "hscode"], label: ["description", "hs_description"] },
  sale_type: { code: ["transaction_desc", "transactiontypedesc", "description", "saletype"], label: ["transaction_desc", "transactiontypedesc", "description", "saletype"] },
  rate: { code: ["rate_desc", "ratedesc"], label: ["rate_desc", "ratedesc"] },
  sro: { code: ["sro_desc", "srodesc", "sro_item_desc"], label: ["sro_desc", "srodesc", "sro_item_desc"] },
  hs_uom: { code: ["hs_code", "hscode"], label: ["description"] },
};

function pick(obj: Record<string, unknown>, names: string[]): string | null {
  const lower = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase().replace(/[^a-z_]/g, ""), v]));
  for (const n of names) {
    const v = lower.get(n);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

export function parseFbrList(kind: FbrKind, raw: string): { items: { code: string; label: string; payload: unknown }[]; skipped: number } {
  const data: unknown = JSON.parse(raw);
  const arr = Array.isArray(data) ? data : [];
  const out: { code: string; label: string; payload: unknown }[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of arr) {
    if (!row || typeof row !== "object") {
      skipped++;
      continue;
    }
    const o = row as Record<string, unknown>;
    const code = pick(o, KEYS[kind].code);
    const label = pick(o, KEYS[kind].label) ?? code;
    if (!code || seen.has(code)) {
      skipped++;
      continue;
    }
    seen.add(code);
    out.push({ code, label: label ?? code, payload: o });
  }
  return { items: out, skipped };
}
