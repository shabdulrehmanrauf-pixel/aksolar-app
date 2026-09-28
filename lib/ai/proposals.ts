/**
 * Phase 10, Part 3 — Propose -> Confirm -> Execute.
 *
 * The AI can only PREPARE things here. `buildBill/Item/Customer/ScrapAdd/ScrapSale/Charging/ClaimProposal` check the
 * request against real inventory and customer rows and save a proposal to the
 * ai_actions table. Nothing in the shop changes. A person then taps Confirm on the
 * card, which calls `decideAction()` below — the only place anything is written.
 *
 * Rules this file keeps (change only on purpose):
 *  - The AI never picks an id. Items and customers are found by name using the app's
 *    own search (stockMatches / customerMatches). Zero or several matches = ask, never guess.
 *  - Totals come from lineAmount()/round2(), exactly like NewBill.tsx. The database
 *    recalculates them again inside create_invoice(). An AI-stated total is never used.
 *  - Bills are saved ONLY through the same create_invoice() RPC as the New bill screen.
 *    Items and customers use the same validation as their forms (validateItem, validateCustomer).
 *  - A proposal can be confirmed once (atomic claim in SQL), only by the user who got it,
 *    and only for 30 minutes. Everything is logged in ai_actions.
 *  - Runs with the signed-in user's session, so Row Level Security still applies.
 *
 * Server-only. Never import from a "use client" component.
 */
import type { createClient } from "@/lib/supabase/server";
import {
  customerMatches,
  customerPayload,
  formatPhone,
  isValidPhone,
  normalizePhone,
  validateCustomer,
  type CustomerFormValues,
} from "@/lib/customers";
import {
  BATTERY_TYPES,
  DEFAULT_UOM,
  itemPayload,
  itemSpecs,
  normalizeType,
  stockMatches,
  stockMatchScore,
  validateItem,
  type ItemFormValues,
} from "@/lib/inventory";
import { addDays, friendlyInvoiceError, lineAmount, parseAmount, parseQty, round2, todayKarachi } from "@/lib/invoices";
import { CHARGING_HOLD_DAYS } from "@/lib/chargingJobs";
import { formatRs } from "@/lib/format";
import type { Category, Customer, InventoryItem, PaymentMethod, ScrapBatteryInventory } from "@/lib/types";
import {
  PROPOSAL_MINUTES,
  type ActionDecision,
  type ActionResponse,
  type BillProposal,
  type ChargingProposal,
  type ClaimProposal,
  type CustomerProposal,
  type ItemProposal,
  type Proposal,
  type ProposalCard,
  type ScrapAddProposal,
  type ScrapSaleProposal,
  type SlipCustomer,
} from "@/lib/ai/proposalTypes";

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Everything a tool call needs. `proposals` collects the cards to send back to the chat. */
export type ToolContext = { supabase: Supa; userMessage: string; proposals: ProposalCard[] };

/** What a builder returns: a validated proposal, or a plain-English problem for the AI to relay. */
type Built = { ok: true; proposal: Proposal; forModel: Record<string, unknown> } | { ok: false; error: string };

const fail = (error: string): Built => ({ ok: false, error });

const MAX_LINES = 20;
const MAX_TEXT = 120;

function text(v: unknown, max = MAX_TEXT): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** A number typed by the AI as text the way a person would ("45000", "2"), or "" when not given. */
function numText(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v.trim().replace(/,/g, "");
  return "";
}

function tableMissing(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "PGRST205";
}

const NOT_SET_UP =
  "The assistant's action log isn't set up yet. Run supabase/10_ai_actions.sql in Supabase (SQL Editor), then try again.";

/* =============================================================== create_bill */

type StockRow = Pick<
  InventoryItem,
  "id" | "category" | "brand" | "model" | "type" | "voltage" | "plates" | "ah_rating" | "wattage" | "warranty_months" | "cost_price" | "sale_price" | "quantity"
>;
type CustomerRow = Pick<Customer, "id" | "name" | "phone" | "address" | "cnic_or_ntn" | "registration_type">;

function stockName(s: Pick<StockRow, "brand" | "model">) {
  return `${s.brand} ${s.model}`;
}

/** Finds exactly one stock item for what the AI typed, or explains why not. */
function resolveStock(pool: StockRow[], query: string): { item: StockRow } | { error: string } {
  const matches = pool.filter((s) => stockMatches(s, query));
  if (matches.length === 1) return { item: matches[0] };
  if (matches.length > 1) {
    const exact = matches.filter((s) => stockName(s).toLowerCase() === query.toLowerCase());
    if (exact.length === 1) return { item: exact[0] };
    const list = matches
      .slice(0, 6)
      .map((s) => `${stockName(s)} (${itemSpecs(s as InventoryItem) || "no specs"}, ${s.quantity} in stock)`)
      .join("; ");
    return { error: `"${query}" matches ${matches.length} stock items: ${list}. Ask the person which one they mean, then try again.` };
  }
  const close = pool
    .map((s) => ({ s, score: stockMatchScore(s, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((r) => stockName(r.s));
  return {
    error:
      `No stock item matches "${query}".${close.length ? ` Closest names: ${close.join("; ")}.` : ""} ` +
      `If none of those are right and this is a genuinely new item, don't just refuse the bill: ask the person for its ` +
      `category, brand, model, spec, cost price and sale price, use propose_item to add it, and once they confirm that ` +
      `card, make the bill again with the same item name. Never guess the price yourself.`,
  };
}

export async function buildBillProposal(ctx: ToolContext, args: Record<string, unknown>): Promise<Built> {
  const { supabase } = ctx;

  const rawItems = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
  if (rawItems.length === 0) return fail("No items were given. Ask what is being sold.");
  if (rawItems.length > MAX_LINES) return fail(`A bill can have at most ${MAX_LINES} lines here.`);

  const [stockRes, custRes] = await Promise.all([
    supabase
      .from("inventory")
      .select("id,category,brand,model,type,voltage,plates,ah_rating,wattage,warranty_months,cost_price,sale_price,quantity")
      .order("brand")
      .limit(2000),
    supabase.from("customers").select("id,name,phone,address,cnic_or_ntn,registration_type").order("name").limit(2000),
  ]);
  if (stockRes.error || custRes.error) return fail("Couldn't read stock or customers right now. Try again.");
  const stock = (stockRes.data ?? []) as StockRow[];
  const people = (custRes.data ?? []) as CustomerRow[];

  /* ---- customer ---- */
  const warnings: string[] = [];
  const custQuery = text(args.customer);
  const walkInName = text(args.walk_in_name);
  let customer: BillProposal["customer"];

  if (custQuery) {
    const found = people.filter((c) => customerMatches(c, custQuery));
    let pick: CustomerRow | null = null;
    if (found.length === 1) pick = found[0];
    else if (found.length > 1) {
      const exact = found.filter((c) => c.name.toLowerCase() === custQuery.toLowerCase());
      if (exact.length === 1) pick = exact[0];
      else {
        const list = found.slice(0, 6).map((c) => `${c.name}${c.phone ? ` (${formatPhone(c.phone)})` : ""}`).join("; ");
        return fail(`"${custQuery}" matches ${found.length} saved customers: ${list}. Ask the person which one, then try again.`);
      }
    }
    if (pick) {
      customer = { id: pick.id, name: pick.name, phone: pick.phone ? formatPhone(pick.phone) : null, saved: true };
    } else {
      customer = { id: null, name: custQuery, phone: null, saved: false };
      warnings.push(`"${custQuery}" is not a saved customer, so this will be recorded as a walk-in bill.`);
    }
  } else {
    customer = { id: null, name: walkInName || "Walk-in customer", phone: null, saved: false };
  }

  /* ---- lines ---- */
  const seen = new Set<string>();
  const lines: BillProposal["lines"] = [];
  for (const raw of rawItems) {
    const q = text(raw.item);
    if (!q) return fail("One of the items had no name. Ask what is being sold.");
    const qty = parseQty(numText(raw.quantity));
    if (qty == null) return fail(`Give a whole-number quantity of 1 or more for "${q}". Ask the person how many.`);

    const res = resolveStock(stock, q);
    if ("error" in res) return fail(res.error);
    const item = res.item;

    if (seen.has(item.id)) return fail(`${stockName(item)} appears twice. Combine it into one line with the total quantity.`);
    seen.add(item.id);

    const rateGiven = numText(raw.rate);
    let rate = item.sale_price;
    if (rateGiven !== "") {
      const parsed = parseAmount(rateGiven);
      if (parsed == null) return fail(`"${rateGiven}" isn't a valid price for ${stockName(item)} (numbers only, up to 2 decimals).`);
      rate = parsed;
    }

    if (qty > item.quantity) {
      return fail(`Only ${item.quantity} of ${stockName(item)} in stock, but ${qty} were asked for. Tell the person and ask what to do.`);
    }

    const priceChanged = rate !== item.sale_price;
    if (priceChanged) warnings.push(`Price changed for ${stockName(item)}: ${formatRs(rate)} instead of the usual ${formatRs(item.sale_price)}.`);
    if (rate < item.cost_price) warnings.push(`${stockName(item)} is being sold below what it cost you.`);

    lines.push({
      itemId: item.id,
      name: stockName(item),
      specs: itemSpecs(item as InventoryItem),
      qty,
      rate,
      listPrice: item.sale_price,
      amount: lineAmount(qty, rate),
      priceChanged,
    });
  }

  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  if (total <= 0) return fail("The bill total is zero. Check the prices with the person.");

  /* ---- payment ---- */
  const payWord = text(args.payment).toLowerCase() || "paid";
  let mode: BillProposal["mode"];
  let paid: number;
  if (payWord === "paid" || payWord === "full") {
    mode = "full";
    paid = total;
  } else if (payWord === "udhaar" || payWord === "credit") {
    mode = "credit";
    paid = 0;
  } else if (payWord === "partial" || payWord === "part") {
    const amt = parseAmount(numText(args.amount_paid));
    if (amt == null || amt <= 0) return fail("For a part payment, ask how much the customer is paying now.");
    if (amt >= total) return fail(`${formatRs(amt)} is the full amount (bill total ${formatRs(total)}). Use payment "paid", or ask for a smaller amount.`);
    mode = "part";
    paid = amt;
  } else {
    return fail(`Payment must be "paid", "udhaar" or "partial", not "${payWord}".`);
  }
  const due = round2(total - paid);

  if (due > 0 && !customer.id) {
    return fail(
      custQuery
        ? `"${custQuery}" isn't a saved customer, and udhaar needs a saved customer. Offer to add them first (propose_customer), then make the bill.`
        : "Udhaar needs a saved customer. Ask who the customer is, or take the full payment."
    );
  }

  const methodWord = text(args.payment_method).toLowerCase() || "cash";
  if (!["cash", "bank", "other"].includes(methodWord)) return fail('Payment method must be "cash", "bank" or "other".');
  const method = methodWord as PaymentMethod;

  const note = text(args.note, 200) || null;

  const fingerprint = [
    customer.id ?? `walkin:${customer.name.toLowerCase()}`,
    lines.map((l) => `${l.itemId}x${l.qty}@${l.rate}`).sort().join(","),
    `${mode}:${paid}`,
    method,
  ].join("|");

  const proposal: BillProposal = { kind: "create_bill", fingerprint, customer, lines, total, mode, paid, due, method, note, warnings };

  return {
    ok: true,
    proposal,
    forModel: {
      customer: customer.name + (customer.saved ? "" : " (walk-in, not saved)"),
      items: lines.map((l) => ({ name: l.name, quantity: l.qty, rate: formatRs(l.rate), amount: formatRs(l.amount) })),
      total: formatRs(total),
      paying_now: formatRs(paid),
      udhaar_left: formatRs(due),
      payment_method: method,
      warnings,
    },
  };
}

/* ================================================================ add_item */

const CATEGORY_WORDS: Record<string, Category> = { battery: "battery", panel: "panel", accessory: "accessory" };

export async function buildItemProposal(ctx: ToolContext, args: Record<string, unknown>): Promise<Built> {
  const category = CATEGORY_WORDS[text(args.category).toLowerCase()];
  if (!category) return fail('Category must be "battery", "panel" or "accessory". Ask which one it is.');

  let type = text(args.type);
  if (type) type = normalizeType(type);
  if (category === "battery" && type && !BATTERY_TYPES.includes(type)) {
    return fail(`Battery type must be one of: ${BATTERY_TYPES.join(", ")}. Ask the person which one.`);
  }

  const form: ItemFormValues = {
    category,
    brand: text(args.brand),
    model: text(args.model),
    type,
    voltage: numText(args.voltage),
    plates: numText(args.plates),
    ah_rating: numText(args.ah_rating),
    wattage: numText(args.wattage),
    warranty_months: numText(args.warranty_months),
    cost_price: numText(args.cost_price),
    sale_price: numText(args.sale_price),
    // Same starting values as the Add item form when the person didn't say.
    quantity: numText(args.quantity) || "0",
    reorder_level: numText(args.reorder_level) || "2",
    hs_code: "",
    uom: DEFAULT_UOM,
  };

  const errors = validateItem(form);
  const problems = Object.values(errors);
  if (problems.length > 0) {
    return fail(`Can't add this item yet: ${problems.join(" ")} Ask the person for what's missing. Never guess prices or details.`);
  }

  const { data, error } = await ctx.supabase.from("inventory").select("brand,model,type,quantity").limit(2000);
  if (error) return fail("Couldn't read the inventory right now. Try again.");
  const dup = (data ?? []).find(
    (i) =>
      i.brand.trim().toLowerCase() === form.brand.toLowerCase() &&
      i.model.trim().toLowerCase() === form.model.toLowerCase() &&
      normalizeType(i.type) === normalizeType(form.type)
  );
  if (dup) {
    return fail(
      `${dup.brand} ${dup.model} is already in inventory (${dup.quantity} in stock). The assistant can't add stock to or change an existing item yet — tell the person to open Inventory and use Edit on that item.`
    );
  }

  const payload = itemPayload(form);
  const warnings: string[] = [];
  if (payload.sale_price < payload.cost_price) warnings.push("The sale price is lower than the cost price.");
  if (payload.quantity === 0) warnings.push("Starting stock is 0.");

  const specs = itemSpecs({ ...payload } as unknown as InventoryItem);
  const fingerprint = ["item", form.category, form.brand.toLowerCase(), form.model.toLowerCase(), form.type.toLowerCase(), form.ah_rating, form.wattage, form.sale_price, form.quantity].join("|");
  const proposal: ItemProposal = { kind: "add_item", fingerprint, form, specs, warnings };

  return {
    ok: true,
    proposal,
    forModel: {
      item: `${payload.brand} ${payload.model}`,
      category,
      specs,
      quantity: payload.quantity,
      sale_price: formatRs(payload.sale_price),
      warnings,
    },
  };
}

/* ============================================================ add_customer */

export async function buildCustomerProposal(ctx: ToolContext, args: Record<string, unknown>): Promise<Built> {
  const cnic = text(args.cnic_or_ntn, 30);
  const registered = args.registered === true;

  const form: CustomerFormValues = {
    name: text(args.name),
    phone: text(args.phone, 30),
    address: text(args.address, 200),
    registration_type: registered ? "Registered" : "Unregistered",
    cnic_or_ntn: cnic,
  };

  const errors = validateCustomer(form);
  const problems = Object.values(errors);
  if (problems.length > 0) return fail(`Can't add this customer yet: ${problems.join(" ")} Ask the person for what's missing.`);

  const { data, error } = await ctx.supabase.from("customers").select("name,phone").limit(2000);
  if (error) return fail("Couldn't read the customers right now. Try again.");

  const payload = customerPayload(form);
  const samePhone = payload.phone ? (data ?? []).find((c) => c.phone && normalizePhone(c.phone) === payload.phone) : undefined;
  if (samePhone) {
    return fail(`That phone number is already saved for ${samePhone.name}. Tell the person, and use that customer instead of adding a new one.`);
  }

  const warnings: string[] = [];
  const sameName = (data ?? []).find((c) => c.name.trim().toLowerCase() === payload.name.toLowerCase());
  if (sameName) {
    warnings.push(`A customer named ${sameName.name}${sameName.phone ? ` (${formatPhone(sameName.phone)})` : ""} is already saved. Confirm only if this is a different person.`);
  }

  const fingerprint = ["customer", payload.name.toLowerCase(), payload.phone ?? ""].join("|");
  const proposal: CustomerProposal = { kind: "add_customer", fingerprint, form, warnings };

  return {
    ok: true,
    proposal,
    forModel: {
      name: payload.name,
      phone: payload.phone ? formatPhone(payload.phone) : "none",
      customer_type: payload.registration_type,
      warnings,
    },
  };
}

/* ================================================================ shared bits */
/* Used by the scrap, charging-slip and battery-claim builders below. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A date the AI typed (YYYY-MM-DD), or today when none was given. Never in the future — same rule as the forms. */
function pickDate(v: unknown, label: string): { date: string } | { error: string } {
  const today = todayKarachi();
  const raw = text(v, 20);
  if (!raw) return { date: today };
  if (!YMD.test(raw) || addDays(raw, 0) !== raw) return { error: `${label} must be a real date written as YYYY-MM-DD. Ask the person for the date.` };
  if (raw > today) return { error: `${label} cannot be in the future (today is ${today}).` };
  return { date: raw };
}

/** Same idea as tableMissing(), but the message says which SQL file to run. */
function setupMessage(error: { code?: string; message?: string }, file: string, fallback: string): string {
  return tableMissing(error) ? `The setup for this is missing. Run ${file} in Supabase (SQL Editor), then try again.` : error.message || fallback;
}

async function slipNumber(supabase: Supa, table: "charging_jobs" | "battery_claims", id: string): Promise<string> {
  const column = table === "charging_jobs" ? "slip_number" : "claim_number";
  const { data } = await supabase.from(table).select(column).eq("id", id).maybeSingle();
  const value = data ? (data as unknown as Record<string, unknown>)[column] : null;
  return typeof value === "string" ? value : "";
}

/**
 * A saved customer (found by name/phone with the app's own search) or a walk-in.
 * Zero matches is NOT an error here: a slip can be made for a walk-in, and the card says so.
 * Several matches is an error — never guess which one.
 */
async function resolveSlipCustomer(
  supabase: Supa,
  args: Record<string, unknown>,
  warnings: string[]
): Promise<{ ok: true; customer: SlipCustomer } | { ok: false; error: string }> {
  const custQuery = text(args.customer);
  const walkInName = text(args.walk_in_name);
  let customer: SlipCustomer;

  if (custQuery) {
    const { data, error } = await supabase.from("customers").select("id,name,phone,address,cnic_or_ntn,registration_type").order("name").limit(2000);
    if (error) return { ok: false, error: "Couldn't read the customers right now. Try again." };
    const found = ((data ?? []) as CustomerRow[]).filter((c) => customerMatches(c, custQuery));
    let pick: CustomerRow | null = null;
    if (found.length === 1) pick = found[0];
    else if (found.length > 1) {
      const exact = found.filter((c) => c.name.toLowerCase() === custQuery.toLowerCase());
      if (exact.length === 1) pick = exact[0];
      else {
        const list = found.slice(0, 6).map((c) => `${c.name}${c.phone ? ` (${formatPhone(c.phone)})` : ""}`).join("; ");
        return { ok: false, error: `"${custQuery}" matches ${found.length} saved customers: ${list}. Ask the person which one, then try again.` };
      }
    }
    if (pick) customer = { id: pick.id, name: pick.name, phone: pick.phone ? formatPhone(pick.phone) : null, saved: true };
    else {
      customer = { id: null, name: custQuery, phone: null, saved: false };
      warnings.push(`"${custQuery}" is not a saved customer, so this will be recorded under that name as a walk-in.`);
    }
  } else {
    customer = { id: null, name: walkInName || "Walk-in customer", phone: null, saved: false };
  }

  if (!customer.id) {
    const phone = normalizePhone(text(args.walk_in_phone, 30));
    if (phone && !isValidPhone(phone)) return { ok: false, error: "That phone number isn't valid (10 to 15 digits, e.g. 0300 1234567). Ask the person to check it, or leave it out." };
    if (phone) customer.phone = formatPhone(phone);
  }
  return { ok: true, customer };
}

/** What the RPCs get for the customer part of a slip. Same values the manual forms send. */
function slipCustomerParams(c: SlipCustomer) {
  return {
    p_customer_id: c.id,
    p_walkin_name: c.id ? null : c.name === "Walk-in customer" ? null : c.name,
    p_walkin_phone: c.id ? null : c.phone ? normalizePhone(c.phone) || null : null,
  };
}

/* ================================================================= add_scrap */

export async function buildScrapAddProposal(_ctx: ToolContext, args: Record<string, unknown>): Promise<Built> {
  const brand = text(args.brand);
  const model = text(args.model);
  if (!brand || !model) return fail("Enter the brand and model of the old battery. Ask the person for what's missing.");

  const quantity = parseQty(numText(args.quantity));
  if (quantity == null) return fail("Give a whole-number quantity of 1 or more. Ask the person how many old batteries.");

  const weightGiven = numText(args.weight_kg);
  let weightKg: number | null = null;
  if (weightGiven !== "") {
    weightKg = parseAmount(weightGiven);
    if (weightKg == null || weightKg <= 0) return fail(`"${weightGiven}" isn't a valid weight in kg. Ask the person, or leave the weight out (batteries are usually weighed at sale time).`);
  }

  const date = pickDate(args.received_date, "The received date");
  if ("error" in date) return fail(date.error);

  const typeRaw = text(args.battery_type);
  const typeNorm = typeRaw ? normalizeType(typeRaw) : "";
  const batteryType = typeRaw ? (BATTERY_TYPES.includes(typeNorm) ? typeNorm : typeRaw) : null;

  const batteryNumber = text(args.battery_number, 60) || null;
  const customerName = text(args.customer_name) || null;
  const note = text(args.note, 200) || null;

  const warnings: string[] = [];
  const fingerprint = ["scrap-add", brand.toLowerCase(), model.toLowerCase(), (batteryType ?? "").toLowerCase(), batteryNumber ?? "", quantity, date.date, (customerName ?? "").toLowerCase()].join("|");
  const proposal: ScrapAddProposal = {
    kind: "add_scrap",
    fingerprint,
    brand,
    model,
    batteryType,
    batteryNumber,
    quantity,
    weightKg,
    customerName,
    receivedDate: date.date,
    note,
    warnings,
  };

  return {
    ok: true,
    proposal,
    forModel: { battery: `${brand} ${model}`, type: batteryType ?? "not given", quantity, weight_kg: weightKg ?? "not weighed yet", from: customerName ?? "not given", received: date.date, warnings },
  };
}

/* ================================================================ sell_scrap */

type ScrapRow = Pick<ScrapBatteryInventory, "id" | "intake_number" | "brand" | "model" | "quantity">;

export async function buildScrapSaleProposal(ctx: ToolContext, args: Record<string, unknown>): Promise<Built> {
  const { data, error } = await ctx.supabase
    .from("scrap_battery_inventory")
    .select("id,intake_number,brand,model,quantity")
    .eq("status", "in_stock")
    .order("intake_number")
    .limit(2000);
  if (error) return fail(setupMessage(error, "07_scrap_battery.sql", "Couldn't read the scrap pile right now. Try again."));
  const pile = (data ?? []) as ScrapRow[];
  if (pile.length === 0) return fail("There is no scrap in stock to sell.");

  /* ---- which batches ---- */
  const sellAll = args.sell_all === true;
  const wanted = Array.isArray(args.intake_numbers) ? (args.intake_numbers as unknown[]).map((v) => text(v, 40)).filter(Boolean) : [];
  if (sellAll && wanted.length > 0) return fail('Pass either sell_all or intake_numbers, not both. Ask the person whether it is the whole pile or specific batches.');
  if (!sellAll && wanted.length === 0) {
    return fail("Which scrap should be sold? Use lookup_scrap to show what is in stock, then ask the person for the batch numbers, or whether the whole pile is going.");
  }

  let chosen: ScrapRow[];
  if (sellAll) chosen = pile;
  else {
    chosen = [];
    for (const number of wanted) {
      const hit = pile.find((r) => r.intake_number.toLowerCase() === number.toLowerCase());
      if (!hit) {
        const some = pile.slice(0, 8).map((r) => r.intake_number).join(", ");
        return fail(`No scrap batch numbered "${number}" is in stock. In stock: ${some}${pile.length > 8 ? ", …" : ""}. Ask the person which they mean.`);
      }
      if (!chosen.some((r) => r.id === hit.id)) chosen.push(hit);
    }
  }
  if (chosen.length > 200) return fail("That is too many batches for one sale here. Sell them from the Scrap screen.");

  /* ---- buyer + numbers ---- */
  const buyerName = text(args.buyer_name);
  if (!buyerName) return fail("Enter the buyer's name. Ask the person who is buying the scrap.");
  const phoneRaw = normalizePhone(text(args.buyer_phone, 30));
  if (phoneRaw && !isValidPhone(phoneRaw)) return fail("That buyer phone number isn't valid (10 to 15 digits). Ask the person to check it, or leave it out.");

  const weightText = numText(args.total_weight_kg);
  const weightKg = weightText === "" ? null : parseAmount(weightText);
  if (weightKg == null || weightKg <= 0) return fail("Enter the total weight in kg (from the kabari's scale). Ask the person; never guess a weight.");

  const rateText = numText(args.rate_per_kg);
  const ratePerKg = rateText === "" ? null : parseAmount(rateText);
  if (ratePerKg == null) return fail("Enter the rate per kg. Ask the person; never guess a rate.");

  const date = pickDate(args.sale_date, "The sale date");
  if ("error" in date) return fail(date.error);

  const total = round2(weightKg * ratePerKg);
  const warnings: string[] = [];
  if (ratePerKg === 0) warnings.push("The rate is Rs 0 per kg, so this sale brings in no money.");

  const rows = chosen.map((r) => ({ id: r.id, intakeNumber: r.intake_number, name: `${r.brand} ${r.model}`, qty: r.quantity }));
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const note = text(args.note, 200) || null;

  const fingerprint = ["scrap-sale", rows.map((r) => r.id).sort().join(","), weightKg, ratePerKg, buyerName.toLowerCase()].join("|");
  const proposal: ScrapSaleProposal = {
    kind: "sell_scrap",
    fingerprint,
    rows,
    totalQty,
    buyerName,
    buyerPhone: phoneRaw || null,
    weightKg,
    ratePerKg,
    total,
    saleDate: date.date,
    note,
    warnings,
  };

  return {
    ok: true,
    proposal,
    forModel: {
      buyer: buyerName,
      batches: rows.length,
      batteries: totalQty,
      total_weight_kg: weightKg,
      rate_per_kg: formatRs(ratePerKg),
      total_amount: formatRs(total),
      sale_date: date.date,
      warnings,
    },
  };
}

/* ========================================================== create_charging */

export async function buildChargingProposal(ctx: ToolContext, args: Record<string, unknown>): Promise<Built> {
  const brand = text(args.battery_brand);
  const model = text(args.battery_model);
  if (!brand || !model) return fail("Enter the battery's brand and model. Ask the person for what's missing.");

  const priceText = numText(args.price);
  const price = priceText === "" ? null : parseAmount(priceText);
  if (price == null) {
    // Offer the shop's own suggested prices so the person can pick one — never choose one for them.
    const { data: list } = await ctx.supabase.from("charging_price_list").select("label,price").order("price").limit(12);
    const hint = (list ?? []).length
      ? ` The shop's usual prices: ${(list ?? []).map((r) => `${r.label} ${formatRs(r.price as number)}`).join("; ")}. You may read these out as suggestions, but the person must say the price.`
      : "";
    return fail(`The charging price is missing or not a valid amount. Ask the person what to charge (Rs 0 is allowed).${hint}`);
  }

  const date = pickDate(args.received_date, "The received date");
  if ("error" in date) return fail(date.error);

  const warnings: string[] = [];
  const who = await resolveSlipCustomer(ctx.supabase, args, warnings);
  if (!who.ok) return fail(who.error);
  const customer = who.customer;
  if (!customer.id && !customer.phone) warnings.push("No phone number for this walk-in, so the shop can't call them when the battery is ready.");
  if (price === 0) warnings.push("The charging price is Rs 0.");

  const batteryNumber = text(args.battery_number, 60) || null;
  const note = text(args.note, 200) || null;
  const dueDate = addDays(date.date, CHARGING_HOLD_DAYS);

  const fingerprint = ["charging", customer.id ?? `walkin:${customer.name.toLowerCase()}`, brand.toLowerCase(), model.toLowerCase(), batteryNumber ?? "", price, date.date].join("|");
  const proposal: ChargingProposal = { kind: "create_charging", fingerprint, customer, brand, model, batteryNumber, price, receivedDate: date.date, dueDate, note, warnings };

  return {
    ok: true,
    proposal,
    forModel: {
      customer: customer.name + (customer.saved ? "" : " (walk-in, not saved)"),
      battery: `${brand} ${model}`,
      battery_number: batteryNumber ?? "none",
      charging_price: formatRs(price),
      received: date.date,
      collect_by: dueDate,
      warnings,
    },
  };
}

/* ============================================================= create_claim */

export async function buildClaimProposal(ctx: ToolContext, args: Record<string, unknown>): Promise<Built> {
  const { supabase } = ctx;
  const brand = text(args.battery_brand);
  const model = text(args.battery_model);
  if (!brand || !model) return fail("Enter the battery's brand and model. Ask the person for what's missing.");

  const date = pickDate(args.received_date, "The received date");
  if ("error" in date) return fail(date.error);

  const money = (v: unknown, label: string): { value: number | null } | { error: string } => {
    const t = numText(v);
    if (t === "") return { value: null };
    const n = parseAmount(t);
    return n == null ? { error: `"${t}" isn't a valid ${label} (numbers only, up to 2 decimals). Ask the person, or leave it out.` } : { value: n };
  };
  const claimAmount = money(args.claim_amount, "claim amount");
  if ("error" in claimAmount) return fail(claimAmount.error);
  const extraCharges = money(args.extra_charges, "amount for extra charges");
  if ("error" in extraCharges) return fail(extraCharges.error);

  const warnings: string[] = [];
  const who = await resolveSlipCustomer(supabase, args, warnings);
  if (!who.ok) return fail(who.error);
  const customer = who.customer;
  if (!customer.id && !customer.phone) warnings.push("No phone number for this walk-in customer.");

  /* ---- original bill (optional): found by bill number only ---- */
  let originalInvoice: ClaimProposal["originalInvoice"] = null;
  const billQuery = text(args.original_bill, 40).replace(/[%_,()]/g, "");
  if (billQuery) {
    const { data, error } = await supabase
      .from("invoice_balances")
      .select("id,invoice_number,invoice_date")
      .ilike("invoice_number", `%${billQuery}%`)
      .neq("status", "Cancelled")
      .order("created_at", { ascending: false })
      .limit(6);
    if (error) return fail("Couldn't search the bills right now. Try again.");
    const bills = (data ?? []) as { id: string; invoice_number: string; invoice_date: string }[];
    const pick = bills.length === 1 ? bills[0] : bills.find((b) => b.invoice_number.toLowerCase() === billQuery.toLowerCase());
    if (!pick && bills.length > 1) {
      return fail(`"${billQuery}" matches ${bills.length} bills: ${bills.map((b) => b.invoice_number).join(", ")}. Ask the person which bill number, then try again.`);
    }
    if (!pick) return fail(`No bill matches the number "${billQuery}". Ask the person to check the bill number, or leave the original bill out.`);
    originalInvoice = { id: pick.id, number: pick.invoice_number, date: pick.invoice_date };
  }

  /* ---- distributor (optional): an existing one, or a new name the person gave ---- */
  let distributor: ClaimProposal["distributor"] = null;
  const distQuery = text(args.distributor);
  if (distQuery) {
    const { data, error } = await supabase.from("distributors").select("id,name").order("name").limit(500);
    if (error) return fail(setupMessage(error, "06_battery_services.sql", "Couldn't read the distributors right now. Try again."));
    const q = distQuery.toLowerCase();
    const all = (data ?? []) as { id: string; name: string }[];
    const exact = all.filter((d) => d.name.trim().toLowerCase() === q);
    const partial = all.filter((d) => d.name.toLowerCase().includes(q) || q.includes(d.name.trim().toLowerCase()));
    const found = exact.length === 1 ? exact : partial;
    if (found.length === 1) distributor = { id: found[0].id, name: found[0].name, isNew: false };
    else if (found.length > 1) {
      return fail(`"${distQuery}" matches ${found.length} distributors: ${found.slice(0, 6).map((d) => d.name).join("; ")}. Ask the person which one, then try again.`);
    } else {
      distributor = { id: null, name: distQuery, isNew: true };
      warnings.push(`"${distQuery}" is not in your distributor list, so it will be added as a new distributor.`);
    }
  }

  const batteryNumber = text(args.battery_number, 60) || null;
  const note = text(args.note, 200) || null;
  const fingerprint = ["claim", customer.id ?? `walkin:${customer.name.toLowerCase()}`, brand.toLowerCase(), model.toLowerCase(), batteryNumber ?? "", date.date].join("|");
  const proposal: ClaimProposal = {
    kind: "create_claim",
    fingerprint,
    customer,
    brand,
    model,
    batteryNumber,
    originalInvoice,
    distributor,
    claimAmount: claimAmount.value,
    extraCharges: extraCharges.value,
    receivedDate: date.date,
    note,
    warnings,
  };

  return {
    ok: true,
    proposal,
    forModel: {
      customer: customer.name + (customer.saved ? "" : " (walk-in, not saved)"),
      battery: `${brand} ${model}`,
      battery_number: batteryNumber ?? "none",
      original_bill: originalInvoice?.number ?? "none",
      distributor: distributor ? distributor.name + (distributor.isNew ? " (new)" : "") : "not chosen yet",
      claim_amount: claimAmount.value != null ? formatRs(claimAmount.value) : "not set",
      extra_charges: extraCharges.value != null ? formatRs(extraCharges.value) : "none",
      received: date.date,
      warnings,
    },
  };
}

/* ======================================================== save + show a card */

type Builder = (ctx: ToolContext, args: Record<string, unknown>) => Promise<Built>;

const MODEL_INSTRUCTION =
  "NOTHING HAS BEEN SAVED. A confirmation card is now on the person's screen. In one or two short sentences say what you prepared and ask them to check the card and tap Confirm (or Edit / Cancel). Never say it is saved, done or created. If they reply 'yes' or 'confirm' in chat, tell them to tap Confirm on the card. Do not prepare it again.";

/** Kinds that could be saved twice by accident get a warning if an identical one was confirmed in the last 30 minutes. */
const REPEAT_WARNING: Partial<Record<Proposal["kind"], string>> = {
  create_bill: "An identical bill was saved in the last 30 minutes. Confirm only if this is a second, separate sale.",
  add_scrap: "An identical scrap battery was added in the last 30 minutes. Confirm only if this is a second, separate battery.",
  create_charging: "An identical charging slip was saved in the last 30 minutes. Confirm only if this is a second, separate battery.",
  create_claim: "An identical battery claim was saved in the last 30 minutes. Confirm only if this is a second, separate claim.",
};

/** Builds, de-duplicates, logs and queues one proposal card. Returns the JSON string the AI sees. */
export async function proposeAction(ctx: ToolContext, build: Builder, args: Record<string, unknown>): Promise<string> {
  // One card per message. A model that calls twice must not create two confirmable bills.
  if (ctx.proposals.length > 0) {
    return JSON.stringify({ error: "One proposal is already waiting for the person to confirm. Do not prepare another in the same reply." });
  }

  const built = await build(ctx, args);
  if (!built.ok) return JSON.stringify({ error: built.error });
  const { proposal } = built;

  // Same thing already waiting? Show that card again instead of making a second one.
  const cutoff = new Date(Date.now() - PROPOSAL_MINUTES * 60_000).toISOString();
  const { data: existing, error: existingError } = await ctx.supabase
    .from("ai_actions")
    .select("id,status,proposal,created_at")
    .eq("kind", proposal.kind)
    .eq("proposal->>fingerprint", proposal.fingerprint)
    .in("status", ["proposed", "executing", "confirmed"])
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(5);
  if (existingError) {
    return JSON.stringify({ error: tableMissing(existingError) ? NOT_SET_UP : "Couldn't save the proposal right now. Try again." });
  }

  const rows = existing ?? [];
  const pending = rows.find((r) => r.status === "proposed");
  if (pending) {
    ctx.proposals.push({ id: pending.id as string, proposal: pending.proposal as Proposal });
    return JSON.stringify({ status: "waiting_for_person_to_confirm", saved: false, note: "This exact proposal was already waiting; its card is shown again.", summary: built.forModel, instruction: MODEL_INSTRUCTION });
  }
  if (rows.some((r) => r.status === "executing")) {
    return JSON.stringify({ error: "That exact action is being saved right now. Tell the person to wait a moment and check the result." });
  }
  if (rows.some((r) => r.status === "confirmed") && REPEAT_WARNING[proposal.kind]) {
    proposal.warnings.push(REPEAT_WARNING[proposal.kind] as string);
  }

  const { data: id, error } = await ctx.supabase.rpc("ai_log_proposal", {
    p_kind: proposal.kind,
    p_message: ctx.userMessage.slice(0, 500),
    p_proposal: proposal,
  });
  if (error || !id) {
    return JSON.stringify({ error: error && tableMissing(error) ? NOT_SET_UP : "Couldn't save the proposal right now. Try again." });
  }

  ctx.proposals.push({ id: id as string, proposal });
  return JSON.stringify({ status: "waiting_for_person_to_confirm", saved: false, summary: built.forModel, instruction: MODEL_INSTRUCTION });
}

/* ==================================================== confirm / cancel / edit */

function decisionError(error: { message: string }): ActionResponse {
  return { ok: false, message: error.message };
}

/**
 * Called when a person taps a button on a proposal card. Everything is re-read from the
 * saved proposal (never from the browser), so a tampered request can only do what the
 * person was actually shown.
 */
export async function decideAction(supabase: Supa, id: string, decision: ActionDecision): Promise<ActionResponse> {
  if (decision === "cancel" || decision === "edit") {
    const { error } = await supabase.rpc("ai_resolve_action", { p_id: id, p_status: decision === "cancel" ? "cancelled" : "edited" });
    if (error) return decisionError(error);
    return { ok: true, message: decision === "cancel" ? "Cancelled. Nothing was saved." : "Opening the form." };
  }

  // Atomic: only one Confirm can ever get past this line for a given proposal.
  const { data: row, error: claimError } = await supabase.rpc("ai_claim_action", { p_id: id });
  if (claimError || !row) return decisionError(claimError ?? { message: "This proposal is no longer available." });

  const proposal = row.proposal as Proposal;
  let sent: Record<string, unknown> = {};

  const finish = async (status: "confirmed" | "failed", result: Record<string, unknown> | null, error: string | null) => {
    const { error: finishError } = await supabase.rpc("ai_finish_action", {
      p_id: id,
      p_status: status,
      p_sent: sent,
      p_result: result,
      p_error: error,
    });
    if (finishError) console.error("ai_finish_action failed", finishError.message);
  };

  try {
    if (proposal.kind === "create_bill") {
      const p = proposal;
      sent = {
        p_customer_id: p.customer.id,
        p_walkin_name: p.customer.id ? null : p.customer.name === "Walk-in customer" ? null : p.customer.name,
        p_note: p.note,
        p_invoice_date: todayKarachi(),
        p_items: p.lines.map((l) => ({ inventory_id: l.itemId, quantity: l.qty, rate: l.rate })),
        p_paid: p.paid,
        p_method: p.method,
        p_walkin_phone: null,
        p_walkin_address: null,
        p_walkin_registration_type: p.customer.id ? null : "Unregistered",
        p_walkin_cnic_or_ntn: null,
      };
      // While FBR is switched on, a bill with taxable items must be an FBR bill. That choice (and the buyer's
      // province) lives on the New bill screen, so the assistant hands the bill over instead of saving it.
      const { data: fbrProfile } = await supabase.from("business_profile").select("fbr_enabled").maybeSingle();
      if (fbrProfile?.fbr_enabled) {
        const message = "FBR bills are on, so this bill must be saved on the New bill screen. Tap Edit, then check the FBR bill box.";
        await finish("failed", null, message);
        return { ok: false, message: `The bill was not saved. ${message}` };
      }
      const { data: invoiceId, error } = await supabase.rpc("create_invoice", sent);
      if (error || !invoiceId) {
        const message = error ? friendlyInvoiceError(error) : "The bill was not saved.";
        await finish("failed", null, message);
        return { ok: false, message: `The bill was not saved. ${message}` };
      }
      const { data: inv } = await supabase.from("invoices").select("invoice_number").eq("id", invoiceId).maybeSingle();
      const number = (inv?.invoice_number as string | undefined) ?? "";
      await finish("confirmed", { invoice_id: invoiceId, invoice_number: number }, null);
      return {
        ok: true,
        message: `Bill ${number} saved — ${formatRs(p.total)}${p.due > 0 ? `, ${formatRs(p.due)} udhaar for ${p.customer.name}` : ""}.`,
        link: `/sales/${invoiceId}`,
        linkLabel: "Open bill",
      };
    }

    if (proposal.kind === "add_item") {
      // Same rules as the Add item form, checked again now in case anything changed.
      const errors = validateItem(proposal.form);
      if (Object.keys(errors).length > 0) {
        const message = Object.values(errors).join(" ");
        await finish("failed", null, message);
        return { ok: false, message: `The item was not added. ${message}` };
      }
      const payload = itemPayload(proposal.form);
      sent = payload;
      const { data: dupes } = await supabase.from("inventory").select("brand,model,type").limit(2000);
      const dup = (dupes ?? []).find(
        (i) =>
          i.brand.trim().toLowerCase() === payload.brand.toLowerCase() &&
          i.model.trim().toLowerCase() === payload.model.toLowerCase() &&
          normalizeType(i.type) === normalizeType(payload.type)
      );
      if (dup) {
        const message = `${dup.brand} ${dup.model} was already added.`;
        await finish("failed", null, message);
        return { ok: false, message: `The item was not added. ${message}` };
      }
      const { data: created, error } = await supabase.from("inventory").insert(payload).select("id").single();
      if (error || !created) {
        const message = error?.message ?? "Unknown error.";
        await finish("failed", null, message);
        return { ok: false, message: `The item was not added. ${message}` };
      }
      await finish("confirmed", { inventory_id: created.id }, null);
      return {
        ok: true,
        message: `${payload.brand} ${payload.model} added to stock — ${payload.quantity} in stock at ${formatRs(payload.sale_price)}.`,
        link: `/inventory?q=${encodeURIComponent(`${payload.brand} ${payload.model}`)}`,
        linkLabel: "Open inventory",
      };
    }

    if (proposal.kind === "add_scrap") {
      const p = proposal;
      if (p.receivedDate > todayKarachi()) {
        const message = "The received date cannot be in the future.";
        await finish("failed", null, message);
        return { ok: false, message: `The scrap battery was not added. ${message}` };
      }
      sent = {
        p_invoice_id: null,
        p_customer_id: null,
        p_customer_name: p.customerName,
        p_brand: p.brand,
        p_model: p.model,
        p_battery_type: p.batteryType,
        p_battery_number: p.batteryNumber,
        p_quantity: p.quantity,
        p_estimated_weight_kg: p.weightKg,
        p_note: p.note,
        p_received_date: p.receivedDate,
      };
      const { data, error } = await supabase.rpc("record_scrap_intake", sent);
      if (error || !data) {
        const message = error ? setupMessage(error, "07_scrap_battery.sql", "Unknown error.") : "The scrap battery was not saved.";
        await finish("failed", null, message);
        return { ok: false, message: `The scrap battery was not added. ${message}` };
      }
      await finish("confirmed", { intake: data as unknown as string }, null);
      return {
        ok: true,
        message: `${p.quantity} × ${p.brand} ${p.model} added to the scrap pile.`,
        link: "/scrap",
        linkLabel: "Open scrap",
      };
    }

    if (proposal.kind === "sell_scrap") {
      const p = proposal;
      const ids = p.rows.map((r) => r.id);
      // The pile may have changed since the card was made: every batch must still be in stock.
      const { data: still, error: stillError } = await supabase.from("scrap_battery_inventory").select("id").in("id", ids).eq("status", "in_stock");
      if (stillError) {
        const message = "Couldn't check the scrap pile.";
        await finish("failed", null, message);
        return { ok: false, message: `The scrap was not sold. ${message}` };
      }
      if ((still ?? []).length !== ids.length) {
        const message = "Some of these batches were already sold or removed since the card was made. Ask me to prepare it again.";
        await finish("failed", null, message);
        return { ok: false, message: `The scrap was not sold. ${message}` };
      }
      sent = {
        p_intake_ids: ids,
        p_buyer_name: p.buyerName,
        p_buyer_phone: p.buyerPhone,
        p_total_weight_kg: p.weightKg,
        p_rate_per_kg: p.ratePerKg,
        p_sale_date: p.saleDate,
        p_note: p.note,
      };
      const { data, error } = await supabase.rpc("sell_scrap", sent);
      if (error || !data) {
        const message = error ? setupMessage(error, "07_scrap_battery.sql", "Unknown error.") : "The sale was not saved.";
        await finish("failed", null, message);
        return { ok: false, message: `The scrap was not sold. ${message}` };
      }
      const saleId = typeof data === "string" && UUID.test(data) ? data : null;
      await finish("confirmed", { sale: data as unknown as string }, null);
      return {
        ok: true,
        message: `Scrap sold to ${p.buyerName} — ${p.totalQty} ${p.totalQty === 1 ? "battery" : "batteries"}, ${p.weightKg} kg at ${formatRs(p.ratePerKg)}/kg = ${formatRs(p.total)}.`,
        link: saleId ? `/print/scrap/${saleId}` : "/scrap",
        linkLabel: saleId ? "Open sale slip" : "Open scrap",
      };
    }

    if (proposal.kind === "create_charging") {
      const p = proposal;
      if (p.receivedDate > todayKarachi()) {
        const message = "The received date cannot be in the future.";
        await finish("failed", null, message);
        return { ok: false, message: `The charging slip was not saved. ${message}` };
      }
      sent = {
        ...slipCustomerParams(p.customer),
        p_battery_brand: p.brand,
        p_battery_model: p.model,
        p_battery_number: p.batteryNumber,
        p_price: p.price,
        p_note: p.note,
        p_received_date: p.receivedDate,
      };
      const { data, error } = await supabase.rpc("create_charging_job", sent);
      if (error || !data) {
        const message = error ? setupMessage(error, "06_battery_services.sql", "Unknown error.") : "The slip was not saved.";
        await finish("failed", null, message);
        return { ok: false, message: `The charging slip was not saved. ${message}` };
      }
      const id = data as unknown as string;
      const number = await slipNumber(supabase, "charging_jobs", id);
      await finish("confirmed", { charging_job_id: id, slip_number: number }, null);
      return {
        ok: true,
        message: `Charging slip ${number} saved for ${p.customer.name} — ${p.brand} ${p.model}, ${formatRs(p.price)}.`,
        link: `/print/charging/${id}`,
        linkLabel: "Open slip",
      };
    }

    if (proposal.kind === "create_claim") {
      const p = proposal;
      if (p.receivedDate > todayKarachi()) {
        const message = "The received date cannot be in the future.";
        await finish("failed", null, message);
        return { ok: false, message: `The battery claim was not saved. ${message}` };
      }
      sent = {
        ...slipCustomerParams(p.customer),
        p_battery_brand: p.brand,
        p_battery_model: p.model,
        p_battery_number: p.batteryNumber,
        p_original_invoice_id: p.originalInvoice?.id ?? null,
        p_claim_amount: p.claimAmount,
        p_extra_charges: p.extraCharges,
        p_note: p.note,
        p_received_date: p.receivedDate,
        p_distributor_id: p.distributor && !p.distributor.isNew ? p.distributor.id : null,
        p_new_distributor_name: p.distributor?.isNew ? p.distributor.name : null,
      };
      const { data, error } = await supabase.rpc("create_battery_claim", sent);
      if (error || !data) {
        const message = error ? setupMessage(error, "06_battery_services.sql", "Unknown error.") : "The claim was not saved.";
        await finish("failed", null, message);
        return { ok: false, message: `The battery claim was not saved. ${message}` };
      }
      const id = data as unknown as string;
      const number = await slipNumber(supabase, "battery_claims", id);
      await finish("confirmed", { claim_id: id, claim_number: number }, null);
      return {
        ok: true,
        message: `Battery claim ${number} saved for ${p.customer.name} — ${p.brand} ${p.model}.`,
        link: `/print/claim/${id}`,
        linkLabel: "Open claim slip",
      };
    }

    // add_customer
    const errors = validateCustomer(proposal.form);
    if (Object.keys(errors).length > 0) {
      const message = Object.values(errors).join(" ");
      await finish("failed", null, message);
      return { ok: false, message: `The customer was not added. ${message}` };
    }
    const payload = customerPayload(proposal.form);
    sent = payload;
    if (payload.phone) {
      const { data: people } = await supabase.from("customers").select("name,phone").limit(2000);
      const same = (people ?? []).find((c) => c.phone && normalizePhone(c.phone) === payload.phone);
      if (same) {
        const message = `That phone number is already saved for ${same.name}.`;
        await finish("failed", null, message);
        return { ok: false, message: `The customer was not added. ${message}` };
      }
    }
    const { data: created, error } = await supabase.from("customers").insert(payload).select("id").single();
    if (error || !created) {
      const message = error?.message ?? "Unknown error.";
      await finish("failed", null, message);
      return { ok: false, message: `The customer was not added. ${message}` };
    }
    await finish("confirmed", { customer_id: created.id }, null);
    return { ok: true, message: `${payload.name} added to customers.`, link: `/customers/${created.id}`, linkLabel: "Open customer" };
  } catch {
    await finish("failed", null, "Unexpected error.");
    return { ok: false, message: "Something went wrong and nothing was confirmed. Check Sales / Inventory / Customers before trying again." };
  }
}
