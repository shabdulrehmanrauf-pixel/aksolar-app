/**
 * Thin server-only wrapper around Groq's chat completions endpoint.
 *
 * Groq's API is OpenAI-compatible, so a plain `fetch` is enough — deliberately
 * no `groq-sdk`/`openai` package added, per the project rule of not pulling in
 * a library unless it's clearly needed (see MDF_IELES rules, section 15.2).
 *
 * NEVER import this file from a "use client" component — GROQ_API_KEY must
 * only ever run on the server, same rule as SUPABASE_SERVICE_ROLE_KEY.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// openai/gpt-oss-20b: fast and free-tier-friendly (checked against Groq's docs,
// Sep 2026 — llama-3.3-70b-versatile and llama-3.1-8b-instant were retired in
// Aug 2026). Override with GROQ_MODEL in .env.local, e.g. openai/gpt-oss-120b
// for better quality at the cost of speed. Check console.groq.com/docs/models
// for the current list before changing this — Groq deprecates models on a
// public schedule and old IDs start returning errors after their shutdown date.
const DEFAULT_MODEL = "openai/gpt-oss-20b";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** The assistant isn't configured yet (no API key). Safe to show this message to the user. */
export class GroqConfigError extends Error {}

/** Groq reached but returned an error (bad request, rate limit, outage, etc). */
export class GroqRequestError extends Error {
  status?: number;
  /** Groq's own error code when it sent one, e.g. "tool_use_failed". */
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ---------- Tool calling (Phase 10, Part 2) ---------- */

/** A function the model may ask the server to run. Read-only lookups only in Part 2. */
export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type WireMessage =
  | ChatMessage
  | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type GroqChoiceMessage = { content?: string | null; tool_calls?: ToolCall[] };

/** One raw call to Groq. Throws friendly, typed errors. */
async function callGroq(messages: WireMessage[], extra: Record<string, unknown> = {}): Promise<GroqChoiceMessage> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqConfigError(
      "The AI assistant isn't set up yet — GROQ_API_KEY is missing. Get a free key at console.groq.com/keys and add it to .env.local (and Vercel's project env vars)."
    );
  }

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages,
        temperature: 0.3,
        // gpt-oss "thinks" before answering and those tokens count here too,
        // so this is a little higher than a plain chat reply would need.
        max_tokens: 900,
        ...extra,
      }),
    });
  } catch {
    throw new GroqRequestError("Couldn't reach Groq right now. Check the internet connection and try again.");
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new GroqRequestError("The free Groq quota was just hit. Wait a minute and try again.", 429);
    }
    if (res.status === 401) {
      throw new GroqRequestError("Groq rejected the API key. Check GROQ_API_KEY in .env.local / Vercel.", 401);
    }
    const text = await res.text().catch(() => "");
    let code: string | undefined;
    try {
      code = (JSON.parse(text) as { error?: { code?: string } }).error?.code;
    } catch {
      // Not JSON — leave the code empty.
    }
    throw new GroqRequestError(`Groq request failed (${res.status}). ${text.slice(0, 200)}`.trim(), res.status, code);
  }

  const data = (await res.json()) as { choices?: { message?: GroqChoiceMessage }[] };
  const message = data.choices?.[0]?.message;
  if (!message) throw new GroqRequestError("Groq sent back an empty reply. Try asking again.");
  return message;
}

/** Plain question in, plain answer out. No tools. */
export async function askGroq(messages: ChatMessage[]): Promise<string> {
  const message = await callGroq(messages);
  const reply = message.content?.trim();
  if (!reply) throw new GroqRequestError("Groq sent back an empty reply. Try asking again.");
  return reply;
}

/** How many times the model may ask for lookups before it must answer. Keeps one question from burning the free quota. */
const MAX_TOOL_ROUNDS = 3;

/**
 * Asks Groq, lets it call the given read-only tools, feeds the results back,
 * and returns the final text answer. `runTool` must return a string (JSON) and
 * must never throw — return an error string instead so the model can explain.
 */
export async function askGroqWithTools(
  messages: ChatMessage[],
  tools: ToolDef[],
  runTool: (name: string, rawArgs: string) => Promise<string>
): Promise<{ reply: string; toolsUsed: string[] }> {
  const convo: WireMessage[] = [...messages];
  const toolsUsed: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the last round tools are switched off, so the model has to answer with what it already has.
    const lastRound = round === MAX_TOOL_ROUNDS;

    let message: GroqChoiceMessage;
    try {
      message = await callGroq(convo, lastRound ? {} : { tools, tool_choice: "auto" });
    } catch (err) {
      // The model sometimes writes a malformed tool call. Retry once as a plain
      // answer rather than showing the person a scary error.
      if (err instanceof GroqRequestError && err.code === "tool_use_failed" && !lastRound) {
        const fallback = [
          ...convo,
          { role: "system" as const, content: "The lookup could not be run this time. Answer without it, and if you need a specific number you don't have, say you couldn't look it up and ask them to try again." },
        ];
        const plain = await callGroq(fallback);
        const text = plain.content?.trim();
        if (!text) throw new GroqRequestError("Groq sent back an empty reply. Try asking again.");
        return { reply: text, toolsUsed };
      }
      throw err;
    }

    const calls = message.tool_calls ?? [];
    if (calls.length === 0 || lastRound) {
      const reply = message.content?.trim();
      if (!reply) throw new GroqRequestError("Groq sent back an empty reply. Try asking again.");
      return { reply, toolsUsed };
    }

    convo.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    for (const call of calls) {
      if (!toolsUsed.includes(call.function.name)) toolsUsed.push(call.function.name);
      const result = await runTool(call.function.name, call.function.arguments);
      convo.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  // Unreachable (the last round always returns), kept so TypeScript is satisfied.
  throw new GroqRequestError("The assistant couldn't finish that lookup. Try asking again.");
}
