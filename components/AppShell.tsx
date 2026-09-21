import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CommandHost from "./CommandHost";
import NavLinks from "./NavLinks";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

/**
 * The frame around every signed-in screen:
 * phone and tablet = top bar + bottom tab bar, desktop (1024px+) = dark sidebar + top bar.
 */
export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const email = user.email ?? "Signed in";

  return (
    <div className="min-h-dvh">
      <Sidebar email={email} />
      <div className="lg:pl-64">
        <TopBar email={email} />
        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 lg:px-8 lg:pb-14 lg:pt-8">{children}</main>
      </div>
      <NavLinks variant="bottom" />
      <CommandHost />
    </div>
  );
}
