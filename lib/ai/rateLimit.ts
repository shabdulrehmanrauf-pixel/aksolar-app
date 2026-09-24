/**
 * Phase 10, Part 4 — basic per-user rate limit for /api/assistant.
 *
 * Calls the ai_rate_limit_check() RPC (supabase/11_ai_rate_limit.sql), which
 * atomically checks and bumps a fixed-window counter for the signed-in user.
 *
 * Fails OPEN, not closed: if the SQL hasn't been run yet (table/function
 * missing) or the check errors for any other reason, the request is allowed
 * through rather than blocking the assistant entirely. This only exists to
 * stop accidental quota abuse, not to be a hard security boundary.
 *
 * Server-only. Never import from a "use client" component.
 */
import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

// Defaults chosen to stop rapid mashing of Send, not to limit normal use:
// a busy counter asking real questions won't come close to this.
const DEFAULT_MAX = 12;
const DEFAULT_WINDOW_SECONDS = 60;

function tableMissing(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "PGRST205";
}

export async function checkAiRateLimit(supabase: Supa): Promise<RateLimitResult> {
  const max = Number(process.env.AI_RATE_LIMIT_MAX) || DEFAULT_MAX;
  const windowSeconds = Number(process.env.AI_RATE_LIMIT_WINDOW_SECONDS) || DEFAULT_WINDOW_SECONDS;

  try {
    const { data, error } = await supabase.rpc("ai_rate_limit_check", {
      p_limit: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      if (tableMissing(error)) return { allowed: true }; // SQL not run yet — don't block on it.
      console.error("ai_rate_limit_check failed:", error.message);
      return { allowed: true }; // fail open
    }
    const row = data as { allowed?: boolean; retry_after_seconds?: number } | null;
    if (!row || row.allowed !== false) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(row.retry_after_seconds ?? 5, 1) };
  } catch (err) {
    console.error("ai_rate_limit_check threw:", err);
    return { allowed: true }; // fail open
  }
}
