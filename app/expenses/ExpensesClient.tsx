"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ExpenseForm from "@/components/ExpenseForm";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Toast from "@/components/Toast";
import { categoryBreakdown, categorySummaryLabel, expenseMatches, friendlyExpenseError } from "@/lib/expenses";
import { formatRs } from "@/lib/format";
import { formatDay, todayKarachi } from "@/lib/invoices";
import { supplierMethodLabel } from "@/lib/purchases";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { ExpenseCategory, ExpenseDetails } from "@/lib/types";

type Period = "month" | "all";

function monthOf(ymd: string): string {
  return ymd.slice(0, 7); // YYYY-MM
}

export default function ExpensesClient({
  expenses: serverExpenses,
  categories,
}: {
  expenses: ExpenseDetails[];
  categories: ExpenseCategory[];
}) {
  const router = useRouter();
  const wantsAdd = useSearchParams().get("add") === "1";

  const [expenses, setExpenses] = useState(serverExpenses);
  useEffect(() => setExpenses(serverExpenses), [serverExpenses]);

  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [categoryId, setCategoryId] = useState<string | "all">("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDetails | null>(null);

  const [target, setTarget] = useState<ExpenseDetails | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  // Links to /expenses?add=1 (the "+" quick action, More menu) open the Add panel, then tidy the URL.
  useEffect(() => {
    if (!wantsAdd) return;
    setEditing(null);
    setFormOpen(true);
    window.history.replaceState(null, "", "/expenses");
  }, [wantsAdd]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(e: ExpenseDetails) {
    if (e.status === "Cancelled") return;
    setEditing(e);
    setFormOpen(true);
  }
  function onSaved(message: string) {
    closeForm();
    setToast(message);
    router.refresh();
  }

  function askCancel(e: ExpenseDetails) {
    setReason("");
    setCancelError(null);
    setTarget(e);
  }

  async function confirmCancel() {
    if (!target || busy) return;
    if (!reason.trim()) {
      setCancelError("Say why this expense is being cancelled -- it's kept with the expense for the record.");
      return;
    }
    setBusy(true);
    setCancelError(null);

    const online = await checkRealConnectivity();
    if (!online) {
      setCancelError("Cancelling an expense needs a connection. Try again once you're back online.");
      setBusy(false);
      return;
    }

    try {
      const supabase = await getBrowserClient();
      const { error } = await supabase.rpc("cancel_expense", { p_expense_id: target.id, p_reason: reason.trim() });
      if (error) {
        setCancelError(friendlyExpenseError(error));
        setBusy(false);
        return;
      }
      setToast(`${target.expense_number} cancelled.`);
      setTarget(null);
      setBusy(false);
      router.refresh();
    } catch {
      setCancelError("The connection dropped. Refresh this page to see if it was cancelled before you try again.");
      setBusy(false);
    }
  }

  const thisMonth = monthOf(todayKarachi());
  const inPeriod = useMemo(
    () => (period === "all" ? expenses : expenses.filter((e) => monthOf(e.expense_date) === thisMonth)),
    [expenses, period, thisMonth]
  );

  const validInPeriod = useMemo(() => inPeriod.filter((e) => e.status === "Valid"), [inPeriod]);
  const breakdown = useMemo(() => categoryBreakdown(validInPeriod), [validInPeriod]);

  const byCategory = useMemo(
    () => (categoryId === "all" ? inPeriod : inPeriod.filter((e) => e.category_id === categoryId)),
    [inPeriod, categoryId]
  );
  const shown = useMemo(() => byCategory.filter((e) => expenseMatches(e, query)), [byCategory, query]);

  const totalShown = shown.filter((e) => e.status === "Valid").reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle={expenses.length === 0 ? "Rent, salaries, fuel, and every other business cost will appear here." : `${expenses.length} expenses recorded`}
        action={
          <button type="button" onClick={openAdd} className="btn btn-primary">
            <Icon name="minus" className="h-5 w-5" /> Add expense
          </button>
        }
      />

      <div className="anim-rise mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Time period" className="inline-flex rounded-full bg-plate p-1">
            {(
              [
                { value: "month", label: "This month" },
                { value: "all", label: "All time" },
              ] as const
            ).map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={period === p.value}
                onClick={() => setPeriod(p.value)}
                className={`min-h-9 rounded-full px-4 text-[15px] font-semibold transition-all ${
                  period === p.value ? "bg-white text-casing shadow-card" : "text-lead hover:text-casing"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:max-w-xs">
            <label htmlFor="expenses-search" className="sr-only">
              Search
            </label>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
            <input
              id="expenses-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search category, paid to, reference"
              className="input pl-11"
            />
          </div>
        </div>

        {breakdown.length > 0 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              aria-pressed={categoryId === "all"}
              className={`shrink-0 rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                categoryId === "all" ? "border-casing bg-casing text-white shadow-sm" : "border-line bg-white text-lead hover:border-lead/40 hover:text-casing"
              }`}
            >
              All · {formatRs(validInPeriod.reduce((s, e) => s + e.amount, 0))}
            </button>
            {breakdown.map((c) => (
              <button
                key={c.category_id}
                type="button"
                onClick={() => setCategoryId(c.category_id)}
                aria-pressed={categoryId === c.category_id}
                title={categorySummaryLabel(c)}
                className={`shrink-0 rounded-full border px-4 py-2 text-[15px] font-medium tabular-nums transition-colors ${
                  categoryId === c.category_id
                    ? "border-casing bg-casing text-white shadow-sm"
                    : "border-line bg-white text-lead hover:border-lead/40 hover:text-casing"
                }`}
              >
                {c.name} · {formatRs(c.total)}
              </button>
            ))}
          </div>
        )}
      </div>

      {expenses.length === 0 ? (
        <section className="card anim-rise mt-6 px-6 py-12 text-center">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-terminal/10 text-terminal-deep">
            <Icon name="minus" className="h-7 w-7" />
          </span>
          <h2 className="mt-4 font-display text-3xl font-semibold">No expenses yet</h2>
          <p className="mx-auto mt-2 max-w-md text-lead">
            Rent, electricity, salaries, fuel -- log any business cost here, by category, so it's on record.
          </p>
          <button type="button" onClick={openAdd} className="btn btn-primary mt-6">
            Add first expense
          </button>
        </section>
      ) : shown.length === 0 ? (
        <div className="card mt-4 px-6 py-12 text-center">
          <p className="font-display text-2xl font-semibold">Nothing matches</p>
          <p className="mt-2 text-lead">Try a different search, category or time period.</p>
        </div>
      ) : (
        <>
          <dl className="anim-rise mt-4 grid grid-cols-1 gap-3 sm:max-w-xs">
            <div className="card p-3.5">
              <dt className="text-xs text-lead sm:text-sm">Total shown</dt>
              <dd className="font-display text-xl font-semibold tabular-nums text-terminal-deep sm:text-2xl">{formatRs(totalShown)}</dd>
            </div>
          </dl>

          <div className="card anim-rise mt-4 hidden overflow-hidden md:block">
            <table className="w-full text-left text-[15px]">
              <thead className="border-b border-line bg-plate/60 text-xs uppercase tracking-[0.1em] text-lead">
                <tr>
                  <th className="px-5 py-3 font-medium">Expense</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium">Paid to</th>
                  <th className="px-3 py-3 font-medium">Method</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                  <th className="px-3 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {shown.map((e) => (
                  <tr key={e.id} className={`transition-colors hover:bg-plate/50 ${e.status === "Cancelled" ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3.5 font-semibold">
                      <button type="button" onClick={() => openEdit(e)} disabled={e.status === "Cancelled"} className="text-left enabled:hover:text-focus enabled:hover:underline disabled:cursor-default">
                        {e.expense_number}
                      </button>
                    </td>
                    <td className="px-3 py-3.5 tabular-nums text-lead">{formatDay(e.expense_date)}</td>
                    <td className="px-3 py-3.5 font-medium">{e.category_name}</td>
                    <td className="max-w-[12rem] truncate px-3 py-3.5 text-lead">{e.paid_to || "-"}</td>
                    <td className="px-3 py-3.5 text-lead">{supplierMethodLabel(e.method)}</td>
                    <td className="px-3 py-3.5 text-right font-semibold tabular-nums">{formatRs(e.amount)}</td>
                    <td className="px-3 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {e.status === "Cancelled" ? (
                          <span className="text-sm text-lead">Cancelled</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(e)}
                              aria-label={`Edit ${e.expense_number}`}
                              title="Edit"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-plate"
                            >
                              <Icon name="edit" className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => askCancel(e)}
                              aria-label={`Cancel ${e.expense_number}`}
                              title="Cancel expense"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-terminal/10 hover:text-terminal-deep"
                            >
                              <Icon name="x" className="h-5 w-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 space-y-2.5 md:hidden">
            {shown.map((e) => (
              <li key={e.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(e)}
                  disabled={e.status === "Cancelled"}
                  className={`card flex min-w-0 flex-1 items-center gap-3 p-4 text-left ${e.status === "Cancelled" ? "opacity-60" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="truncate font-semibold">{e.category_name}</span>
                    <span className="mt-0.5 block text-sm text-lead">
                      {e.expense_number} · {formatDay(e.expense_date)}
                    </span>
                    <span className="mt-0.5 block text-sm text-lead">
                      {e.paid_to || supplierMethodLabel(e.method)}
                      {e.status === "Cancelled" ? " · Cancelled" : ""}
                    </span>
                  </span>
                  <span className="font-display text-2xl font-semibold leading-none tabular-nums">{formatRs(e.amount)}</span>
                </button>
                {e.status !== "Cancelled" && (
                  <button
                    type="button"
                    onClick={() => askCancel(e)}
                    aria-label={`Cancel ${e.expense_number}`}
                    className="card inline-flex w-12 shrink-0 items-center justify-center text-lead hover:bg-terminal/10 hover:text-terminal-deep"
                  >
                    <Icon name="x" className="h-5 w-5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {expenses.length >= 1000 && <p className="mt-3 text-sm text-lead">Showing the latest 1,000 expenses.</p>}
        </>
      )}

      {formOpen && <ExpenseForm expense={editing} categories={categories} onClose={closeForm} onSaved={onSaved} />}

      {target && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="cancel-expense-title" className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="cancel-expense-title" className="font-display text-2xl font-bold">
              Cancel {target.expense_number}?
            </h2>
            <p className="mt-2 text-lead">
              This marks the {formatRs(target.amount)} {target.category_name.toLowerCase()} expense cancelled. It stops counting toward
              any total. It cannot be undone.
            </p>
            <label htmlFor="cancel-expense-reason" className="mt-4 block text-sm font-medium">
              Reason
            </label>
            <input
              id="cancel-expense-reason"
              type="text"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Entered twice by mistake"
              className="input mt-1.5"
            />
            {cancelError && (
              <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
                {cancelError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className="btn btn-quiet">
                Keep it
              </button>
              <button type="button" onClick={confirmCancel} disabled={busy} className="btn btn-danger">
                {busy ? "Cancelling" : "Cancel expense"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
