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
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export async function askGroq(messages: ChatMessage[]): Promise<string> {
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
        max_tokens: 700,
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
    throw new GroqRequestError(`Groq request failed (${res.status}). ${text.slice(0, 200)}`.trim(), res.status);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new GroqRequestError("Groq sent back an empty reply. Try asking again.");
  return reply;
}
