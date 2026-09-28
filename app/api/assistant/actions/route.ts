import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canOpen } from "@/lib/roles";
import { loadRoleInfo } from "@/lib/rolesServer";
import { decideAction } from "@/lib/ai/proposals";
import type { ActionDecision } from "@/lib/ai/proposalTypes";

// Uses cookies for auth, so this runs in the Node.js runtime like the chat route.
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISIONS: ActionDecision[] = ["confirm", "cancel", "edit"];

/**
 * A person tapped Confirm / Cancel / Edit on a proposal card.
 *
 * Only the proposal's id and the button pressed come from the browser. What actually gets
 * saved is re-read from the ai_actions row the server wrote earlier, and the database only
 * lets that row's own user claim it, once, within 30 minutes. See lib/ai/proposals.ts.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Sign in again to continue." }, { status: 401 });
  if (!canOpen(await loadRoleInfo(), "/assistant")) {
    return NextResponse.json({ ok: false, message: "The assistant is not available for your role." }, { status: 403 });
  }

  let body: { id?: unknown; decision?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const decision = body.decision as ActionDecision;
  if (!UUID.test(id) || !DECISIONS.includes(decision)) {
    return NextResponse.json({ ok: false, message: "Bad request." }, { status: 400 });
  }

  const result = await decideAction(supabase, id, decision);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
