import type { Metadata } from "next";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import Icon, { type IconName } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "More" };

// Only shortcuts to screens that exist. Import/Export and Settings will be added with their phases.
const SHORTCUTS: { href: string; label: string; hint: string; icon: IconName; tone: string }[] = [
  { href: "/sales/new", label: "New bill", hint: "Make a sale and take payment", icon: "receipt", tone: "bg-sun/25 text-amber-800" },
  { href: "/sales?filter=due", label: "Udhaar to collect", hint: "Bills that are not fully paid", icon: "banknote", tone: "bg-terminal/10 text-terminal" },
  { href: "/reports", label: "Reports", hint: "Sales, cash closing and best sellers", icon: "chart", tone: "bg-focus/10 text-focus" },
  { href: "/inventory?add=1", label: "Add item", hint: "Add a battery, panel or accessory", icon: "plus", tone: "bg-cell/10 text-cell" },
  { href: "/customers?add=1", label: "Add customer", hint: "Save a new customer", icon: "userplus", tone: "bg-focus/10 text-focus" },
  { href: "/inventory?filter=low", label: "Low stock", hint: "Items that need reordering", icon: "alert", tone: "bg-terminal/10 text-terminal" },
];

export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "Signed in";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="More" />

      <section className="card anim-rise mt-6 flex items-center gap-4 p-5" style={{ "--i": 1 } as React.CSSProperties}>
        <Avatar name={email} size="lg" />
        <div className="min-w-0">
          <p className="text-sm text-lead">Signed in as</p>
          <p className="truncate font-semibold" title={email}>
            {email}
          </p>
        </div>
      </section>

      <ul className="anim-rise mt-4 space-y-2.5" style={{ "--i": 2 } as React.CSSProperties}>
        {SHORTCUTS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="card card-hover flex items-center gap-3.5 p-4">
              <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${s.tone}`}>
                <Icon name={s.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.label}</span>
                <span className="block text-sm text-lead">{s.hint}</span>
              </span>
              <Icon name="chevron" className="h-4 w-4 text-lead/60" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="anim-rise mt-6" style={{ "--i": 3 } as React.CSSProperties}>
        <SignOutButton />
      </div>
    </div>
  );
}
