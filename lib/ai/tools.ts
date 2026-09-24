/**
 * Read-only lookup tools the AI assistant can ask the server to run
 * (Phase 10, Part 2). Two tools: one inventory item, one customer.
 *
 * Safety rules baked in here (change them only on purpose):
 *  - READ-ONLY. Nothing in this file inserts, updates or deletes. Write actions
 *    are Part 3 and will go through the same create_invoice() RPC as the app.
 *  - Runs with the signed-in user's session, so Row Level Security still applies.
 *  - Search rules are the app's own (`stockMatches` in lib/inventory.ts,
 *    `customerMatches` in lib/customers.ts) — the same ones the search box uses.
 *  - Small on purpose: at most a handful of rows come back, and only the fields
 *    a question actually needs. NOT sent to the AI provider: cost price, CNIC/NTN,
 *    addresses, or any customer who wasn't matched by the question.
 *  - All money totals are computed here from real rows, never by the model.
 *
 * Server-only. Never import from a "use client" component.
 */
import type { createClient } from "@/lib/supabase/server";
import { customerMatches, formatPhone } from "@/lib/customers";
import { categoryLabel, isLow, isOut, itemSpecs, stockMatches, stockMatchScore } from "@/lib/inventory";
import { formatDay, round2 } from "@/lib/invoices";
import { formatRs } from "@/lib/format";
import type { ToolDef } from "@/lib/ai/groq";
import type { Category, Customer, InventoryItem } from "@/lib/types";

type Supa = Awaited<ReturnType<typeof createClient>>;

const MAX_ITEM_RESULTS = 8;
const MAX_CUSTOMER_RESULTS = 5;
const MAX_DUE_BILLS_PER_CUSTOMER = 5;
const MAX_QUERY_CHARS = 100;

export const TOOL_DEFS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "lookup_inventory",
      description:
        "Look up specific stock items (batteries, solar panels, accessories) by brand, model, type or size to get their exact quantity in stock and sale price. Use this whenever the question is about a particular item or a group of items, e.g. 'how many Osaka 200Ah tubular do we have', 'price of Phoenix 150Ah', 'which solar panels are low'. Pass short keywords only (brand, model, Ah or watt size, type), not the whole sentence.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Short keywords, e.g. 'osaka 200ah tubular'." },
          category: { type: "string", enum: ["battery", "panel", "accessory"], description: "Optional. Narrow to one kind of item." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_customer",
      description:
        "Look up a customer by name or phone number to see how much udhaar (unpaid balance) they owe, how many bills they have, and which bills are still unpaid. Use this for any question about one particular customer, e.g. 'does Ali Traders owe us anything', 'kitna udhaar hai Bilal ka'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The customer's name or phone number, e.g. 'ali traders' or '0300 1234567'." },
        },
        required: ["query"],
      },
    },
  },
];

/** What the model gets when a tool can't run. Written so the model can explain it to a person. */
function toolError(message: string): string {
  return JSON.stringify({ error: message });
}

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function cleanQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_QUERY_CHARS) : "";
}

/* ---------------------------------------------------------------- inventory */

type StockRow = Pick<
  InventoryItem,
  "category" | "brand" | "model" | "type" | "voltage" | "plates" | "ah_rating" | "wattage" | "warranty_months" | "sale_price" | "quantity" | "reorder_level"
>;

function describeStock(s: StockRow) {
  return {
    name: `${s.brand} ${s.model}`,
    kind: categoryLabel(s.category),
    specs: itemSpecs(s as InventoryItem),
    quantity_in_stock: s.quantity,
    stock_status: isOut(s) ? "out of stock" : isLow(s) ? `low (at or below reorder level of ${s.reorder_level})` : "in stock",
    sale_price: formatRs(s.sale_price),
  };
}

async function lookupInventory(supabase: Supa, args: Record<string, unknown>): Promise<string> {
  const query = cleanQuery(args.query);
  const category = ["battery", "panel", "accessory"].includes(String(args.category)) ? (args.category as Category) : null;
  if (!query && !category) return toolError("No search words were given.");

  const { data, error } = await supabase
    .from("inventory")
    .select("category,brand,model,type,voltage,plates,ah_rating,wattage,warranty_months,sale_price,quantity,reorder_level")
    .order("brand")
    .limit(2000);
  if (error) return toolError("Couldn't read the inventory right now.");

  const all = (data ?? []) as StockRow[];
  const pool = category ? all.filter((s) => s.category === category) : all;

  const exact = pool.filter((s) => stockMatches(s, query));
  if (exact.length > 0) {
    return JSON.stringify({
      match_type: "all search words matched",
      total_matches: exact.length,
      showing: Math.min(exact.length, MAX_ITEM_RESULTS),
      items: exact.slice(0, MAX_ITEM_RESULTS).map(describeStock),
    });
  }

  // Nothing matched every word (a typo, or a word that isn't in the item name).
  // Offer the closest few, clearly labelled, so the model can ask "did you mean...".
  const closest = pool
    .map((s) => ({ s, score: stockMatchScore(s, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (closest.length > 0) {
    return JSON.stringify({
      match_type: "no exact match — these only match some of the words, mention that they are close guesses",
      total_matches: closest.length,
      items: closest.map((r) => describeStock(r.s)),
    });
  }

  return JSON.stringify({ total_matches: 0, note: "No stock item matches that. Say you couldn't find it and ask for the brand, model or size." });
}

/* ---------------------------------------------------------------- customers */

type CustomerRow = Pick<Customer, "id" | "name" | "phone" | "address" | "cnic_or_ntn" | "registration_type">;
type BillRow = { customer_id: string | null; invoice_number: string; invoice_date: string; total_value: number; due_total: number };

async function lookupCustomer(supabase: Supa, args: Record<string, unknown>): Promise<string> {
  const query = cleanQuery(args.query);
  if (!query) return toolError("No customer name or phone was given.");

  const { data, error } = await supabase
    .from("customers")
    .select("id,name,phone,address,cnic_or_ntn,registration_type")
    .order("name")
    .limit(2000);
  if (error) return toolError("Couldn't read the customers right now.");

  const matches = ((data ?? []) as CustomerRow[]).filter((c) => customerMatches(c, query));
  if (matches.length === 0) {
    return JSON.stringify({
      total_matches: 0,
      note: "No saved customer matches that name or number. (A walk-in buyer who was never saved as a customer won't appear here.) Say you couldn't find them.",
    });
  }

  const shown = matches.slice(0, MAX_CUSTOMER_RESULTS);
  const ids = shown.map((c) => c.id);

  // Same rule as the Home screen's udhaar total: bills that aren't cancelled, money still due.
  const { data: billData, error: billError } = await supabase
    .from("invoice_balances")
    .select("customer_id,invoice_number,invoice_date,total_value,due_total")
    .in("customer_id", ids)
    .neq("status", "Cancelled")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (billError) return toolError("Found the customer but couldn't read their bills right now.");

  const bills = (billData ?? []) as BillRow[];

  const customers = shown.map((c) => {
    const mine = bills.filter((b) => b.customer_id === c.id);
    const unpaid = mine.filter((b) => b.due_total > 0);
    const owed = round2(unpaid.reduce((sum, b) => sum + b.due_total, 0));
    return {
      name: c.name,
      phone: c.phone ? formatPhone(c.phone) : "not saved",
      customer_type: c.registration_type,
      total_bills: mine.length,
      total_billed: formatRs(round2(mine.reduce((sum, b) => sum + b.total_value, 0))),
      udhaar_owed: formatRs(owed),
      unpaid_bill_count: unpaid.length,
      unpaid_bills: unpaid.slice(0, MAX_DUE_BILLS_PER_CUSTOMER).map((b) => ({
        bill: b.invoice_number,
        date: formatDay(b.invoice_date),
        bill_total: formatRs(b.total_value),
        still_due: formatRs(b.due_total),
      })),
      ...(unpaid.length > MAX_DUE_BILLS_PER_CUSTOMER ? { unpaid_bills_note: `Only the newest ${MAX_DUE_BILLS_PER_CUSTOMER} unpaid bills are listed; the udhaar_owed total covers all ${unpaid.length}.` } : {}),
    };
  });

  return JSON.stringify({
    total_matches: matches.length,
    showing: shown.length,
    ...(matches.length > 1 ? { note: "More than one customer matched. If the person meant one specific customer, list the names and ask which one." } : {}),
    customers,
  });
}

/* ------------------------------------------------------------------ runner */

/** Runs one tool call from the model. Never throws — problems come back as a JSON error string. */
export async function runTool(supabase: Supa, name: string, rawArgs: string): Promise<string> {
  const args = parseArgs(rawArgs);
  if (!args) return toolError("The lookup arguments were not valid.");
  try {
    if (name === "lookup_inventory") return await lookupInventory(supabase, args);
    if (name === "lookup_customer") return await lookupCustomer(supabase, args);
    return toolError(`There is no tool called ${name}. Only lookup_inventory and lookup_customer exist.`);
  } catch {
    return toolError("The lookup failed unexpectedly.");
  }
}

/** Friendly names for the small "Looked up: …" note under a reply. */
export const TOOL_LABELS: Record<string, string> = {
  lookup_inventory: "stock",
  lookup_customer: "customers",
};
