"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { formatRs } from "@/lib/format";
import { formatDay, invoiceMatches, todayKarachi } from "@/lib/invoices";
import { offlineDb, type LocalInvoice } from "@/lib/offline/db";
import { useLiveQuery } from "@/lib/offline/useLiveQuery";
import { isBrowserOnline } from "@/lib/offline/net";
import type { Invoice } from "@/lib/types";
import { useRoleInfo } from "@/components/RoleProvider";
import Toast from "@/components/Toast";
import { can } from "@/lib/roles";
import PayBadge from "../sales/PayBadge";
import AddUdhaarForm, { type CustomerPick } from "./AddUdhaarForm";

type Sort = "biggest" | "oldest";

const SORTS: { value: Sort; label: string }[] = [
  { value: "biggest", label: "Biggest amount" },
  { value: "oldest", label: "Oldest bill" },
];

type Group = {
  key: string;
  customerId: string | null;
  name: string;
  phone: string | null;
  bills: LocalInvoice[];
  due: number;
  oldest: string; // YYYY-MM-DD of the oldest unpaid bill
};

/** Whole days between a YYYY-MM-DD bill date and today (Pakistan time). */
function daysAgo(day: string): number {
  const [y1, m1, d1] = day.split("-").map(Number);
  const [y2, m2, d2] = todayKarachi().split("-").map(Number);
  const diff = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  return Math.max(0, Math.round(diff / 86400000));
}

function ageLabel(day: string): string {
  const n = daysAgo(day);
  if (n === 0) return "today";
  if (n === 1) return "1 day old";
  return `${n} days old`;
}

export default function UdhaarClient({
  serverInvoices,
  customers = [],
}: {
  serverInvoices: Invoice[];
  customers?: CustomerPick[];
}) {
  const router = useRouter();
  const roleInfo = useRoleInfo();
  const canAdd = can(roleInfo, "udhaar.add");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("biggest");

  // Keep the offline copy fresh (only when really online), same as the Sales page does.
  useEffect(() => {
    if (!isBrowserOnline() || serverInvoices.length === 0) return;
    const rows: LocalInvoice[] = serverInvoices.map((r) => ({ ...r, pending: false, local_id: r.id }));
    offlineDb.invoices.bulkPut(rows).catch(() => {});
  }, [serverInvoices]);

  const local = useLiveQuery(
    () => offlineDb.invoices.toArray(),
    [],
    serverInvoices.map((r) => ({ ...r, pending: false, local_id: r.id }) as LocalInvoice)
  );

  // Online: trust the server list (so a bill that was just paid disappears), plus bills made offline
  // that are not synced yet. Offline: use whatever is saved on this phone.
  const dueBills = useMemo(() => {
    const online = isBrowserOnline();
    const serverIds = new Set(serverInvoices.map((i) => i.id));
    return local.filter(
      (i) => i.status !== "Cancelled" && i.due_total > 0 && (i.pending || !online || serverIds.has(i.id))
    );
  }, [local, serverInvoices]);

  const totalDue = dueBills.reduce((s, i) => s + i.due_total, 0);

  // One card per customer, with that customer's unpaid bills inside.
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const inv of dueBills) {
      if (!invoiceMatches(inv, query)) continue;
      const key = inv.customer_id ?? `walkin:${inv.buyer_name.trim().toLowerCase()}`;
      let g = map.get(key);
      if (!g) {
        g = { key, customerId: inv.customer_id, name: inv.buyer_name, phone: inv.buyer_phone, bills: [], due: 0, oldest: inv.invoice_date };
        map.set(key, g);
      }
      g.bills.push(inv);
      g.due += inv.due_total;
      if (inv.invoice_date < g.oldest) g.oldest = inv.invoice_date;
    }
    const list = [...map.values()];
    for (const g of list) g.bills.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
    list.sort((a, b) => (sort === "biggest" ? b.due - a.due : a.oldest.localeCompare(b.oldest)));
    return list;
  }, [dueBills, query, sort]);

  const shownDue = groups.reduce((s, g) => s + g.due, 0);
  const shownBills = groups.reduce((s, g) => s + g.bills.length, 0);
  const customerCount = new Set(dueBills.map((i) => i.customer_id ?? `walkin:${i.buyer_name.trim().toLowerCase()}`)).size;

  return (
    <div>
      <PageHeader
        title="Udhaar"
        subtitle="Money customers still have to pay you"
        action={
          canAdd && (
            <button type="button" onClick={() => setAdding(true)} className="btn btn-primary">
              <Icon name="plus" className="h-5 w-5" /> Add udhaar
            </button>
          )
        }
      />

      {/* The three numbers */}
      <section className="anim-rise mt-5 grid gap-3 sm:grid-cols-3" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="card flex items-center gap-3.5 p-4 sm:col-span-1">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              totalDue > 0 ? "bg-terminal/10 text-terminal" : "bg-cell/10 text-cell"
            }`}
          >
            <Icon name="banknote" className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-lead">Total to collect</span>
            <span className="block whitespace-nowrap font-display text-3xl font-semibold leading-none tabular-nums">
              {formatRs(totalDue)}
            </span>
          </span>
        </div>
        <div className="card flex items-center gap-3.5 p-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sun/25 text-amber-800">
            <Icon name="receipt" className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-lead">Udhaar bills</span>
            <span className="block font-display text-3xl font-semibold leading-none tabular-nums">{dueBills.length}</span>
          </span>
        </div>
        <div className="card flex items-center gap-3.5 p-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-focus/10 text-focus">
            <Icon name="users" className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-lead">Customers who owe</span>
            <span className="block font-display text-3xl font-semibold leading-none tabular-nums">{customerCount}</span>
          </span>
        </div>
      </section>

      {dueBills.length === 0 ? (
        <section className="card anim-rise mt-6 px-6 py-12 text-center">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-cell/10 text-cell">
            <Icon name="check" className="h-7 w-7" strokeWidth={2.2} />
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold">No udhaar</h2>
          <p className="mx-auto mt-1 max-w-sm text-lead">Every bill is paid. Udhaar bills will show here.</p>
          {canAdd && (
            <button type="button" onClick={() => setAdding(true)} className="btn btn-quiet mt-4">
              Add udhaar by hand
            </button>
          )}
        </section>
      ) : (
        <>
          <div className="anim-rise mt-5 flex flex-col gap-3 sm:flex-row sm:items-center" style={{ "--i": 2 } as React.CSSProperties}>
            <label className="relative block w-full sm:max-w-md">
              <span className="sr-only">Search udhaar</span>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customer, phone or bill number"
                className="input pl-11"
                autoComplete="off"
              />
            </label>
            <div role="group" aria-label="Sort udhaar" className="flex gap-2">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={sort === s.value}
                  onClick={() => setSort(s.value)}
                  className={`min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors ${
                    sort === s.value ? "bg-casing text-white" : "border border-line bg-white text-casing hover:bg-plate"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-3 text-sm text-lead" aria-live="polite">
            {groups.length} {groups.length === 1 ? "customer" : "customers"} · {shownBills}{" "}
            {shownBills === 1 ? "bill" : "bills"} ·{" "}
            <span className="font-semibold text-terminal-deep">{formatRs(shownDue)} to collect</span>
          </p>

          {groups.length === 0 ? (
            <div className="card mt-4 px-6 py-10 text-center">
              <p className="font-display text-2xl font-semibold">Nothing matches</p>
              <p className="mt-1 text-lead">Check the spelling, or clear the search.</p>
              <button type="button" className="btn btn-quiet mt-4" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {groups.map((g) => (
                <li key={g.key} className="card overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-line/60 bg-plate/50 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      {g.customerId ? (
                        <Link href={`/customers/${g.customerId}`} className="block truncate font-semibold text-focus hover:underline">
                          {g.name}
                        </Link>
                      ) : (
                        <span className="block truncate font-semibold">{g.name}</span>
                      )}
                      <span className="block truncate text-sm text-lead">
                        {g.bills.length} {g.bills.length === 1 ? "bill" : "bills"} · oldest {ageLabel(g.oldest)}
                        {g.phone ? ` · ${g.phone}` : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xs text-lead">Total due</span>
                      <span className="block font-display text-2xl font-semibold leading-none tabular-nums text-terminal-deep">
                        {formatRs(g.due)}
                      </span>
                    </span>
                  </div>
                  <ul className="divide-y divide-line/60">
                    {g.bills.map((b) => {
                      const body = (
                        <>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">
                              {b.pending ? "Pending sync" : b.invoice_number}
                            </span>
                            <span className="block text-sm text-lead">
                              {formatDay(b.invoice_date)} · {ageLabel(b.invoice_date)}
                            </span>
                            <span className="mt-1 block">
                              <PayBadge status={b.payment_status} bill={b.status} />
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block text-sm text-lead tabular-nums">
                              Bill {formatRs(b.total_value)}
                              {b.paid_total > 0 ? ` · Paid ${formatRs(b.paid_total)}` : ""}
                            </span>
                            <span className="block font-semibold tabular-nums text-terminal-deep">{formatRs(b.due_total)} due</span>
                          </span>
                          {!b.pending && <Icon name="chevron" className="h-4 w-4 text-lead/60" />}
                        </>
                      );
                      return (
                        <li key={b.id}>
                          {b.pending ? (
                            <div className="flex items-center gap-3 px-4 py-3 opacity-80">{body}</div>
                          ) : (
                            <Link href={`/sales/${b.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-plate/60">
                              {body}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {adding && (
        <AddUdhaarForm
          customers={customers}
          onClose={() => setAdding(false)}
          onSaved={(m) => {
            setAdding(false);
            setToast(m);
            router.refresh();
          }}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}
