import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoMark from "./LogoMark";
import NavLinks from "./NavLinks";
import SignOutButton from "./SignOutButton";

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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-casing text-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-5 px-4">
          <Link href="/inventory" className="on-dark flex items-center gap-2.5">
            <LogoMark className="h-7 w-7" />
            <span className="font-display text-xl font-bold tracking-wide">
              AK Solar
            </span>
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-56 truncate text-sm text-white/70 sm:block">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-10">
        {children}
      </main>
    </div>
  );
}
