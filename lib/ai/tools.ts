/**
 * Tools the AI assistant can ask the server to run.
 *  - Part 2: two READ-ONLY lookups (one inventory item, one customer).
 *  - Part 3: three "propose_*" tools. These only PREPARE a bill / item / customer:
 *    they validate it and save a proposal (lib/ai/proposals.ts). Nothing is written to
 *    the shop's data until a person taps Confirm on the card in the chat.
 *
 * Safety rules baked in here (change them only on purpose):
 *  - The lookups are READ-ONLY. Nothing in this file inserts, updates or deletes.
 *    The propose_* tools never write shop data either — see lib/ai/proposals.ts.
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
import { buildBillProposal, buildCustomerProposal, buildItemProposal, proposeAction, type ToolContext } from "@/lib/ai/proposals";
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
  {
    type: "function",
    function: {
      name: "propose_bill",
      description:
        "Prepare a sale bill for the person to confirm. This does NOT save anything: it shows a confirmation card. Use when they ask to bill, sell or make an invoice for someone. Never guess: if the customer, an item, a quantity, or how much they paid is unclear, ask first. Only pass a rate if the person stated a price; otherwise leave it out so the normal price is used. Totals are calculated by the app.",
      parameters: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Saved customer's name or phone. Leave out for a walk-in cash sale." },
          walk_in_name: { type: "string", description: "Optional name for a walk-in buyer who is not a saved customer." },
          items: {
            type: "array",
            description: "What is being sold.",
            items: {
              type: "object",
              properties: {
                item: { type: "string", description: "Short keywords for the stock item, e.g. 'phoenix 150ah'." },
                quantity: { type: "integer", description: "How many. Whole number, 1 or more." },
                rate: { type: "number", description: "Price per piece, ONLY if the person stated one." },
              },
              required: ["item", "quantity"],
            },
          },
          payment: { type: "string", enum: ["paid", "udhaar", "partial"], description: "paid = full payment now (cash sale), udhaar = nothing paid now, partial = some paid now. Ask if unclear." },
          amount_paid: { type: "number", description: "Only for partial: how much is paid now." },
          payment_method: { type: "string", enum: ["cash", "bank", "other"], description: "Defaults to cash." },
          note: { type: "string", description: "Optional note, e.g. a vehicle number." },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_item",
      description:
        "Prepare a NEW stock item to add to inventory, for the person to confirm. This does NOT save anything. It cannot add stock to an item that already exists. Cost price and sale price are required: if the person didn't give them, ask. Never guess prices or specs.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["battery", "panel", "accessory"] },
          brand: { type: "string" },
          model: { type: "string" },
          type: { type: "string", description: "Battery: Lithium, Tubular, Lead-acid or Dry. Required for batteries." },
          voltage: { type: "number", description: "Volts, batteries only." },
          plates: { type: "integer", description: "Number of plates, batteries only." },
          ah_rating: { type: "number", description: "Ah, batteries only." },
          wattage: { type: "integer", description: "Watts, solar panels only." },
          warranty_months: { type: "integer" },
          cost_price: { type: "number", description: "What the shop pays per piece. Required." },
          sale_price: { type: "number", description: "What the shop sells for per piece. Required." },
          quantity: { type: "integer", description: "Starting stock." },
          reorder_level: { type: "integer", description: "Low-stock warning level." },
        },
        required: ["category", "brand", "model", "cost_price", "sale_price"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_customer",
      description:
        "Prepare a NEW customer to save, for the person to confirm. This does NOT save anything. Only the name is required; do not invent a phone number or address.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
          registered: { type: "boolean", description: "True only if they have an NTN/CNIC on the tax record." },
          cnic_or_ntn: { type: "string", description: "13-digit CNIC or 7-digit NTN. Required if registered." },
        },
        required: ["name"],
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
export async function runTool(ctx: ToolContext, name: string, rawArgs: string): Promise<string> {
  const args = parseArgs(rawArgs);
  if (!args) return toolError("The lookup arguments were not valid.");
  try {
    if (name === "lookup_inventory") return await lookupInventory(ctx.supabase, args);
    if (name === "lookup_customer") return await lookupCustomer(ctx.supabase, args);
    if (name === "propose_bill") return await proposeAction(ctx, buildBillProposal, args);
    if (name === "propose_item") return await proposeAction(ctx, buildItemProposal, args);
    if (name === "propose_customer") return await proposeAction(ctx, buildCustomerProposal, args);
    return toolError(`There is no tool called ${name}.`);
  } catch {
    return toolError("That step failed unexpectedly. Nothing was saved.");
  }
}

/** Friendly names for the small "Looked up: …" note under a reply. */
export const TOOL_LABELS: Record<string, string> = {
  lookup_inventory: "stock",
  lookup_customer: "customers",
  propose_bill: "bill",
  propose_item: "new item",
  propose_customer: "new customer",
};
