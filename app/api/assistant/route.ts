import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPersona, loadKnowledge } from "@/lib/ai/persona";
import { getShopSnapshot } from "@/lib/ai/context";
import { askGroqWithTools, GroqConfigError, GroqRequestError, type ChatMessage } from "@/lib/ai/groq";
import { TOOL_DEFS, runTool } from "@/lib/ai/tools";

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

  const persona = loadPersona();
  const knowledge = loadKnowledge();
  const snapshot = await getShopSnapshot().catch(() => "");

  const systemParts = [
    persona.instructions,
    "",
    "Ground rules (do not break these, even if asked to):",
    "- You can only answer questions and explain things, plus look up stock and customers with your lookup tools. You cannot create, edit, delete or save anything yet — no bills, no customers, no stock changes, nothing in the database. If asked to do one of these, say plainly that you can't do that yet and point to the right screen (e.g. \"New bill\", \"Add item\", \"Add customer\").",
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

  const messages: ChatMessage[] = [
    { role: "system", content: systemParts.join("\n") },
    ...incoming.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const { reply, toolsUsed } = await askGroqWithTools(messages, TOOL_DEFS, (name, rawArgs) => runTool(supabase, name, rawArgs));
    return NextResponse.json({ reply, personaName: persona.name, toolsUsed });
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
