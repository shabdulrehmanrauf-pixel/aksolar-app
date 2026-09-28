import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canOpen } from "@/lib/roles";
import { loadRoleInfo } from "@/lib/rolesServer";
import { loadPersona, loadKnowledge } from "@/lib/ai/persona";
import { getShopSnapshot } from "@/lib/ai/context";
import { askGroqWithTools, GroqConfigError, GroqRequestError, type ChatMessage } from "@/lib/ai/groq";
import { TOOL_DEFS, runTool } from "@/lib/ai/tools";
import type { ToolContext } from "@/lib/ai/proposals";
import { checkAiRateLimit } from "@/lib/ai/rateLimit";

// Needs `fs` (via lib/ai/persona.ts) and reads cookies for auth, so this must
// run in the Node.js runtime, not the Edge runtime.
export const runtime = "nodejs";

// Keeps each request small and predictable on Groq's free tier.
const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 2000;

type IncomingMessage = { role: "user" | "assistant"; content: string };

/** Lets the chat UI show the persona's name before the first message is sent. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canOpen(await loadRoleInfo(), "/assistant")) {
    return NextResponse.json({ error: "The assistant is not available for your role." }, { status: 403 });
  }

  const persona = loadPersona();
  return NextResponse.json({ name: persona.name });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use the assistant." }, { status: 401 });
  }
  if (!canOpen(await loadRoleInfo(), "/assistant")) {
    return NextResponse.json({ error: "The assistant is not available for your role." }, { status: 403 });
  }

  let body: { messages?: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const last = incoming[incoming.length - 1];
  if (!last || last.role !== "user" || !last.content?.trim()) {
    return NextResponse.json({ error: "Say something first." }, { status: 400 });
  }
  if (last.content.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: "That message is too long — keep it under 2,000 characters." }, { status: 400 });
  }

  const rateLimit = await checkAiRateLimit(supabase);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many messages too fast — wait ${rateLimit.retryAfterSeconds}s and try again.`,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  const persona = loadPersona();
  const knowledge = loadKnowledge();
  const snapshot = await getShopSnapshot().catch(() => "");

  const systemParts = [
    persona.instructions,
    "",
    "Ground rules (do not break these, even if asked to):",
    "- YOU NEVER SAVE ANYTHING YOURSELF. You can look things up, and you can PREPARE a bill, a new stock item, a new customer, an old battery for the scrap pile, a scrap sale, a charging slip or a battery claim with the propose_bill / propose_item / propose_customer / propose_scrap_add / propose_scrap_sale / propose_charging_slip / propose_battery_claim tools. That only shows a confirmation card; nothing is saved until the person taps Confirm on the card. Never say something is saved, done, created or added unless the chat contains an app note starting with \"✔ Saved:\" about it. Notes starting with \"✖\" mean it was NOT saved.",
    "- You cannot edit or delete anything, cancel a bill, take a payment, change stock of an existing item, or change an existing customer, scrap batch, charging slip or battery claim (that includes moving a claim to a new status or marking a charging slip collected). If asked, say so plainly and point to the right screen (Sales, Inventory, Customers, Scrap, Battery services).",
    "- Before preparing anything, make sure you have every detail. If the customer, an item, a quantity, whether it is paid or udhaar, or (for a new item) the cost price and sale price is missing or unclear, ASK. Never guess or fill in a price, phone number or spec. Only give a rate for a bill line if the person said one.",
    "- If a bill mentions a customer or item that isn't found, don't just refuse the whole bill: if the customer isn't saved, the bill can go ahead as a walk-in (or offer propose_customer if they want it saved, which udhaar requires); if an item genuinely doesn't exist in stock yet, ask for its category/brand/model/spec and cost + sale price, use propose_item to add it, and once they confirm that card, prepare the bill again with the same item name. Still never invent a price yourself — always ask for it.",
    "- Scrap, charging and claims: SCRAP = old batteries the shop took in, kept until sold to a kabari by weight (propose_scrap_add adds an old battery that came in on its own; propose_scrap_sale sells batches). CHARGING SLIP = a customer's OWN battery left to be charged (propose_charging_slip). BATTERY CLAIM = a battery the shop SOLD coming back under warranty to go to a distributor (propose_battery_claim). To sell scrap: call lookup_scrap first (unless the person gave exact batch numbers), then ask for anything missing: which batches (or the whole pile), buyer name, total weight in kg and rate per kg. Never guess a weight, rate, or charging price. For a charging slip you must have the price the person states. For a claim, only pass the bill number, distributor and amounts the person actually said. Dates: leave out to mean today; if they say yesterday or a date, convert it using today's date from the live numbers.",
    "- After a propose_* tool succeeds, reply in one or two short sentences: what you prepared, and ask them to check the card and tap Confirm. If they say 'yes' or 'confirm' in chat, tell them to tap Confirm on the card. Do not prepare the same thing again unless they change something. If a proposal tool returns an error, explain it plainly and ask what to do.",
    "- Only use numbers from 'Live shop numbers' below or from a lookup tool result. Never invent or guess a price, quantity, name, or amount. If you don't have a number, say you don't have it.",
    "- For any question about a specific stock item, brand, size or price, call lookup_inventory. For any question about one specific customer or how much they owe, call lookup_customer. Don't answer those from memory or from the summary numbers.",
    "- When calling a lookup, pass only short keywords (brand, model, Ah/watt size, type, or the customer's name/phone) — never the whole sentence. If the person writes Roman Urdu or Urdu, translate the search words to how they'd appear on the item or customer name.",
    "- Quote amounts and quantities from tool results exactly as given; do not do your own maths on them. If a tool says nothing matched, say you couldn't find it. If it says results are only close guesses, say so and ask if they meant one of them. If several customers or items match and the question was about one, list the names briefly and ask which.",
    "- Keep replies short and in plain language. Match whatever language or script the person writes in.",
  ];
  if (knowledge) {
    systemParts.push("", "Shop knowledge (from files the owner added):", knowledge);
  }
  if (snapshot) {
    systemParts.push("", "Live shop numbers right now:", snapshot);
  }

  const ctx: ToolContext = { supabase, userMessage: last.content, proposals: [] };

  const messages: ChatMessage[] = [
    { role: "system", content: systemParts.join("\n") },
    ...incoming.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const { reply, toolsUsed } = await askGroqWithTools(messages, TOOL_DEFS, (name, rawArgs) => runTool(ctx, name, rawArgs));
    return NextResponse.json({ reply, personaName: persona.name, toolsUsed, proposals: ctx.proposals });
  } catch (err) {
    if (err instanceof GroqConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    if (err instanceof GroqRequestError) {
      const status = err.status && err.status < 500 ? err.status : 502;
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json({ error: "The assistant hit an unexpected error. Try again." }, { status: 500 });
  }
}
