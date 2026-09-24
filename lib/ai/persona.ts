/**
 * Loads the AI assistant's persona and knowledge files from disk.
 *
 * Server-only (uses `fs`) — never import this from a "use client" component.
 * Both are re-read on every call rather than cached, on purpose: editing
 * `lib/ai/personas/*.md` or dropping a file into `lib/ai/knowledge/` should
 * take effect on the very next message, with no restart or redeploy needed
 * to iterate on wording. The files are tiny, so this costs nothing.
 *
 * See lib/ai/personas/README.md and lib/ai/knowledge/README.md for the
 * non-technical explanation of how to use these folders.
 */
import fs from "node:fs";
import path from "node:path";

const PERSONAS_DIR = path.join(process.cwd(), "lib", "ai", "personas");
const KNOWLEDGE_DIR = path.join(process.cwd(), "lib", "ai", "knowledge");

/** Combined knowledge-file budget, in characters (~1,500 tokens). Keeps every
 *  request small and predictable on Groq's free tier even if several files
 *  are dropped in the knowledge folder at once. */
const MAX_KNOWLEDGE_CHARS = 6000;

const FALLBACK_PERSONA = {
  name: "AK Solar Assistant",
  instructions: "You are a plain-spoken, honest assistant for a battery and solar shop. Keep answers short and never invent numbers.",
};

export type LoadedPersona = { name: string; instructions: string };

function listTextFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md") || f.endsWith(".txt"))
      .sort();
  } catch {
    return [];
  }
}

/** Reads the persona named by AI_ASSISTANT_PERSONA (default: "default"). Falls
 *  back to a built-in persona if the file is missing or unreadable, so a typo
 *  in the env var never breaks the assistant. */
export function loadPersona(): LoadedPersona {
  const active = (process.env.AI_ASSISTANT_PERSONA || "default").trim() || "default";
  const file = path.join(PERSONAS_DIR, `${active}.md`);

  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return FALLBACK_PERSONA;
  }

  const firstBreak = raw.indexOf("\n");
  const firstLine = (firstBreak === -1 ? raw : raw.slice(0, firstBreak)).trim();

  if (firstLine.startsWith("#")) {
    const name = firstLine.replace(/^#+\s*/, "").trim() || FALLBACK_PERSONA.name;
    const instructions = (firstBreak === -1 ? "" : raw.slice(firstBreak + 1)).trim();
    return { name, instructions: instructions || FALLBACK_PERSONA.instructions };
  }

  return { name: FALLBACK_PERSONA.name, instructions: raw.trim() || FALLBACK_PERSONA.instructions };
}

/** Reads every file in lib/ai/knowledge/ and joins them into one block, capped
 *  at MAX_KNOWLEDGE_CHARS. Returns "" when the folder is empty (just the
 *  README, or nothing) so callers can skip the section entirely. */
export function loadKnowledge(): string {
  const files = listTextFiles(KNOWLEDGE_DIR).filter((f) => f.toLowerCase() !== "readme.md");
  if (files.length === 0) return "";

  let combined = "";
  for (const f of files) {
    if (combined.length >= MAX_KNOWLEDGE_CHARS) break;
    try {
      const text = fs.readFileSync(path.join(KNOWLEDGE_DIR, f), "utf8").trim();
      if (!text) continue;
      combined += `\n\n### ${f}\n${text}`;
    } catch {
      // One unreadable file shouldn't break the others.
    }
  }
  return combined.slice(0, MAX_KNOWLEDGE_CHARS).trim();
}
