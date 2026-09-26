"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import Toast from "@/components/Toast";
import { formatRs } from "@/lib/format";
import { formatDay, parseAmount, todayKarachi } from "@/lib/invoices";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { CashBookSummary } from "@/lib/reports";

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className={strong ? "font-semibold" : "text-lead"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-display text-2xl font-semibold" : "font-semibold"} ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

export default function CashBookCard({
  cashBook,
  singleDay,
}: {
  cashBook: CashBookSummary | null;
  singleDay: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amountText, setAmountText] = useState(cashBook ? String(cashBook.opening_for_period) : "");
  const [date, setDate] = useState(cashBook?.opening_balance_as_of ?? todayKarachi());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    const amount = parseAmount(amountText);
    if (amount == null || amount < 0) {
      setError("Enter an amount of zero or more, with up to 2 decimals.");
      return;
    }
    if (!date) {
      setError("Choose the date this balance is as of.");
      return;
    }
    if (date > todayKarachi()) {
      setError("The date cannot be in the future.");
      return;
    }
    setBusy(true);
    setError(null);

    const online = await checkRealConnectivity();
    if (!online) {
      setError("Saving needs a connection. Try again once you're back online.");
      setBusy(false);
      return;
    }

    try {
      const supabase = await getBrowserClient();
      const { error: err } = await supabase.rpc("save_cash_opening_balance", {
        p_opening_balance: amount,
        p_opening_date: date,
      });
      if (err) {
        if (err.code === "42883" || err.code === "PGRST202" || err.code === "42P01") {
          setError("The cash book setup is missing. Run 15_cash_book.sql in Supabase, then try again.");
        } else {
          setError(err.message);
        }
        setBusy(false);
        return;
      }
      setToast("Opening cash balance saved.");
      setEditing(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("The connection dropped. Try again.");
      setBusy(false);
    }
  }

  if (!cashBook) {
    return (
      <section className="card anim-rise p-5" style={{ "--i": 3 } as React.CSSProperties}>
        <h2 className="font-display text-2xl font-semibold">Cash book</h2>
        <p className="mt-2 text-lead">
          The cash book setup is missing. In Supabase, open SQL Editor and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">15_cash_book.sql</code>.
        </p>
      </section>
    );
  }

  const breakdown = cashBook.other_cash_income_breakdown;
  const hasOtherIncome = cashBook.other_cash_income > 0;

  return (
    <section className="card anim-rise p-5" style={{ "--i": 3 } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Cash book</h2>
          <p className="text-sm text-lead">
            {singleDay ? "Count the drawer against this." : "Opening + cash in − cash out, for this period."}
          </p>
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} className="btn btn-quiet btn-sm shrink-0">
          <Icon name="edit" className="h-4 w-4" /> Edit opening
        </button>
      </div>

      {editing && (
        <div className="mt-3 rounded-2xl border border-line bg-plate/60 p-3.5">
          <p className="text-sm text-lead">
            The owner supplies this figure once -- it's counted for {formatDay(cashBook.opening_balance_as_of)}{" "}
            and rolled forward automatically after that.
          </p>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-lead">Opening cash balance</span>
              <input
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0"
                className="input w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-lead">As of date</span>
              <input
                type="date"
                value={date}
                max={todayKarachi()}
                onChange={(e) => setDate(e.target.value)}
                className="input w-full"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-terminal-deep">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="btn btn-primary btn-sm">
              {busy ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-quiet btn-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <dl className="mt-2 divide-y divide-line/60">
        <Row label="Opening balance" value={formatRs(cashBook.opening_for_period)} />
        <Row label="Cash sales" value={formatRs(cashBook.cash_sales)} />
        <Row label="Other cash income" value={formatRs(cashBook.other_cash_income)} />
        {hasOtherIncome && (
          <p className="py-1 pl-1 text-sm text-lead">
            Scrap {formatRs(breakdown.scrap)} · Charging {formatRs(breakdown.charging)} · Claims {formatRs(breakdown.claims)}
          </p>
        )}
        <Row label="Cash paid to suppliers" value={`- ${formatRs(cashBook.cash_paid_to_suppliers)}`} />
        <Row label="Cash expenses" value={`- ${formatRs(cashBook.cash_expenses)}`} />
        <Row
          label="Cash in hand (closing)"
          value={formatRs(cashBook.closing_balance)}
          strong
          tone={cashBook.closing_balance < 0 ? "text-terminal-deep" : "text-cell-deep"}
        />
      </dl>
      <p className="mt-2 text-sm text-lead">
        "Cash" here means paid in hand only -- cheque, bank, EasyPaisa and JazzCash never count on either side.
      </p>

      <Toast message={toast} />
    </section>
  );
}
