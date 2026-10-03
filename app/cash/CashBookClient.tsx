"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Sheet from "@/components/Sheet";
import Toast from "@/components/Toast";
import {
  accountsAllowedFor,
  friendlyCashError,
  isTransfer,
  kindLabel,
  methodLabel,
  SOURCE_LABEL,
  type CashAccount,
  type CashBook,
  type CashBookEntry,
  type CashOverview,
} from "@/lib/cash";
import { formatRs } from "@/lib/format";
import { addDays, formatDay, formatTime, parseAmount } from "@/lib/invoices";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";

type SheetKind = null | "add" | "deposit" | "withdraw" | "transfer" | "close";

/** Runs one database call with the usual connection check; returns an error message or null. */
async function callDb(run: (supabase: Awaited<ReturnType<typeof getBrowserClient>>) => PromiseLike<{ error: { code?: string; message: string } | null }>): Promise<string | null> {
  const online = await checkRealConnectivity();
  if (!online) return "This needs a connection. Try again once you're back online.";
  try {
    const supabase = await getBrowserClient();
    const { error } = await run(supabase);
    return error ? friendlyCashError(error) : null;
  } catch {
    return "The connection dropped. Refresh the page to see whether it was saved before you try again.";
  }
}

export default function CashBookClient({
  day,
  today,
  accountId,
  book,
  overview,
}: {
  day: string;
  today: string;
  accountId: string | null;
  book: CashBook;
  overview: CashOverview;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<CashBookEntry | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CashBookEntry | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const activeAccounts = overview.accounts.filter((a) => a.is_active);
  const selected = accountId ? overview.accounts.find((a) => a.id === accountId) ?? null : null;

  function go(nextDay: string, nextAccount: string | null) {
    const q = new URLSearchParams();
    if (nextDay !== today) q.set("date", nextDay);
    if (nextAccount) q.set("account", nextAccount);
    const qs = q.toString();
    router.push(qs ? `/cash?${qs}` : "/cash");
  }

  function saved(message: string) {
    setSheet(null);
    setMoveTarget(null);
    setCancelTarget(null);
    setToast(message);
    router.refresh();
  }

  const totalBalance = overview.accounts.reduce((s, a) => s + a.balance, 0);
  const closesByAccount = new Map(book.closes.map((c) => [c.account_id, c]));
  const dayLabel = day === today ? "Today" : day === addDays(today, -1) ? "Yesterday" : formatDay(day);

  return (
    <div>
      <PageHeader
        title="Cash book"
        subtitle={`${dayLabel}${selected ? ` · ${selected.name}` : " · all accounts"}`}
        action={
          <Link href="/cash/accounts" className="btn btn-quiet">
            <Icon name="banknote" className="h-5 w-5" /> Accounts
          </Link>
        }
      />

      {/* Date */}
      <div className="anim-rise mt-6 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Day" className="inline-flex rounded-full bg-plate p-1">
          {[
            { label: "Today", value: today },
            { label: "Yesterday", value: addDays(today, -1) },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              role="radio"
              aria-checked={day === p.value}
              onClick={() => go(p.value, accountId)}
              className={`min-h-9 rounded-full px-4 text-[15px] font-semibold transition-all ${
                day === p.value ? "bg-white text-casing shadow-card" : "text-lead hover:text-casing"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(addDays(day, -1), accountId)} aria-label="Previous day" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-plate text-casing">
            <Icon name="back" className="h-5 w-5" />
          </button>
          <label htmlFor="cash-date" className="sr-only">
            Pick a date
          </label>
          <input
            id="cash-date"
            type="date"
            value={day}
            max={today}
            onChange={(e) => e.target.value && go(e.target.value, accountId)}
            className="input w-auto"
          />
          <button
            type="button"
            onClick={() => go(addDays(day, 1), accountId)}
            disabled={day >= today}
            aria-label="Next day"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-plate text-casing disabled:opacity-40"
          >
            <Icon name="chevron" className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Accounts */}
      <div className="no-scrollbar -mx-4 mt-5 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => go(day, null)}
          aria-pressed={!accountId}
          className={`card w-48 shrink-0 p-4 text-left transition-colors ${!accountId ? "border-casing ring-1 ring-casing" : ""}`}
        >
          <p className="text-sm text-lead">All accounts</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{formatRs(totalBalance)}</p>
          <p className="mt-1 text-xs text-lead">at end of {dayLabel.toLowerCase()}</p>
        </button>
        {activeAccounts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => go(day, a.id)}
            aria-pressed={accountId === a.id}
            className={`card w-48 shrink-0 p-4 text-left transition-colors ${accountId === a.id ? "border-casing ring-1 ring-casing" : ""}`}
          >
            <p className="text-sm text-lead">
              {a.name} <span className="text-xs">· {kindLabel(a.kind)}</span>
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{formatRs(a.balance)}</p>
            <p className="mt-1 text-xs text-lead">
              <span className="text-cell-deep">+{formatRs(a.day_in)}</span> · <span className="text-terminal-deep">−{formatRs(a.day_out)}</span>
            </p>
          </button>
        ))}
      </div>

      {/* Day summary */}
      <section className="card anim-rise mt-5 p-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Opening" value={formatRs(book.opening)} />
          <Stat label="Money in" value={`+${formatRs(book.total_in)}`} tone="text-cell-deep" />
          <Stat label="Money out" value={`−${formatRs(book.total_out)}`} tone="text-terminal-deep" />
          <Stat label="Closing" value={formatRs(book.closing)} strong />
        </dl>
        {!accountId && <p className="mt-3 text-sm text-lead">Moves between your own accounts (like a bank deposit) are not counted as money in or out here.</p>}
      </section>

      {/* Actions */}
      <div className="anim-rise mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => setSheet("add")}>
          <Icon name="plus" className="h-5 w-5" /> Add cash
        </button>
        <Link href="/expenses?add=1" className="btn btn-quiet">
          <Icon name="minus" className="h-5 w-5" /> Add expense
        </Link>
        <Link href="/payments/new" className="btn btn-quiet">
          <Icon name="truck" className="h-5 w-5" /> Pay supplier
        </Link>
        <button type="button" className="btn btn-quiet" onClick={() => setSheet("deposit")}>
          <Icon name="arrowup" className="h-5 w-5" /> Deposit to bank
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setSheet("withdraw")}>
          <Icon name="download" className="h-5 w-5" /> Withdraw from bank
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setSheet("transfer")}>
          <Icon name="swap" className="h-5 w-5" /> Move money
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setSheet("close")}>
          <Icon name="check" className="h-5 w-5" /> Close day
        </button>
      </div>

      {/* Day close results */}
      {book.closes.length > 0 && (
        <div className="anim-rise mt-4 space-y-2">
          {book.closes.map((c) => {
            const acc = overview.accounts.find((a) => a.id === c.account_id);
            const ok = Number(c.difference) === 0;
            return (
              <p key={c.account_id} className={`rounded-xl px-4 py-2.5 text-[15px] ${ok ? "bg-cell/10 text-cell-deep" : "bg-terminal/10 text-terminal-deep"}`}>
                {acc?.name ?? "Account"} counted at close: {formatRs(c.counted)} (book said {formatRs(c.expected)}) —{" "}
                {ok ? "matched." : c.difference < 0 ? `short by ${formatRs(Math.abs(c.difference))}.` : `extra ${formatRs(c.difference)}.`}
                {c.note ? ` ${c.note}` : ""}
              </p>
            );
          })}
        </div>
      )}

      {/* Entries */}
      <section className="anim-rise mt-5">
        <h2 className="font-display text-2xl font-semibold">Entries ({book.entries.length})</h2>
        {book.entries.length === 0 ? (
          <div className="card mt-3 p-6 text-lead">
            Nothing recorded for {dayLabel.toLowerCase()}. Sales payments, expenses and supplier payments appear here by themselves; use Add cash for money you put in.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {book.entries.map((e) => {
              const transfer = isTransfer(e.source);
              const incoming = e.direction === "in";
              return (
                <li key={e.key} className="card flex items-start gap-3 p-4">
                  <span
                    className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      transfer ? "bg-plate text-lead" : incoming ? "bg-cell/15 text-cell-deep" : "bg-terminal/10 text-terminal-deep"
                    }`}
                  >
                    <Icon name={transfer ? "swap" : incoming ? "arrowup" : "minus"} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{e.label}</p>
                    <p className="text-sm text-lead">
                      {e.party ? `${incoming ? "From" : "To"} ${e.party} · ` : ""}
                      {formatTime(e.happened_at)} · {e.account_name}
                      {e.method ? ` · ${methodLabel(e.method)}` : ""}
                      {e.by_name ? ` · by ${e.by_name}` : ""}
                    </p>
                    {e.note && <p className="mt-0.5 text-sm text-lead">{e.note}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
                      <span className="rounded-full bg-plate px-2.5 py-0.5 text-xs font-medium text-lead">{SOURCE_LABEL[e.source]}</span>
                      {e.movable && accountsAllowedFor(activeAccounts, e.source === "sale_payment" ? "other" : e.method ?? "").length > 1 && (
                        <button type="button" onClick={() => setMoveTarget(e)} className="font-medium text-focus underline-offset-2 hover:underline">
                          Change account
                        </button>
                      )}
                      {e.cancellable && (
                        <button type="button" onClick={() => setCancelTarget(e)} className="font-medium text-terminal-deep underline-offset-2 hover:underline">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  <p className={`shrink-0 font-display text-xl font-semibold tabular-nums ${transfer ? "text-lead" : incoming ? "text-cell-deep" : "text-terminal-deep"}`}>
                    {incoming ? "+" : "−"}
                    {formatRs(e.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sheet === "add" && <AddCashSheet accounts={activeAccounts} day={day} today={today} defaultAccountId={accountId} onClose={() => setSheet(null)} onSaved={saved} />}
      {(sheet === "deposit" || sheet === "withdraw" || sheet === "transfer") && (
        <TransferSheet mode={sheet} accounts={activeAccounts} day={day} today={today} onClose={() => setSheet(null)} onSaved={saved} />
      )}
      {sheet === "close" && <CloseDaySheet accounts={activeAccounts} day={day} closes={closesByAccount} defaultAccountId={accountId} onClose={() => setSheet(null)} onSaved={saved} />}
      {moveTarget && <MoveSheet entry={moveTarget} accounts={activeAccounts} onClose={() => setMoveTarget(null)} onSaved={saved} />}
      {cancelTarget && <CancelSheet entry={cancelTarget} onClose={() => setCancelTarget(null)} onSaved={saved} />}

      <Toast message={toast} />
    </div>
  );
}

function Stat({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-lead">{label}</dt>
      <dd className={`mt-0.5 font-display tabular-nums ${strong ? "text-3xl font-bold" : "text-2xl font-semibold"} ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

/* --------------------------------------------------------------------------------- shared sheet frame */

function FormSheet({
  title,
  titleId,
  submitLabel,
  saving,
  error,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  titleId: string;
  submitLabel: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet onClose={onClose} labelledBy={titleId} dismissable={!saving}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-display text-2xl font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead transition-colors hover:bg-plate disabled:opacity-60">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">{children}</div>
        <div className="pb-safe border-t border-line bg-white px-5 py-4">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="btn btn-quiet">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary min-w-36">
              {saving ? "Saving" : submitLabel}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function AccountSelect({ id, value, onChange, accounts }: { id: string; value: string; onChange: (v: string) => void; accounts: CashAccount[] }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="input">
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} ({kindLabel(a.kind)})
        </option>
      ))}
    </select>
  );
}

/* --------------------------------------------------------------------------------- add cash */

function AddCashSheet({
  accounts,
  day,
  today,
  defaultAccountId,
  onClose,
  onSaved,
}: {
  accounts: CashAccount[];
  day: string;
  today: string;
  defaultAccountId: string | null;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const clientId = useRef(crypto.randomUUID());
  const firstCash = accounts.find((a) => a.kind === "cash")?.id ?? accounts[0]?.id ?? "";
  const [account, setAccount] = useState(defaultAccountId && accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : firstCash);
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(day);
  const [party, setParty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (saving) return;
    const amount = parseAmount(amountText);
    if (!account) return setError("Choose an account.");
    if (!amount || amount <= 0) return setError("Enter an amount greater than zero, with up to 2 decimals.");
    if (!date || date > today) return setError("Choose today or an earlier date.");
    setSaving(true);
    setError(null);
    const err = await callDb((s) =>
      s.rpc("cash_add", { p_client_id: clientId.current, p_account_id: account, p_amount: amount, p_date: date, p_party: party.trim() || null, p_note: note.trim() || null })
    );
    if (err) {
      setError(err);
      setSaving(false);
      return;
    }
    onSaved(`${formatRs(amount)} added.`);
  }

  return (
    <FormSheet title="Add cash" titleId="add-cash-title" submitLabel="Add cash" saving={saving} error={error} onClose={onClose} onSubmit={submit}>
      <Field id="ac-account" label="Into which account">
        <AccountSelect id="ac-account" value={account} onChange={setAccount} accounts={accounts} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="ac-amount" label="Amount (Rs)">
          <input id="ac-amount" inputMode="decimal" autoFocus value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" className="input tabular-nums" />
        </Field>
        <Field id="ac-date" label="Date">
          <input id="ac-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="input" />
        </Field>
      </div>
      <Field id="ac-party" label="Received from (optional)">
        <input id="ac-party" value={party} onChange={(e) => setParty(e.target.value)} placeholder="Owner, a loan, a friend..." className="input" />
      </Field>
      <Field id="ac-note" label="Note (optional)">
        <textarea id="ac-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input resize-none" />
      </Field>
      <p className="text-sm text-lead">Customer payments, expenses and supplier payments do not need this. They are added by themselves.</p>
    </FormSheet>
  );
}

/* --------------------------------------------------------------------------------- deposit / withdraw / move */

function TransferSheet({
  mode,
  accounts,
  day,
  today,
  onClose,
  onSaved,
}: {
  mode: "deposit" | "withdraw" | "transfer";
  accounts: CashAccount[];
  day: string;
  today: string;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const clientId = useRef(crypto.randomUUID());
  const cash = accounts.find((a) => a.kind === "cash");
  const bank = accounts.find((a) => a.kind === "bank");
  const [from, setFrom] = useState(mode === "withdraw" ? bank?.id ?? "" : cash?.id ?? accounts[0]?.id ?? "");
  const [to, setTo] = useState(mode === "withdraw" ? cash?.id ?? "" : mode === "deposit" ? bank?.id ?? "" : accounts.find((a) => a.id !== (cash?.id ?? accounts[0]?.id))?.id ?? "");
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(day);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "deposit" ? "Deposit to bank" : mode === "withdraw" ? "Withdraw from bank" : "Move money";
  const fromBalance = accounts.find((a) => a.id === from)?.balance;

  async function submit() {
    if (saving) return;
    const amount = parseAmount(amountText);
    if (!from || !to) return setError("Choose both accounts.");
    if (from === to) return setError("Choose two different accounts.");
    if (!amount || amount <= 0) return setError("Enter an amount greater than zero, with up to 2 decimals.");
    if (!date || date > today) return setError("Choose today or an earlier date.");
    setSaving(true);
    setError(null);
    const err = await callDb((s) =>
      s.rpc("cash_transfer", { p_client_id: clientId.current, p_from: from, p_to: to, p_amount: amount, p_date: date, p_note: note.trim() || null })
    );
    if (err) {
      setError(err);
      setSaving(false);
      return;
    }
    onSaved(`${formatRs(amount)} moved.`);
  }

  return (
    <FormSheet title={title} titleId="transfer-title" submitLabel={title} saving={saving} error={error} onClose={onClose} onSubmit={submit}>
      {mode === "deposit" && !bank && <p className="rounded-xl bg-sun/25 px-3 py-2 text-sm">You have no bank account yet. Add one from Accounts first.</p>}
      <Field id="tr-from" label="From">
        <AccountSelect id="tr-from" value={from} onChange={setFrom} accounts={accounts} />
      </Field>
      {fromBalance != null && <p className="-mt-3 text-sm text-lead">Balance there: {formatRs(fromBalance)}</p>}
      <Field id="tr-to" label="To">
        <AccountSelect id="tr-to" value={to} onChange={setTo} accounts={accounts.filter((a) => a.id !== from)} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="tr-amount" label="Amount (Rs)">
          <input id="tr-amount" inputMode="decimal" autoFocus value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" className="input tabular-nums" />
        </Field>
        <Field id="tr-date" label="Date">
          <input id="tr-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="input" />
        </Field>
      </div>
      <Field id="tr-note" label="Note (optional)">
        <textarea id="tr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input resize-none" />
      </Field>
    </FormSheet>
  );
}

/* --------------------------------------------------------------------------------- close day */

function CloseDaySheet({
  accounts,
  day,
  closes,
  defaultAccountId,
  onClose,
  onSaved,
}: {
  accounts: CashAccount[];
  day: string;
  closes: Map<string, { counted: number }>;
  defaultAccountId: string | null;
  onClose: () => void;
  onSaved: (m: string) => void;
}) {
  const start = defaultAccountId && accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : accounts.find((a) => a.kind === "cash")?.id ?? accounts[0]?.id ?? "";
  const [account, setAccount] = useState(start);
  const [countedText, setCountedText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acc = accounts.find((a) => a.id === account);
  const expected = acc?.balance ?? 0;
  const counted = parseAmount(countedText);
  const diff = counted == null ? null : counted - expected;
  const already = closes.get(account);

  async function submit() {
    if (saving) return;
    if (!account) return setError("Choose an account.");
    if (counted == null) return setError("Enter the amount you counted (zero or more).");
    setSaving(true);
    setError(null);
    const err = await callDb((s) => s.rpc("cash_close_day", { p_date: day, p_account_id: account, p_counted: counted, p_note: note.trim() || null }));
    if (err) {
      setError(err);
      setSaving(false);
      return;
    }
    onSaved(diff === 0 ? "Day closed. Cash matched." : "Day closed.");
  }

  return (
    <FormSheet title={`Close ${formatDay(day)}`} titleId="close-title" submitLabel="Save count" saving={saving} error={error} onClose={onClose} onSubmit={submit}>
      <Field id="cd-account" label="Account">
        <AccountSelect id="cd-account" value={account} onChange={setAccount} accounts={accounts} />
      </Field>
      <div className="rounded-2xl bg-plate/60 p-4">
        <p className="text-sm text-lead">The book says there should be</p>
        <p className="font-display text-3xl font-bold tabular-nums">{formatRs(expected)}</p>
      </div>
      <Field id="cd-counted" label="What you actually counted (Rs)">
        <input id="cd-counted" inputMode="decimal" autoFocus value={countedText} onChange={(e) => setCountedText(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" className="input tabular-nums" />
      </Field>
      {diff != null && (
        <p className={`rounded-xl px-3 py-2 text-[15px] font-medium ${diff === 0 ? "bg-cell/10 text-cell-deep" : "bg-terminal/10 text-terminal-deep"}`}>
          {diff === 0 ? "Matches the book." : diff < 0 ? `Short by ${formatRs(Math.abs(diff))}.` : `Extra ${formatRs(diff)}.`}
        </p>
      )}
      <Field id="cd-note" label="Note (optional)">
        <input id="cd-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it may be different" className="input" />
      </Field>
      {already && <p className="text-sm text-lead">This day was already counted ({formatRs(already.counted)}). Saving replaces that count.</p>}
    </FormSheet>
  );
}

/* --------------------------------------------------------------------------------- change account */

function MoveSheet({ entry, accounts, onClose, onSaved }: { entry: CashBookEntry; accounts: CashAccount[]; onClose: () => void; onSaved: (m: string) => void }) {
  const options = useMemo(
    () => accountsAllowedFor(accounts, entry.source === "sale_payment" ? "other" : entry.method ?? ""),
    [accounts, entry.method, entry.source],
  );
  const [account, setAccount] = useState(entry.account_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (saving) return;
    if (account === entry.account_id) return setError("Choose a different account.");
    setSaving(true);
    setError(null);
    const err = await callDb((s) => s.rpc("cash_move_entry", { p_source_table: entry.source_table, p_id: entry.source_id, p_account_id: account }));
    if (err) {
      setError(err);
      setSaving(false);
      return;
    }
    onSaved("Account changed.");
  }

  return (
    <FormSheet title="Change account" titleId="move-title" submitLabel="Change" saving={saving} error={error} onClose={onClose} onSubmit={submit}>
      <p className="text-lead">
        {entry.label} · {formatRs(entry.amount)}
      </p>
      <Field id="mv-account" label="Which account it really went through">
        <AccountSelect id="mv-account" value={account} onChange={setAccount} accounts={options} />
      </Field>
      {options.length < 2 && <p className="text-sm text-lead">There is only one account that fits this payment. Add another from Accounts to choose between them.</p>}
    </FormSheet>
  );
}

/* --------------------------------------------------------------------------------- cancel manual entry */

function CancelSheet({ entry, onClose, onSaved }: { entry: CashBookEntry; onClose: () => void; onSaved: (m: string) => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (saving) return;
    if (!reason.trim()) return setError("Say why this entry is being cancelled -- it is kept for the record.");
    setSaving(true);
    setError(null);
    const err = await callDb((s) => s.rpc("cancel_cash_entry", { p_id: entry.source_id, p_reason: reason.trim() }));
    if (err) {
      setError(err);
      setSaving(false);
      return;
    }
    onSaved("Entry cancelled.");
  }

  return (
    <FormSheet title="Cancel entry" titleId="cancel-title" submitLabel="Cancel entry" saving={saving} error={error} onClose={onClose} onSubmit={submit}>
      <p className="text-lead">
        {entry.label} · {formatRs(entry.amount)}
      </p>
      <Field id="cn-reason" label="Reason">
        <textarea id="cn-reason" rows={2} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className="input resize-none" />
      </Field>
      <p className="text-sm text-lead">The entry stays in the activity log. Sales, expenses and supplier payments are cancelled from their own screens.</p>
    </FormSheet>
  );
}
