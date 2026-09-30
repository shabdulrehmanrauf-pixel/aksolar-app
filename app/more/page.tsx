import type { Metadata } from "next";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import Icon, { type IconName } from "@/components/Icons";
import InstallAppButton from "@/components/InstallAppButton";
import PageHeader from "@/components/PageHeader";
import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, canOpen } from "@/lib/roles";
import { loadRoleInfo } from "@/lib/rolesServer";

export const metadata: Metadata = { title: "More" };

// Only shortcuts to screens that exist. Import/Export and Settings will be added with their phases.
// Customers, Suppliers, Purchases, Payments and Expenses live here rather than on the phone bottom
// bar: decision D7 gave the bottom bar's center slot to the "+" quick-actions button instead, which
// only fit by moving Customers off its own icon (still one tap away, here) -- Suppliers/Purchases
// (F1), Payments (F2) and Expenses (F3) are new since then and were never on the bar to begin with.
const SHORTCUTS: { href: string; label: string; hint: string; icon: IconName; tone: string }[] = [
  { href: "/assistant", label: "Assistant", hint: "Ask about stock, sales or customers", icon: "sparkle", tone: "bg-sun/25 text-amber-800" },
  { href: "/sales/new", label: "New bill", hint: "Make a sale and take payment", icon: "receipt", tone: "bg-sun/25 text-amber-800" },
  { href: "/udhaar", label: "Udhaar to collect", hint: "Who owes you money, and how much", icon: "banknote", tone: "bg-terminal/10 text-terminal" },
  { href: "/purchases/new", label: "Receive stock", hint: "Record a new purchase bill", icon: "truck", tone: "bg-focus/10 text-focus" },
  { href: "/payments/new", label: "Make payment", hint: "Pay a supplier, against a bill or on account", icon: "banknote", tone: "bg-cell/10 text-cell" },
  { href: "/suppliers", label: "Suppliers", hint: "Who you buy from, and what you owe", icon: "truck", tone: "bg-lead/10 text-casing" },
  { href: "/purchases", label: "Purchase bills", hint: "Stock received, by supplier", icon: "cart", tone: "bg-cell/10 text-cell" },
  { href: "/payments", label: "Payments", hint: "Every payment made to suppliers", icon: "banknote", tone: "bg-lead/10 text-casing" },
  { href: "/expenses?add=1", label: "Add expense", hint: "Log rent, salaries, fuel, or any other cost", icon: "minus", tone: "bg-terminal/10 text-terminal-deep" },
  { href: "/expenses", label: "Expenses", hint: "Every business expense, by category", icon: "minus", tone: "bg-lead/10 text-casing" },
  { href: "/customers", label: "Customers", hint: "Every saved customer", icon: "users", tone: "bg-focus/10 text-focus" },
  { href: "/reports", label: "Reports", hint: "Sales, cash closing and best sellers", icon: "chart", tone: "bg-focus/10 text-focus" },
  { href: "/inventory?add=1", label: "Add item", hint: "Add a battery, panel or accessory", icon: "plus", tone: "bg-cell/10 text-cell" },
  { href: "/customers?add=1", label: "Add customer", hint: "Save a new customer", icon: "userplus", tone: "bg-focus/10 text-focus" },
  { href: "/inventory?filter=low", label: "Low stock", hint: "Items that need reordering", icon: "alert", tone: "bg-terminal/10 text-terminal" },
  { href: "/battery-services", label: "Battery services", hint: "Charging slips and battery warranty claims", icon: "plug", tone: "bg-focus/10 text-focus" },
  { href: "/scrap", label: "Scrap", hint: "Old batteries taken in exchange, sold by weight", icon: "box", tone: "bg-lead/10 text-casing" },
  { href: "/activity", label: "Activity log", hint: "Who added, changed or deleted what, and when", icon: "shield", tone: "bg-sun/25 text-amber-800" },
  { href: "/team", label: "Team", hint: "Give staff and accountants their own logins", icon: "idcard", tone: "bg-focus/10 text-focus" },
  { href: "/fbr", label: "FBR lists", hint: "Load HS codes, units and provinces for FBR bills", icon: "shield", tone: "bg-sun/25 text-amber-800" },
];

export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "Signed in";
  const info = await loadRoleInfo();
  const name = info.fullName || email;
  const shortcuts = SHORTCUTS.filter((s) => canOpen(info, s.href.split("?")[0]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="More" />

      <section className="card anim-rise mt-6 flex items-center gap-4 p-5" style={{ "--i": 1 } as React.CSSProperties}>
        <Avatar name={name} size="lg" />
        <div className="min-w-0">
          <p className="text-sm text-lead">Signed in as</p>
          <p className="truncate font-semibold" title={email}>
            {name}
          </p>
          <p className="truncate text-sm text-lead">
            {info.role ? ROLE_LABEL[info.role] + " · " : ""}
            {email}
          </p>
        </div>
      </section>

      <ul className="anim-rise mt-4 space-y-2.5" style={{ "--i": 2 } as React.CSSProperties}>
        {shortcuts.map((s) => (
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

      <div className="anim-rise mt-6 space-y-2.5" style={{ "--i": 3 } as React.CSSProperties}>
        <InstallAppButton />
        <SignOutButton />
      </div>
    </div>
  );
}
