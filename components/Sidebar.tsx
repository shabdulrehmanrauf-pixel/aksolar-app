import Link from "next/link";
import Avatar from "./Avatar";
import LogoMark from "./LogoMark";
import NavLinks from "./NavLinks";
import SignOutButton from "./SignOutButton";

const SIGN_OUT_DARK =
  "on-dark inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60";

/** Desktop navigation (1024px and wider). Hidden on phones and tablets, which use the bottom bar. */
export default function Sidebar({ email, name, roleLabel }: { email: string; name?: string; roleLabel?: string }) {
  const shown = name || email;
  return (
    <aside className="sidebar-bg fixed inset-y-0 left-0 z-30 hidden w-64 flex-col text-white lg:flex">
      <Link href="/" className="on-dark flex h-16 items-center gap-3 px-6">
        <LogoMark className="h-8 w-8" />
        <span className="font-display text-2xl font-bold tracking-wide">AK Solar</span>
      </Link>

      <div className="flex-1 px-3 pt-4">
        <p className="mb-2 px-3.5 text-xs font-medium uppercase tracking-[0.14em] text-white/40">Shop</p>
        <NavLinks variant="sidebar" />
      </div>

      <div className="m-3 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <Avatar name={shown} size="sm" />
          <div className="min-w-0">
            <p className="text-xs text-white/50">{roleLabel ? `Signed in · ${roleLabel}` : "Signed in"}</p>
            <p className="truncate text-sm font-medium text-white/90" title={email}>
              {shown}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <SignOutButton className={SIGN_OUT_DARK} />
        </div>
      </div>
    </aside>
  );
}
