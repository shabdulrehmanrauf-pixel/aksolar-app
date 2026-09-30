import type { Metadata } from "next";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Avatar from "@/components/Avatar";
import HomeCommandBar from "@/components/HomeCommandBar";
import Icon, { type IconName } from "@/components/Icons";
import { formatPhone } from "@/lib/customers";
import { formatDay, todayKarachi } from "@/lib/invoices";
import { formatRs, formatRsCompact } from "@/lib/format";
import { isLow, isOut, itemSpecs } from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";
import { can, canOpen, effectiveRole } from "@/lib/roles";
import { loadRoleInfo } from "@/lib/rolesServer";
import { loadFbrHomeWarnings } from "@/lib/fbrHomeLoad";
import FbrHomeWarnings from "@/components/FbrHomeWarnings";
import type { Customer, Invoice, InventoryItem } from "@/lib/types";
import PayBadge from "./sales/PayBadge";
import StockGauge from "./inventory/StockGauge";

export const metadata: Metadata = { title: "Home" };

// Small helper: staggers the entrance animation of each block.
const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

const QUICK_TILES: { href: string; label: string; icon: IconName; tone: string }[] = [
  { href: "/sales/new", label: "New bill", icon: "receipt", tone: "from-yellow-400 to-amber-600 shadow-amber-600/35" },
  { href: "/sales", label: "Sales", icon: "banknote", tone: "from-teal-500 to-cyan-700 shadow-teal-700/30" },
  { href: "/udhaar", label: "Udhaar", icon: "alert", tone: "from-red-500 to-orange-600 shadow-red-600/35" },
  { href: "/purchases", label: "Purchases", icon: "cart", tone: "from-orange-500 to-red-700 shadow-orange-600/35" },
  { href: "/inventory", label: "Stock", icon: "battery", tone: "from-amber-400 to-orange-500 shadow-amber-500/35" },
  { href: "/customers", label: "Customers", icon: "users", tone: "from-sky-500 to-blue-700 shadow-blue-600/30" },
  { href: "/suppliers", label: "Suppliers", icon: "truck", tone: "from-indigo-500 to-violet-700 shadow-indigo-600/30" },
  { href: "/payments", label: "Payments", icon: "swap", tone: "from-cyan-600 to-teal-800 shadow-teal-700/30" },
  { href: "/expenses", label: "Expenses", icon: "minus", tone: "from-red-500 to-rose-700 shadow-rose-600/30" },
  { href: "/inventory?add=1", label: "Add item", icon: "plus", tone: "from-emerald-500 to-green-700 shadow-green-700/30" },
  { href: "/customers?add=1", label: "Add customer", icon: "userplus", tone: "from-violet-500 to-indigo-700 shadow-indigo-600/30" },
  { href: "/battery-services?tab=claims", label: "Claim", icon: "shield", tone: "from-rose-500 to-pink-700 shadow-rose-600/30" },
  { href: "/battery-services?tab=charging", label: "Charging", icon: "plug", tone: "from-cyan-500 to-sky-700 shadow-cyan-600/30" },
  { href: "/scrap", label: "Scrap", icon: "box", tone: "from-stone-500 to-neutral-700 shadow-neutral-600/30" },
];

type MoneySummary = {
  sales_total: number;
  sales_count: number;
  cash_received: number;
  udhaar_total: number;
  udhaar_count: number;
};

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Karachi" }).format(new Date())
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Karachi",
  }).format(new Date());
}

export default async function HomePage() {
  const supabase = await createClient();
  const roleInfo = await loadRoleInfo();
  const canBill = can(roleInfo, "sales.create");
  const tiles = QUICK_TILES.filter((t) =>
    t.href === "/inventory?add=1"
      ? can(roleInfo, "inventory.edit")
      : t.href === "/customers?add=1"
        ? can(roleInfo, "customers.edit")
        : canOpen(roleInfo, t.href.split("?")[0])
  );
  // Only the Owner and Accountant see FBR trouble on Home (same audience that sees FBR error detail on a bill).
  const seesFbrWarnings = effectiveRole(roleInfo) === "owner" || effectiveRole(roleInfo) === "accountant";
  const today = todayKarachi();
  const [inventory, recent, money, recentBills, fbrWarnings] = await Promise.all([
    supabase
      .from("inventory")
      .select("id,category,brand,model,type,voltage,plates,ah_rating,wattage,warranty_months,quantity,reorder_level,cost_price,sale_price"),
    // One request gives both the 5 newest customers and the total count (and reports a missing table).
    supabase
      .from("customers")
      .select("id,name,phone,registration_type,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.rpc("money_summary", { p_day: today }),
    supabase
      .from("invoice_balances")
      .select("id,invoice_number,buyer_name,invoice_date,total_value,due_total,payment_status,status")
      .order("created_at", { ascending: false })
      .limit(5),
    seesFbrWarnings ? loadFbrHomeWarnings() : Promise.resolve(null),
  ]);
  const billsReady = !money.error && !recentBills.error;
  const summary = (money.data ?? null) as MoneySummary | null;
  const bills = (recentBills.data ?? []) as Pick<
    Invoice,
    "id" | "invoice_number" | "buyer_name" | "invoice_date" | "total_value" | "due_total" | "payment_status" | "status"
  >[];
  const moneyCards: { label: string; value: string; sub: string; href: string; icon: IconName; tone: string }[] = summary
    ? [
        {
          label: "Sales today",
          value: formatRsCompact(summary.sales_total),
          sub: `${summary.sales_count} ${summary.sales_count === 1 ? "bill" : "bills"}`,
          href: "/sales",
          icon: "receipt",
          tone: "bg-sun/25 text-amber-800",
        },
        {
          label: "Cash received today",
          value: formatRsCompact(summary.cash_received),
          sub: "Cash, bank and other",
          href: "/reports?range=today",
          icon: "banknote",
          tone: "bg-cell/10 text-cell",
        },
        {
          label: "Udhaar to collect",
          value: formatRsCompact(summary.udhaar_total),
          sub: `${summary.udhaar_count} open ${summary.udhaar_count === 1 ? "bill" : "bills"}`,
          href: "/udhaar",
          icon: "alert",
          tone: summary.udhaar_total > 0 ? "bg-terminal/10 text-terminal" : "bg-cell/10 text-cell",
        },
      ]
    : [];

  const items = (inventory.data ?? []) as InventoryItem[];
  const stockAtCost = items.reduce((sum, i) => sum + i.cost_price * i.quantity, 0);
  const stockAtSale = items.reduce((sum, i) => sum + i.sale_price * i.quantity, 0);
  const lowItems = items
    .filter(isLow)
    .sort((a, b) => a.quantity - a.reorder_level - (b.quantity - b.reorder_level));
  const customersReady = !recent.error;
  const customerTotal = recent.count ?? 0;
  const recentCustomers = (recent.data ?? []) as Pick<Customer, "id" | "name" | "phone" | "registration_type">[];

  const stats: { label: string; value: string; full: string; icon: IconName; chip: string }[] = [
    {
      label: "Stock value",
      value: formatRsCompact(stockAtCost),
      full: formatRs(stockAtCost),
      icon: "banknote",
      chip: "bg-sun/25 text-sun",
    },
    {
      label: "Running low",
      value: String(lowItems.length),
      full: `${lowItems.length} items`,
      icon: "alert",
      chip: lowItems.length > 0 ? "bg-terminal/30 text-red-200" : "bg-cell/35 text-emerald-200",
    },
    {
      label: "Customers",
      value: customersReady ? String(customerTotal) : "-",
      full: customersReady ? `${customerTotal} customers` : "Customers table not set up yet",
      icon: "users",
      chip: "bg-sky-400/25 text-sky-200",
    },
    {
      label: "Worth at sale price",
      value: formatRsCompact(stockAtSale),
      full: formatRs(stockAtSale),
      icon: "tag",
      chip: "bg-violet-400/25 text-violet-200",
    },
  ];

  return (
    <AppShell>
      <div className="pb-24 lg:pb-0">
        {/* Hero with the numbers */}
        <section
          className="anim-slide hero-card relative overflow-hidden rounded-3xl p-5 text-white shadow-lift sm:p-7"
        >
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-white/70">{todayLabel()}</p>
              <h1 className="mt-1 font-display text-4xl font-bold leading-none sm:text-5xl">{greeting()}</h1>
              <p className="mt-2 max-w-md text-[15px] text-white/75">
                {items.length === 0
                  ? "Add your first item to start tracking stock."
                  : "Here is how your stock looks right now."}
              </p>
            </div>
            <div className="hidden gap-2 sm:flex lg:hidden">
              {canBill && (
<Link href="/sales/new" className="btn btn-primary">
                <Icon name="receipt" className="h-5 w-5" /> New bill
              </Link>
)}
              <Link
                href="/customers?add=1"
                className="on-dark btn border border-white/20 bg-white/10 text-white hover:bg-white/20"
              >
                <Icon name="userplus" className="h-5 w-5" /> Add customer
              </Link>
            </div>
          </div>

          <div className="no-scrollbar relative -mx-5 mt-5 flex snap-x scroll-pl-5 gap-3 overflow-x-auto px-5 sm:mx-0 sm:grid sm:scroll-pl-0 sm:grid-cols-4 sm:overflow-visible sm:px-0">
            {stats.map((s) => (
              <div
                key={s.label}
                title={s.full}
                className="min-w-[9.5rem] flex-1 snap-start rounded-2xl border border-white/10 bg-white/[0.08] p-3.5 sm:min-w-0 sm:p-4"
              >
                <span className={`mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-xl ${s.chip}`}>
                  <Icon name={s.icon} className="h-[18px] w-[18px]" />
                </span>
                <p className="text-sm leading-tight text-white/70">{s.label}</p>
                <p className="mt-1 whitespace-nowrap font-display text-[26px] font-semibold leading-none tabular-nums xl:text-3xl">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Money today */}
        <section aria-label="Money today" className="anim-rise mt-4" style={delay(1)}>
          {billsReady ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {moneyCards.map((m) => (
                <Link key={m.label} href={m.href} className="card card-hover flex items-center gap-3.5 p-4">
                  <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${m.tone}`}>
                    <Icon name={m.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-lead">{m.label}</span>
                    <span className="block whitespace-nowrap font-display text-3xl font-semibold leading-none tabular-nums">{m.value}</span>
                    <span className="mt-1 block text-sm text-lead">{m.sub}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card p-4 text-lead">
              Sales numbers are not set up yet. In Supabase, open SQL Editor and run{" "}
              <code className="rounded bg-plate px-1.5 py-0.5 text-casing">03_invoices.sql</code>.
            </div>
          )}
        </section>

        {/* FBR warnings */}
        {fbrWarnings && (
          <div className="anim-rise mt-4" style={delay(1)}>
            <FbrHomeWarnings w={fbrWarnings} />
          </div>
        )}

        {/* Low-stock strip */}
        {items.length > 0 && (
          <div className="anim-rise mt-4" style={delay(2)}>
            {lowItems.length > 0 ? (
              <Link
                href="/inventory?filter=low"
                className="group flex items-center gap-3 rounded-2xl border border-terminal/20 bg-terminal/10 px-4 py-3.5 text-terminal-deep transition-colors hover:bg-terminal/15"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-terminal opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-terminal" />
                </span>
                <span className="flex-1 text-[15px] font-medium">
                  {lowItems.length} {lowItems.length === 1 ? "item is" : "items are"} running low in stock
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold">
                  View <Icon name="chevron" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-cell/20 bg-cell/10 px-4 py-3.5 text-cell-deep">
                <Icon name="check" className="h-5 w-5" strokeWidth={2.4} />
                <span className="text-[15px] font-medium">All {items.length} items are above their reorder level</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* Quick actions */}
          <section
            aria-label="Quick actions"
            className="anim-rise grid grid-cols-3 gap-2.5 lg:col-start-2 lg:row-start-1 lg:grid-cols-2 lg:gap-3"
            style={delay(2)}
          >
            {tiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="card card-hover flex flex-col items-center gap-2 p-3 text-center lg:flex-row lg:gap-3 lg:p-4 lg:text-left"
              >
                <span
                  className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br text-white shadow-md ${t.tone}`}
                >
                  <Icon name={t.icon} className="h-6 w-6" />
                </span>
                <span className="text-[13px] font-semibold leading-tight lg:text-[15px]">{t.label}</span>
              </Link>
            ))}
          </section>

          {/* Running low list */}
          <section
            className="card anim-rise overflow-hidden lg:col-start-1 lg:row-span-2 lg:row-start-1"
            style={delay(3)}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h2 className="font-display text-2xl font-semibold">Running low</h2>
              {lowItems.length > 0 && (
                <Link href="/inventory?filter=low" className="text-sm font-semibold text-focus hover:underline">
                  See all {lowItems.length}
                </Link>
              )}
            </div>
            {inventory.error ? (
              <p className="px-5 pb-6 text-lead">
                Stock could not be loaded. Open Inventory to see what went wrong.
              </p>
            ) : lowItems.length === 0 ? (
              <div className="px-5 pb-8 pt-3 text-center">
                <span
                  className={`mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl ${
                    items.length === 0 ? "bg-sun/25 text-amber-800" : "bg-cell/10 text-cell"
                  }`}
                >
                  <Icon name={items.length === 0 ? "battery" : "check"} className="h-7 w-7" strokeWidth={2.2} />
                </span>
                <p className="mt-3 font-display text-xl font-semibold">
                  {items.length === 0 ? "No stock yet" : "Nothing is running low"}
                </p>
                <p className="mx-auto mt-1 max-w-xs text-lead">
                  {items.length === 0
                    ? "Add your first battery, panel or accessory."
                    : "Items appear here when they reach their reorder level."}
                </p>
                {items.length === 0 && (
                  <Link href="/inventory?add=1" className="btn btn-primary mt-4">
                    Add first item
                  </Link>
                )}
              </div>
            ) : (
              <ul className="px-2 pb-3">
                {lowItems.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/inventory?q=${encodeURIComponent(`${item.brand} ${item.model}`)}`}
                      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-plate/70"
                    >
                      <span className="hidden sm:block">
                        <StockGauge quantity={item.quantity} reorderLevel={item.reorder_level} animate />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {item.brand} {item.model}
                        </span>
                        <span className="block truncate text-sm text-lead">{itemSpecs(item) || "No details"}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display text-2xl font-semibold leading-none tabular-nums text-terminal-deep">
                          {item.quantity}
                        </span>
                        <span className="block text-xs text-lead">
                          {isOut(item) ? "Out of stock" : `reorder at ${item.reorder_level}`}
                        </span>
                      </span>
                      <Icon name="chevron" className="h-4 w-4 text-lead/60 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent customers */}
          <section className="card anim-rise overflow-hidden lg:col-start-2 lg:row-start-2" style={delay(4)}>
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h2 className="font-display text-2xl font-semibold">Recent customers</h2>
              {recentCustomers.length > 0 && (
                <Link href="/customers" className="text-sm font-semibold text-focus hover:underline">
                  See all
                </Link>
              )}
            </div>
            {!customersReady ? (
              <p className="px-5 pb-6 text-lead">
                The customers table is not set up yet. In Supabase, open SQL Editor and run{" "}
                <code className="rounded bg-plate px-1.5 py-0.5 text-casing">02_customers.sql</code>.
              </p>
            ) : recentCustomers.length === 0 ? (
              <div className="px-5 pb-8 pt-3 text-center">
                <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 text-blue-700">
                  <Icon name="users" className="h-7 w-7" />
                </span>
                <p className="mt-3 font-display text-xl font-semibold">No customers yet</p>
                <p className="mx-auto mt-1 max-w-xs text-lead">Save a customer once and find them again in one search.</p>
                <Link href="/customers?add=1" className="btn btn-quiet mt-4">
                  Add first customer
                </Link>
              </div>
            ) : (
              <ul className="px-2 pb-3">
                {recentCustomers.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/customers/${c.id}`}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-plate/70"
                    >
                      <Avatar name={c.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{c.name}</span>
                        <span className="block truncate text-sm text-lead">
                          {c.phone ? formatPhone(c.phone) : "No phone saved"}
                        </span>
                      </span>
                      <Icon name="chevron" className="h-4 w-4 text-lead/60 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Recent bills */}
        {billsReady && (
          <section className="card anim-rise mt-5 overflow-hidden" style={delay(5)}>
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h2 className="font-display text-2xl font-semibold">Recent bills</h2>
              {bills.length > 0 && (
                <Link href="/sales" className="text-sm font-semibold text-focus hover:underline">
                  See all
                </Link>
              )}
            </div>
            {bills.length === 0 ? (
              <div className="px-5 pb-8 pt-3 text-center">
                <p className="font-display text-xl font-semibold">No bills yet</p>
                <p className="mx-auto mt-1 max-w-xs text-lead">Your latest bills will show here.</p>
                {canBill && (
<Link href="/sales/new" className="btn btn-primary mt-4">
                  Make first bill
                </Link>
)}
              </div>
            ) : (
              <ul className="px-2 pb-3">
                {bills.map((b) => (
                  <li key={b.id}>
                    <Link href={`/sales/${b.id}`} className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-plate/70">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{b.buyer_name}</span>
                        <span className="block truncate text-sm text-lead">
                          {b.invoice_number} · {formatDay(b.invoice_date)}
                        </span>
                      </span>
                      <span className="hidden sm:block">
                        <PayBadge status={b.payment_status} bill={b.status} />
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">{formatRs(b.total_value)}</span>
                        {b.status !== "Cancelled" && b.due_total > 0 && (
                          <span className="block text-sm font-semibold tabular-nums text-terminal-deep">{formatRs(b.due_total)} due</span>
                        )}
                      </span>
                      <Icon name="chevron" className="h-4 w-4 text-lead/60 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <HomeCommandBar />
    </AppShell>
  );
}
