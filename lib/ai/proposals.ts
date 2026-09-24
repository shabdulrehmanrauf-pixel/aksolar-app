/**
 * Phase 10, Part 3 — Propose -> Confirm -> Execute.
 *
 * The AI can only PREPARE things here. `buildBill/Item/CustomerProposal` check the
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
import { friendlyInvoiceError, lineAmount, parseAmount, parseQty, round2, todayKarachi } from "@/lib/invoices";
import { formatRs } from "@/lib/format";
import type { Category, Customer, InventoryItem, PaymentMethod } from "@/lib/types";
import {
  PROPOSAL_MINUTES,
  type ActionDecision,
  type ActionResponse,
  type BillProposal,
  type CustomerProposal,
  type ItemProposal,
  type Proposal,
  type ProposalCard,
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

/* ======================================================== save + show a card */

type Builder = (ctx: ToolContext, args: Record<string, unknown>) => Promise<Built>;

const MODEL_INSTRUCTION =
  "NOTHING HAS BEEN SAVED. A confirmation card is now on the person's screen. In one or two short sentences say what you prepared and ask them to check the card and tap Confirm (or Edit / Cancel). Never say it is saved, done or created. If they reply 'yes' or 'confirm' in chat, tell them to tap Confirm on the card. Do not prepare it again.";

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
  if (rows.some((r) => r.status === "confirmed") && proposal.kind === "create_bill") {
    proposal.warnings.push("An identical bill was saved in the last 30 minutes. Confirm only if this is a second, separate sale.");
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
