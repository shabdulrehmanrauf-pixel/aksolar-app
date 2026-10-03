"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Sheet from "@/components/Sheet";
import Toast from "@/components/Toast";
import { ACCOUNT_KINDS, ALL_METHODS, accountsAllowedFor, friendlyCashError, kindLabel, type CashAccount, type CashAccountKind, type CashOverview } from "@/lib/cash";
import { formatRs } from "@/lib/format";
import { formatDay, parseAmount } from "@/lib/invoices";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";

async function callDb(run: (s: Awaited<ReturnType<typeof getBrowserClient>>) => PromiseLike<{ error: { code?: string; message: string } | null }>): Promise<string | null> {
  if (!(await checkRealConnectivity())) return "This needs a connection. Try again once you're back online.";
  try {
    const { error } = await run(await getBrowserClient());
    return error ? friendlyCashError(error) : null;
  } catch {
    return "The connection dropped. Refresh the page to see whether it was saved.";
  }
}

export default function AccountsClient({ overview, today }: { overview: CashOverview; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CashAccount | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const accounts = overview.accounts;
  const defaultFor = (method: string) => accounts.find((a) => a.default_for.includes(method))?.id ?? "";

  async function setDefault(method: string, accountId: string) {
    setDefaultError(null);
    const err = await callDb((s) => s.rpc("set_cash_method_default", { p_method: method, p_account_id: accountId }));
    if (err) return setDefaultError(err);
    setToast("Saved.");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Cash accounts"
        subtitle="Your cash counter, banks and wallets. Every payment lands in one of these."
        action={
          <div className="flex gap-2">
            <Link href="/cash" className="btn btn-quiet">
              <Icon name="back" className="h-5 w-5" /> Cash book
            </Link>
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              <Icon name="plus" className="h-5 w-5" /> Add account
            </button>
          </div>
        }
      />

      <ul className="anim-rise mt-6 space-y-2">
        {accounts.map((a) => (
          <li key={a.id} className={`card flex items-center gap-3 p-4 ${a.is_active ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {a.name} <span className="text-sm font-normal text-lead">· {kindLabel(a.kind)}{a.is_active ? "" : " · switched off"}</span>
              </p>
              <p className="text-sm text-lead">
                {a.account_number ? `${a.account_number} · ` : ""}Started {formatDay(a.opening_date)} with {formatRs(a.opening_balance)}
              </p>
            </div>
            <p className="font-display text-xl font-semibold tabular-nums">{formatRs(a.balance)}</p>
            <button type="button" onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-plate">
              <Icon name="edit" className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>

      <section className="card anim-rise mt-6 p-5">
        <h2 className="font-display text-2xl font-semibold">Where each payment method goes</h2>
        <p className="text-sm text-lead">When a payment does not name an account, this is where it is counted. With only one bank you never need to choose.</p>
        <div className="mt-3 divide-y divide-line/60">
          {ALL_METHODS.map((m) => {
            const options = accountsAllowedFor(accounts.filter((a) => a.is_active), m.value);
            return (
              <div key={m.value} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{m.label}</p>
                  <p className="text-sm text-lead">{m.hint}</p>
                </div>
                <select aria-label={`Account for ${m.label}`} value={defaultFor(m.value)} onChange={(e) => setDefault(m.value, e.target.value)} className="input w-auto min-w-44">
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        {defaultError && <p role="alert" className="mt-3 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">{defaultError}</p>}
      </section>

      {editing && (
        <AccountSheet
          account={editing === "new" ? null : editing}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            setToast(m);
            router.refresh();
          }}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}

function AccountSheet({ account, today, onClose, onSaved }: { account: CashAccount | null; today: string; onClose: () => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<CashAccountKind>(account?.kind ?? "bank");
  const [number, setNumber] = useState(account?.account_number ?? "");
  const [openingText, setOpeningText] = useState(account ? String(account.opening_balance) : "0");
  const [openingDate, setOpeningDate] = useState(account?.opening_date ?? today);
  const [active, setActive] = useState(account?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const opening = parseAmount(openingText);
    if (!name.trim()) return setError("Enter a name, for example Meezan Bank.");
    if (opening == null) return setError("Enter the opening balance (zero is fine), with up to 2 decimals.");
    if (!openingDate || openingDate > today) return setError("Choose today or an earlier date.");
    setSaving(true);
    setError(null);
    const err = await callDb((s) =>
      s.rpc("save_cash_account", {
        p_id: account?.id ?? null,
        p_name: name.trim(),
        p_kind: kind,
        p_account_number: number.trim() || null,
        p_opening_balance: opening,
        p_opening_date: openingDate,
        p_is_active: active,
      })
    );
    if (err) {
      setError(err);
      setSaving(false);
      return;
    }
    onSaved(account ? "Account saved." : "Account added.");
  }

  return (
    <Sheet onClose={onClose} labelledBy="account-title" dismissable={!saving}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="account-title" className="font-display text-2xl font-bold">
            {account ? "Edit account" : "Add account"}
          </h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-plate disabled:opacity-60">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
          <div>
            <label htmlFor="acct-name" className="mb-1.5 block text-sm font-medium">Name</label>
            <input id="acct-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Meezan Bank" className="input" />
          </div>
          <div>
            <label htmlFor="acct-kind" className="mb-1.5 block text-sm font-medium">Type</label>
            <select id="acct-kind" value={kind} onChange={(e) => setKind(e.target.value as CashAccountKind)} disabled={!!account} className="input">
              {ACCOUNT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
            {account && <p className="mt-1 text-sm text-lead">The type cannot be changed after the account is made.</p>}
          </div>
          <div>
            <label htmlFor="acct-number" className="mb-1.5 block text-sm font-medium">Account / wallet number (optional)</label>
            <input id="acct-number" value={number} onChange={(e) => setNumber(e.target.value)} className="input" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="acct-open" className="mb-1.5 block text-sm font-medium">Opening balance (Rs)</label>
              <input id="acct-open" inputMode="decimal" value={openingText} onChange={(e) => setOpeningText(e.target.value.replace(/[^\d.,]/g, ""))} className="input tabular-nums" />
            </div>
            <div>
              <label htmlFor="acct-date" className="mb-1.5 block text-sm font-medium">Counted from</label>
              <input id="acct-date" type="date" value={openingDate} max={today} onChange={(e) => setOpeningDate(e.target.value)} className="input" />
            </div>
          </div>
          <p className="text-sm text-lead">Money before this date is ignored. Changing these later changes this account&apos;s balance.</p>
          {account && (
            <label className="flex items-center gap-3 text-[15px]">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" />
              Account is in use
            </label>
          )}
        </div>
        <div className="pb-safe border-t border-line bg-white px-5 py-4">
          {error && <p role="alert" className="mb-3 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="btn btn-quiet">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary min-w-36">{saving ? "Saving" : "Save"}</button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
