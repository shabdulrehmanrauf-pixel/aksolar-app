import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { LEGACY_ROLE_INFO, parseRoleInfo, type RoleInfo } from "@/lib/roles";

/**
 * The signed-in person's role. Server only. Asked once per page load (cached), even if the
 * shell and the page both ask.
 *
 * If the database function does not exist yet (Part 1 SQL not run) or the call fails, this returns
 * "legacy" so the app keeps working exactly like before instead of locking everybody out. The
 * database itself is what really protects the data.
 */
export const loadRoleInfo = cache(async (): Promise<RoleInfo> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("my_role_info");
    if (error) return LEGACY_ROLE_INFO;
    return parseRoleInfo(data);
  } catch {
    return LEGACY_ROLE_INFO;
  }
});
