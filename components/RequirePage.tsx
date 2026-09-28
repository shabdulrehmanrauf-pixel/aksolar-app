import { redirect } from "next/navigation";
import { canOpen } from "@/lib/roles";
import { loadRoleInfo } from "@/lib/rolesServer";

/**
 * Wrap a screen (in its layout) so a role that may not use it is sent Home instead.
 * The database refuses the data anyway; this just keeps people out of empty or confusing pages.
 */
export default async function RequirePage({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  const info = await loadRoleInfo();
  if (!canOpen(info, path)) redirect("/");
  return <>{children}</>;
}
