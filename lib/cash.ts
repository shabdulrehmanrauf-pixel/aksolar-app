/**
 * Cash book + accounts (20_cash_ledger.sql). Types, labels and small helpers.
 * All money figures come from the database; nothing here adds up money by itself.
 */

export type CashAccountKind = "cash" | "bank" | "easypaisa" | "jazzcash";

export const ACCOUNT_KINDS: { value: CashAccountKind; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "easypaisa", label: "EasyPaisa" },
  { value: "jazzcash", label: "JazzCash" },
];

export function kindLabel(k: CashAccountKind): string {
  return ACCOUNT_KINDS.find((x) => x.value === k)?.label ?? k;
}

/** Every payment method the shop uses anywhere (customer + supplier + expense). */
export const ALL_METHODS: { value: string; label: string; hint: string }[] = [
  { value: "cash", label: "Cash", hint: "Cash sales, cash expenses, cash paid to suppliers" },
  { value: "other", label: "Other (customer payments)", hint: "A customer payment marked \"other\". Point this to EasyPaisa or JazzCash if customers usually pay that way." },
  { value: "bank", label: "Bank (customer payments)", hint: "A customer paying by bank transfer" },
  { value: "cheque", label: "Cheque", hint: "Cheques you write" },
  { value: "online", label: "Online transfer", hint: "Online transfers you make" },
  { value: "easypaisa", label: "EasyPaisa", hint: "EasyPaisa payments in and out" },
  { value: "jazzcash", label: "JazzCash", hint: "JazzCash payments in and out" },
];

export function methodLabel(m: string | null | undefined): string {
  if (!m) return "";
  return ALL_METHODS.find((x) => x.value === m)?.label.replace(" (customer payments)", "") ?? m;
}

/** Which kind of account a payment method can use. Mirrors _cash_kind_for_method in the database.
 *  null = no restriction ("other" customer payments may go to any account, e.g. EasyPaisa). */
export function kindForMethod(method: string): CashAccountKind | null {
  switch (method) {
    case "cash":
      return "cash";
    case "bank":
    case "cheque":
    case "online":
      return "bank";
    case "easypaisa":
      return "easypaisa";
    case "jazzcash":
      return "jazzcash";
    default:
      return null;
  }
}

/** From `cash_account_choices()` - no balances, safe for Owner and Accountant. */
export type CashAccountChoice = {
  id: string;
  name: string;
  kind: CashAccountKind;
  default_for: string[];
};

/** One account from `cash_accounts_overview()` (Owner only). */
export type CashAccount = CashAccountChoice & {
  account_number: string | null;
  opening_balance: number;
  opening_date: string;
  is_active: boolean;
  sort_order: number;
  balance: number;
  day_in: number;
  day_out: number;
};

export type CashOverview = { day: string; accounts: CashAccount[] };

export type CashSource =
  | "sale_payment"
  | "scrap_sale"
  | "charging"
  | "claim_charge"
  | "supplier_payment"
  | "expense"
  | "cash_in"
  | "transfer_out"
  | "transfer_in";

export type CashBookEntry = {
  key: string;
  entry_date: string;
  happened_at: string;
  direction: "in" | "out";
  amount: number;
  source: CashSource;
  source_table: string;
  source_id: string;
  label: string;
  party: string | null;
  method: string | null;
  note: string | null;
  account_id: string;
  account_name: string;
  account_kind: CashAccountKind;
  by_name: string;
  movable: boolean;
  cancellable: boolean;
};

export type CashClose = {
  account_id: string;
  close_date: string;
  expected: number;
  counted: number;
  difference: number;
  note: string | null;
};

export type CashBook = {
  from: string;
  to: string;
  account_id: string | null;
  opening: number;
  total_in: number;
  total_out: number;
  closing: number;
  entries: CashBookEntry[];
  closes: CashClose[];
};

export const SOURCE_LABEL: Record<CashSource, string> = {
  sale_payment: "Sale payment",
  scrap_sale: "Scrap sale",
  charging: "Charging",
  claim_charge: "Claim charges",
  supplier_payment: "Supplier",
  expense: "Expense",
  cash_in: "Cash added",
  transfer_out: "Transfer",
  transfer_in: "Transfer",
};

export function isTransfer(s: CashSource): boolean {
  return s === "transfer_in" || s === "transfer_out";
}

export type DbError = { code?: string; message: string };

export function friendlyCashError(error: DbError): string {
  if (error.code === "42883" || error.code === "PGRST202" || error.code === "42P01") {
    return "The cash book setup is missing. Run 20_cash_ledger.sql in Supabase, then try again.";
  }
  if (error.code === "42501") return "Only the Owner can do this.";
  return error.message;
}

/** Accounts a payment of this method may use. "other" (customer payments) may use any account. */
export function accountsAllowedFor<T extends { kind: CashAccountKind }>(accounts: T[], method: string): T[] {
  if (method === "other") return accounts;
  const kind = kindForMethod(method);
  return kind ? accounts.filter((a) => a.kind === kind) : [];
}

export function accountsForMethod<T extends CashAccountChoice>(choices: T[], method: string): T[] {
  return accountsAllowedFor(choices, method);
}
