/**
 * Tools the AI assistant can ask the server to run.
 *  - Part 2: READ-ONLY lookups (inventory item, customer, and — for selling scrap — the scrap pile).
 *  - Part 3: "propose_*" tools. These only PREPARE a bill / item / customer / scrap intake /
 *    scrap sale / charging slip / battery claim:
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
import {
  buildBillProposal,
  buildChargingProposal,
  buildClaimProposal,
  buildCustomerProposal,
  buildItemProposal,
  buildScrapAddProposal,
  buildScrapSaleProposal,
  proposeAction,
  type ToolContext,
} from "@/lib/ai/proposals";
import { scrapIntakeMatches } from "@/lib/scrapBattery";
import type { Category, Customer, InventoryItem, ScrapBatteryInventory } from "@/lib/types";

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
  {
    type: "function",
    function: {
      name: "lookup_scrap",
      description:
        "Show the old (scrap) batteries currently in stock, with their batch numbers, so you can tell the person what is there or which batches to sell. Use before propose_scrap_sale unless the person already gave exact batch numbers. Pass a short keyword to narrow it (brand, customer, batch number), or nothing to see the newest batches.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional short keywords, e.g. 'osaka' or 'SCR-0004'." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_scrap_add",
      description:
        "Prepare an OLD battery to add to the scrap pile (a battery that came in on its own, not through a bill), for the person to confirm. This does NOT save anything. Brand, model and quantity are required: ask if missing. Weight is optional (usually weighed when sold).",
      parameters: {
        type: "object",
        properties: {
          brand: { type: "string" },
          model: { type: "string" },
          quantity: { type: "integer", description: "How many old batteries. Whole number, 1 or more." },
          battery_type: { type: "string", description: "Optional: Lithium, Tubular, Lead-acid or Dry." },
          battery_number: { type: "string", description: "Optional serial or plate number." },
          weight_kg: { type: "number", description: "Optional total weight in kg, ONLY if the person said it." },
          customer_name: { type: "string", description: "Optional: who brought it in." },
          received_date: { type: "string", description: "YYYY-MM-DD. Leave out for today." },
          note: { type: "string" },
        },
        required: ["brand", "model", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_scrap_sale",
      description:
        "Prepare a sale of scrap batteries to a scrap buyer (kabari), for the person to confirm. This does NOT save anything. Needs: which batches (intake_numbers from lookup_scrap, or sell_all true for the whole pile), the buyer's name, the total weight in kg and the rate per kg. Never guess a weight or a rate: ask. The total is calculated by the app.",
      parameters: {
        type: "object",
        properties: {
          intake_numbers: { type: "array", items: { type: "string" }, description: "Batch numbers being sold, exactly as shown by lookup_scrap." },
          sell_all: { type: "boolean", description: "True only if the person said to sell the whole scrap pile." },
          buyer_name: { type: "string" },
          buyer_phone: { type: "string" },
          total_weight_kg: { type: "number", description: "Total weight of the lot in kg. Required." },
          rate_per_kg: { type: "number", description: "Price per kg. Required." },
          sale_date: { type: "string", description: "YYYY-MM-DD. Leave out for today." },
          note: { type: "string" },
        },
        required: ["buyer_name", "total_weight_kg", "rate_per_kg"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_charging_slip",
      description:
        "Prepare a charging slip (a customer's OWN battery dropped off to be charged) for the person to confirm. This does NOT save anything. Needs the battery brand and model and the charging price the person states: ask if missing, never guess. The customer can be a saved customer or a walk-in.",
      parameters: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Saved customer's name or phone. Leave out for a walk-in." },
          walk_in_name: { type: "string", description: "Optional name for a walk-in who is not saved." },
          walk_in_phone: { type: "string", description: "Optional phone for a walk-in." },
          battery_brand: { type: "string" },
          battery_model: { type: "string" },
          battery_number: { type: "string", description: "Optional serial or plate number." },
          price: { type: "number", description: "Charging price in Rs. Required; 0 is allowed." },
          received_date: { type: "string", description: "YYYY-MM-DD. Leave out for today." },
          note: { type: "string" },
        },
        required: ["battery_brand", "battery_model", "price"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_battery_claim",
      description:
        "Prepare a battery warranty claim (a battery the shop SOLD, coming back to be sent to its distributor) for the person to confirm. This does NOT save anything. Needs the battery brand and model. The original bill number, distributor, claim amount and extra charges are optional: only pass what the person said. The customer can be a saved customer or a walk-in.",
      parameters: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Saved customer's name or phone. Leave out for a walk-in." },
          walk_in_name: { type: "string", description: "Optional name for a walk-in who is not saved." },
          walk_in_phone: { type: "string", description: "Optional phone for a walk-in." },
          battery_brand: { type: "string" },
          battery_model: { type: "string" },
          battery_number: { type: "string", description: "Optional serial or plate number." },
          original_bill: { type: "string", description: "Optional bill number of the original sale." },
          distributor: { type: "string", description: "Optional distributor name." },
          claim_amount: { type: "number", description: "Optional: value of the replacement to recover from the distributor." },
          extra_charges: { type: "number", description: "Optional: acid, service charges etc. collected from the customer." },
          received_date: { type: "string", description: "YYYY-MM-DD. Leave out for today." },
          note: { type: "string" },
        },
        required: ["battery_brand", "battery_model"],
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

/* -------------------------------------------------------------------- scrap */

type ScrapLookupRow = Pick<
  ScrapBatteryInventory,
  "intake_number" | "brand" | "model" | "battery_type" | "battery_number" | "quantity" | "estimated_weight_kg" | "customer_name" | "note" | "received_date"
>;

const MAX_SCRAP_RESULTS = 15;

async function lookupScrap(supabase: Supa, args: Record<string, unknown>): Promise<string> {
  const query = cleanQuery(args.query);
  const { data, error } = await supabase
    .from("scrap_battery_inventory")
    .select("intake_number,brand,model,battery_type,battery_number,quantity,estimated_weight_kg,customer_name,note,received_date")
    .eq("status", "in_stock")
    .order("received_date", { ascending: false })
    .order("intake_number", { ascending: false })
    .limit(2000);
  if (error) return toolError("Couldn't read the scrap pile right now.");

  const all = (data ?? []) as ScrapLookupRow[];
  if (all.length === 0) return JSON.stringify({ batches_in_stock: 0, note: "There is no scrap in stock." });

  const matched = query ? all.filter((r) => scrapIntakeMatches(r as ScrapBatteryInventory, query)) : all;
  if (matched.length === 0) return JSON.stringify({ total_matches: 0, note: "No scrap batch matches that. Say you couldn't find it." });

  const weighed = matched.filter((r) => r.estimated_weight_kg != null);
  return JSON.stringify({
    total_matches: matched.length,
    showing: Math.min(matched.length, MAX_SCRAP_RESULTS),
    batteries_in_matches: matched.reduce((sum, r) => sum + r.quantity, 0),
    ...(weighed.length > 0 ? { estimated_weight_kg_where_known: round2(weighed.reduce((sum, r) => sum + (r.estimated_weight_kg ?? 0), 0)) } : {}),
    batches: matched.slice(0, MAX_SCRAP_RESULTS).map((r) => ({
      batch_number: r.intake_number,
      name: `${r.brand} ${r.model}`,
      type: r.battery_type ?? "not given",
      quantity: r.quantity,
      received: formatDay(r.received_date),
      ...(r.customer_name ? { from: r.customer_name } : {}),
      ...(r.estimated_weight_kg != null ? { weight_kg: r.estimated_weight_kg } : {}),
    })),
    ...(matched.length > MAX_SCRAP_RESULTS ? { note: `Only the newest ${MAX_SCRAP_RESULTS} batches are listed; the totals cover all ${matched.length}.` } : {}),
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
    if (name === "lookup_scrap") return await lookupScrap(ctx.supabase, args);
    if (name === "propose_scrap_add") return await proposeAction(ctx, buildScrapAddProposal, args);
    if (name === "propose_scrap_sale") return await proposeAction(ctx, buildScrapSaleProposal, args);
    if (name === "propose_charging_slip") return await proposeAction(ctx, buildChargingProposal, args);
    if (name === "propose_battery_claim") return await proposeAction(ctx, buildClaimProposal, args);
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
  lookup_scrap: "scrap",
  propose_scrap_add: "scrap intake",
  propose_scrap_sale: "scrap sale",
  propose_charging_slip: "charging slip",
  propose_battery_claim: "battery claim",
};
