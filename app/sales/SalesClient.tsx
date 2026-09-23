"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { formatRs } from "@/lib/format";
import { formatDay, friendlyInvoiceError, invoiceMatches } from "@/lib/invoices";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { Invoice } from "@/lib/types";
import Toast from "@/components/Toast";
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
  const router = useRouter();
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [target, setTarget] = useState<Invoice | null>(null);
  const [restock, setRestock] = useState(true);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function askDelete(inv: Invoice) {
    setRestock(true);
    setDelError(null);
    setTarget(inv);
  }

  async function confirmDelete() {
    if (!target || delBusy) return;
    setDelBusy(true);
    setDelError(null);
    try {
      const supabase = await getBrowserClient();
      const { error: dbError } = await supabase.rpc("delete_invoice", { p_invoice_id: target.id, p_restock: restock });
      if (dbError) {
        setDelError(
          dbError.code === "42883" || dbError.code === "PGRST202"
            ? "The delete setup is missing. Run 06_delete_invoice.sql in Supabase, then try again."
            : friendlyInvoiceError(dbError)
        );
        setDelBusy(false);
        return;
      }
      setDeletedIds((ids) => [...ids, target.id]);
      setToast(`${target.invoice_number} deleted.`);
      setTarget(null);
      setDelBusy(false);
      router.refresh();
    } catch {
      setDelError("The connection dropped. Refresh this page to see if the bill was deleted before you try again.");
      setDelBusy(false);
    }
  }

  const visible = useMemo(() => invoices.filter((i) => !deletedIds.includes(i.id)), [invoices, deletedIds]);

  const shown = useMemo(
    () =>
      visible.filter((inv) => {
        if (!invoiceMatches(inv, query)) return false;
        if (filter === "due") return inv.status !== "Cancelled" && inv.due_total > 0;
        if (filter === "paid") return inv.status !== "Cancelled" && inv.due_total <= 0;
        return true;
      }),
    [visible, query, filter]
  );

  const totalShown = shown.filter((i) => i.status !== "Cancelled").reduce((s, i) => s + i.total_value, 0);
  const dueShown = shown.filter((i) => i.status !== "Cancelled").reduce((s, i) => s + i.due_total, 0);

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={visible.length === 0 ? "Your bills will appear here." : `${visible.length} bills saved`}
        action={
          <Link href="/sales/new" className="btn btn-primary">
            <Icon name="plus" className="h-5 w-5" /> New bill
          </Link>
        }
      />

      {visible.length === 0 ? (
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
                      <th className="px-3 py-3 text-right font-medium">
                        <span className="sr-only">Delete</span>
                      </th>
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
                        <td className="px-3 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => askDelete(inv)}
                            aria-label={`Delete bill ${inv.invoice_number}`}
                            title="Delete bill"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-terminal/10 hover:text-terminal-deep"
                          >
                            <Icon name="trash" className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone cards */}
              <ul className="mt-4 space-y-2.5 md:hidden">
                {shown.map((inv) => (
                  <li key={inv.id} className="flex items-stretch gap-2">
                    <Link href={`/sales/${inv.id}`} className="card card-hover flex min-w-0 flex-1 items-center gap-3 p-4">
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
                    <button
                      type="button"
                      onClick={() => askDelete(inv)}
                      aria-label={`Delete bill ${inv.invoice_number}`}
                      className="card inline-flex w-12 shrink-0 items-center justify-center text-lead hover:bg-terminal/10 hover:text-terminal-deep"
                    >
                      <Icon name="trash" className="h-5 w-5" />
                    </button>
                  </li>
                ))}
              </ul>
              {visible.length >= 1000 && (
                <p className="mt-3 text-sm text-lead">Showing the latest 1,000 bills.</p>
              )}
            </>
          )}
        </>
      )}

      {target && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-title"
            aria-describedby="del-text"
            className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <h2 id="del-title" className="font-display text-2xl font-bold">
              Delete {target.invoice_number}?
            </h2>
            <p id="del-text" className="mt-2 text-lead">
              This permanently deletes the bill for {target.buyer_name} ({formatRs(target.total_value)}) with all its
              items and payments. It cannot be undone.
            </p>
            <label className="mt-4 flex items-start gap-3 rounded-xl bg-plate/70 px-3 py-3 text-[15px]">
              <input
                type="checkbox"
                checked={restock}
                onChange={(e) => setRestock(e.target.checked)}
                disabled={delBusy}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="block font-semibold">Put the items back in stock</span>
                <span className="block text-lead">Turn this off only if the goods really left the shop.</span>
              </span>
            </label>
            {delError && (
              <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
                {delError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setTarget(null)} disabled={delBusy} autoFocus className="btn btn-quiet">
                Keep it
              </button>
              <button type="button" onClick={confirmDelete} disabled={delBusy} className="btn btn-danger">
                {delBusy ? "Deleting" : "Delete bill"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
