import type { ExpenseCategory, ExpenseDetails, SupplierPaymentMethod } from "./types";
import { formatDay, parseAmount, todayKarachi } from "./invoices";
import { formatRs } from "./format";

/* Payment methods are shared with F2's supplier payments (decision D2) -- see
 * SUPPLIER_PAYMENT_METHODS / supplierMethodLabel in lib/purchases.ts. Nothing new needed here. */

/* ---------- Validation ---------- */

export type ExpenseFormErrors = {
  category?: string;
  amount?: string;
  expense_date?: string;
  cheque_number?: string;
};

export function validateExpense(f: {
  categoryId: string | null;
  amountText: string;
  expenseDate: string;
  method: SupplierPaymentMethod;
  chequeNumber: string;
}): ExpenseFormErrors {
  const e: ExpenseFormErrors = {};

  if (!f.categoryId) e.category = "Choose a category.";

  const amount = parseAmount(f.amountText);
  if (amount == null || amount <= 0) {
    e.amount = "Enter an amount greater than zero, with up to 2 decimals.";
  }

  if (!f.expenseDate) e.expense_date = "Choose a date.";
  else if (f.expenseDate > todayKarachi()) e.expense_date = "The expense date cannot be in the future.";

  if (f.method === "cheque" && !f.chequeNumber.trim()) {
    e.cheque_number = "Enter the cheque number.";
  }

  return e;
}

/* ---------- Search ---------- */

/** Matches the expense number, category, who it was paid to, reference/cheque number, note and date. */
export function expenseMatches(
  e: Pick<ExpenseDetails, "expense_number" | "category_name" | "paid_to" | "reference" | "cheque_number" | "note" | "expense_date">,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    e.expense_number,
    e.category_name,
    e.paid_to ?? "",
    e.reference ?? "",
    e.cheque_number ?? "",
    e.note ?? "",
    e.expense_date,
    formatDay(e.expense_date),
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/* ---------- Category breakdown (Expenses screen) ---------- */

export type CategoryTotal = {
  category_id: string;
  name: string;
  total: number;
  count: number;
};

/** Totals for the currently-shown (already filtered/searched) valid expenses, one row per category
 * that has at least one, sorted highest spend first. Cancelled expenses are excluded by the caller
 * before this runs (same rule the ledger/balances views use elsewhere: only status = 'Valid' counts). */
export function categoryBreakdown(expenses: Pick<ExpenseDetails, "category_id" | "category_name" | "amount">[]): CategoryTotal[] {
  const byId = new Map<string, CategoryTotal>();
  for (const e of expenses) {
    const existing = byId.get(e.category_id);
    if (existing) {
      existing.total += e.amount;
      existing.count += 1;
    } else {
      byId.set(e.category_id, { category_id: e.category_id, name: e.category_name, total: e.amount, count: 1 });
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.total - a.total);
}

/** Sorted for pickers/pill lists: seeded order (sort_order), active categories only. */
export function activeCategoriesSorted(categories: ExpenseCategory[]): ExpenseCategory[] {
  return categories.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order);
}

/** "Rs 12,000 across 4 expenses" -- used under a category chip / summary card. */
export function categorySummaryLabel(t: Pick<CategoryTotal, "total" | "count">): string {
  return `${formatRs(t.total)} across ${t.count} ${t.count === 1 ? "expense" : "expenses"}`;
}

/* ---------- Friendly database errors ---------- */

type DbError = { code?: string; message: string };

/** Turns a Supabase error into a sentence that says what happened and what to do. Messages the
 * database already writes in plain English (cheque number missing, bad category) pass through. */
export function friendlyExpenseError(error: DbError): string {
  if (error.code === "42883" || error.code === "PGRST202") {
    return "The expenses setup is missing. Run 14_expenses.sql in Supabase, then try again.";
  }
  if (error.code === "42P01") {
    return "The expenses table is missing. Run 14_expenses.sql in Supabase, then try again.";
  }
  return error.message;
}
