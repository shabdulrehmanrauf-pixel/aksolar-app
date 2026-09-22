"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { formatRs } from "@/lib/format";
import { formatDay, invoiceMatches } from "@/lib/invoices";
import type { Invoice } from "@/lib/types";
import PayBadge from "./PayBadge";

type Filter = "all" | "due" | "paid";

const TABS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "due", label: "Udhaar due" },
  { value: "paid", label: "Paid" },
];

export default function SalesClient({ invoices, initialFilter }: { invoices: Invoice[]; initialFilter: Filter }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(initialFilter);

  const shown = useMemo(
    () =>
      invoices.filter((inv) => {
        if (!invoiceMatches(inv, query)) return false;
        if (filter === "due") return inv.status !== "Cancelled" && inv.due_total > 0;
        if (filter === "paid") return inv.status !== "Cancelled" && inv.due_total <= 0;
        return true;
      }),
    [invoices, query, filter]
  );

  const totalShown = shown.filter((i) => i.status !== "Cancelled").reduce((s, i) => s + i.total_value, 0);
  const dueShown = shown.filter((i) => i.status !== "Cancelled").reduce((s, i) => s + i.due_total, 0);

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={invoices.length === 0 ? "Your bills will appear here." : `${invoices.length} bills saved`}
        action={
          <Link href="/sales/new" className="btn btn-primary">
            <Icon name="plus" className="h-5 w-5" /> New bill
          </Link>
        }
      />

      {invoices.length === 0 ? (
        <section className="card anim-rise mt-6 px-6 py-12 text-center">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-sun/25 text-amber-800">
            <Icon name="receipt" className="h-7 w-7" />
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold">No bills yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-lead">
            Make your first bill. Stock goes down and udhaar is tracked for you.
          </p>
          <Link href="/sales/new" className="btn btn-primary mt-5">
            Make first bill
          </Link>
        </section>
      ) : (
        <>
          <div className="anim-rise mt-5 flex flex-col gap-3 sm:flex-row sm:items-center" style={{ "--i": 1 } as React.CSSProperties}>
            <label className="relative block w-full sm:max-w-md">
              <span className="sr-only">Search bills</span>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customer, bill number or date"
                className="input pl-11"
                autoComplete="off"
              />
            </label>
            <div role="group" aria-label="Filter bills" className="flex gap-2">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={filter === t.value}
                  onClick={() => setFilter(t.value)}
                  className={`min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors ${
                    filter === t.value ? "bg-casing text-white" : "border border-line bg-white text-casing hover:bg-plate"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-3 text-sm text-lead" aria-live="polite">
            {shown.length} {shown.length === 1 ? "bill" : "bills"} · {formatRs(totalShown)}
            {dueShown > 0 && <span className="font-semibold text-terminal-deep"> · {formatRs(dueShown)} still due</span>}
          </p>

          {shown.length === 0 ? (
            <div className="card mt-4 px-6 py-10 text-center">
              <p className="font-display text-2xl font-semibold">No bills match</p>
              <p className="mt-1 text-lead">Check the spelling, or clear the search.</p>
              <button
                type="button"
                className="btn btn-quiet mt-4"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="card mt-4 hidden overflow-hidden md:block">
                <table className="w-full text-left">
                  <thead className="bg-plate/70 text-sm text-lead">
                    <tr>
                      <th className="px-5 py-3 font-medium">Bill</th>
                      <th className="px-3 py-3 font-medium">Date</th>
                      <th className="px-3 py-3 font-medium">Customer</th>
                      <th className="px-3 py-3 text-right font-medium">Total</th>
                      <th className="px-3 py-3 text-right font-medium">Due</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {shown.map((inv) => (
                      <tr key={inv.id} className="transition-colors hover:bg-plate/50">
                        <td className="px-5 py-3.5">
                          <Link href={`/sales/${inv.id}`} className="font-semibold text-focus hover:underline">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="px-3 py-3.5 tabular-nums text-lead">{formatDay(inv.invoice_date)}</td>
                        <td className="max-w-[16rem] truncate px-3 py-3.5 font-medium">{inv.buyer_name}</td>
                        <td className="px-3 py-3.5 text-right font-semibold tabular-nums">{formatRs(inv.total_value)}</td>
                        <td
                          className={`px-3 py-3.5 text-right tabular-nums ${
                            inv.status !== "Cancelled" && inv.due_total > 0 ? "font-semibold text-terminal-deep" : "text-lead"
                          }`}
                        >
                          {inv.status !== "Cancelled" && inv.due_total > 0 ? formatRs(inv.due_total) : "-"}
                        </td>
                        <td className="px-5 py-3.5">
                          <PayBadge status={inv.payment_status} bill={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone cards */}
              <ul className="mt-4 space-y-2.5 md:hidden">
                {shown.map((inv) => (
                  <li key={inv.id}>
                    <Link href={`/sales/${inv.id}`} className="card card-hover flex items-center gap-3 p-4">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold">{inv.buyer_name}</span>
                        </span>
                        <span className="mt-0.5 block text-sm text-lead">
                          {inv.invoice_number} · {formatDay(inv.invoice_date)}
                        </span>
                        <span className="mt-1.5 block">
                          <PayBadge status={inv.payment_status} bill={inv.status} />
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display text-2xl font-semibold leading-none tabular-nums">
                          {formatRs(inv.total_value)}
                        </span>
                        {inv.status !== "Cancelled" && inv.due_total > 0 && (
                          <span className="mt-1 block text-sm font-semibold tabular-nums text-terminal-deep">
                            {formatRs(inv.due_total)} due
                          </span>
                        )}
                      </span>
                      <Icon name="chevron" className="h-4 w-4 text-lead/60" />
                    </Link>
                  </li>
                ))}
              </ul>
              {invoices.length >= 1000 && (
                <p className="mt-3 text-sm text-lead">Showing the latest 1,000 bills.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
