"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { activeCategoriesSorted, friendlyExpenseError, validateExpense } from "@/lib/expenses";
import { focusFirstError } from "@/lib/formFocus";
import { parseAmount, todayKarachi } from "@/lib/invoices";
import { SUPPLIER_PAYMENT_METHODS } from "@/lib/purchases";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { ExpenseCategory, ExpenseDetails, SupplierPaymentMethod } from "@/lib/types";

export default function ExpenseForm({
  expense,
  categories,
  onClose,
  onSaved,
}: {
  /** null = adding a new expense. Set = editing an existing, not-yet-cancelled one. */
  expense: ExpenseDetails | null;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const clientId = useRef(crypto.randomUUID());
  const sorted = activeCategoriesSorted(categories);

  const [categoryId, setCategoryId] = useState<string | null>(expense?.category_id ?? null);
  const [amountText, setAmountText] = useState(expense ? String(expense.amount) : "");
  const [expenseDate, setExpenseDate] = useState(expense?.expense_date ?? todayKarachi());
  const [method, setMethod] = useState<SupplierPaymentMethod>(expense?.method ?? "cash");
  const [paidTo, setPaidTo] = useState(expense?.paid_to ?? "");
  const [reference, setReference] = useState(expense?.reference ?? "");
  const [chequeNumber, setChequeNumber] = useState(expense?.cheque_number ?? "");
  const [chequeDate, setChequeDate] = useState(expense?.cheque_date ?? todayKarachi());
  const [bankName, setBankName] = useState(expense?.bank_name ?? "");
  const [note, setNote] = useState(expense?.note ?? "");

  const [errors, setErrors] = useState<ReturnType<typeof validateExpense>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const showCheque = method === "cheque";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const errs = validateExpense({ categoryId, amountText, expenseDate, method, chequeNumber });
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setSaveError("Some fields need attention. They are marked in red.");
      focusFirstError();
      return;
    }

    setSaving(true);
    setSaveError(null);

    const online = await checkRealConnectivity();
    if (!online) {
      setSaveError(
        `${expense ? "Saving changes to" : "Recording"} an expense needs a connection right now. Try again once you're back online.`
      );
      setSaving(false);
      return;
    }

    try {
      const supabase = await getBrowserClient();
      const args = {
        p_category_id: categoryId,
        p_amount: parseAmount(amountText),
        p_expense_date: expenseDate,
        p_method: method,
        p_paid_to: paidTo.trim() || null,
        p_reference: reference.trim() || null,
        p_cheque_number: method === "cheque" ? chequeNumber.trim() || null : null,
        p_cheque_date: method === "cheque" ? chequeDate : null,
        p_bank_name: method === "cheque" ? bankName.trim() || null : null,
        p_note: note.trim() || null,
      };

      const { error } = expense
        ? await supabase.rpc("update_expense", { p_expense_id: expense.id, ...args })
        : await supabase.rpc("create_expense", { p_client_id: clientId.current, ...args });

      if (error) {
        setSaveError(friendlyExpenseError(error));
        setSaving(false);
        return;
      }
      onSaved(expense ? "Changes saved." : "Expense added.");
    } catch {
      setSaveError("The connection dropped partway through. Check Expenses before saving again, so it isn't recorded twice.");
      setSaving(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy="expense-form-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="expense-form-title" className="font-display text-2xl font-bold">
            {expense ? "Edit expense" : "Add expense"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead transition-colors hover:bg-plate disabled:opacity-60"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6">
          {/* Category */}
          <fieldset>
            <legend className="mb-3 font-display text-xl font-semibold">Category</legend>
            <div className="flex flex-wrap gap-2">
              {sorted.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCategoryId(c.id);
                    setErrors((prev) => ({ ...prev, category: undefined }));
                  }}
                  aria-pressed={categoryId === c.id}
                  className={`rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                    categoryId === c.id ? "border-casing bg-casing text-white" : "border-line bg-white text-lead hover:border-lead/40"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {errors.category && <p className="mt-1.5 text-sm text-terminal-deep">{errors.category}</p>}
          </fieldset>

          {/* Amount, date */}
          <fieldset className="space-y-4">
            <legend className="mb-3 font-display text-xl font-semibold">Amount</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ex-amount" className="mb-1.5 block text-sm font-medium">
                  Amount (Rs)
                </label>
                <input
                  id="ex-amount"
                  inputMode="decimal"
                  autoFocus
                  value={amountText}
                  onChange={(e) => {
                    setAmountText(e.target.value.replace(/[^\d.,]/g, ""));
                    setErrors((prev) => ({ ...prev, amount: undefined }));
                  }}
                  placeholder="0"
                  aria-invalid={errors.amount ? true : undefined}
                  className="input tabular-nums"
                />
                {errors.amount && <p className="mt-1 text-sm text-terminal-deep">{errors.amount}</p>}
              </div>
              <div>
                <label htmlFor="ex-date" className="mb-1.5 block text-sm font-medium">
                  Date
                </label>
                <input
                  id="ex-date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => {
                    setExpenseDate(e.target.value);
                    setErrors((prev) => ({ ...prev, expense_date: undefined }));
                  }}
                  max={todayKarachi()}
                  aria-invalid={errors.expense_date ? true : undefined}
                  className="input"
                />
                {errors.expense_date && <p className="mt-1 text-sm text-terminal-deep">{errors.expense_date}</p>}
              </div>
            </div>
          </fieldset>

          {/* Method */}
          <fieldset className="space-y-4">
            <legend className="mb-3 font-display text-xl font-semibold">Method</legend>
            <div className="flex flex-wrap gap-2">
              {SUPPLIER_PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  aria-pressed={method === m.value}
                  className={`rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                    method === m.value ? "border-casing bg-casing text-white" : "border-line bg-white text-lead hover:border-lead/40"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {showCheque && (
              <div className="grid grid-cols-1 gap-3 rounded-2xl bg-plate/60 p-3.5 sm:grid-cols-3">
                <div>
                  <label htmlFor="ex-cheque-number" className="mb-1.5 block text-sm font-medium">
                    Cheque number
                  </label>
                  <input
                    id="ex-cheque-number"
                    value={chequeNumber}
                    onChange={(e) => {
                      setChequeNumber(e.target.value);
                      setErrors((prev) => ({ ...prev, cheque_number: undefined }));
                    }}
                    aria-invalid={errors.cheque_number ? true : undefined}
                    className="input"
                  />
                  {errors.cheque_number && <p className="mt-1 text-xs text-terminal-deep">{errors.cheque_number}</p>}
                </div>
                <div>
                  <label htmlFor="ex-cheque-date" className="mb-1.5 block text-sm font-medium">
                    Cheque date
                  </label>
                  <input id="ex-cheque-date" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label htmlFor="ex-bank-name" className="mb-1.5 block text-sm font-medium">
                    Bank
                  </label>
                  <input id="ex-bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} className="input" />
                </div>
              </div>
            )}
          </fieldset>

          {/* Extra details */}
          <fieldset className="space-y-4">
            <legend className="mb-3 font-display text-xl font-semibold">Details (optional)</legend>
            <div>
              <label htmlFor="ex-paid-to" className="mb-1.5 block text-sm font-medium">
                Paid to
              </label>
              <input
                id="ex-paid-to"
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                placeholder="Landlord, employee name, petrol pump, etc."
                className="input"
              />
            </div>
            <div>
              <label htmlFor="ex-reference" className="mb-1.5 block text-sm font-medium">
                Reference
              </label>
              <input id="ex-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt no., transaction ID, etc." className="input" />
            </div>
            <div>
              <label htmlFor="ex-note" className="mb-1.5 block text-sm font-medium">
                Note
              </label>
              <textarea id="ex-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input resize-none" />
            </div>
          </fieldset>
        </div>

        <div className="pb-safe border-t border-line bg-white px-5 py-4">
          {saveError && (
            <p role="alert" className="mb-3 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="btn btn-quiet">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary min-w-36">
              {saving ? "Saving" : expense ? "Save changes" : "Save expense"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
