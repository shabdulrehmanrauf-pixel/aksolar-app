"use client";

import { useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { todayKarachi } from "@/lib/invoices";
import { formatRs } from "@/lib/format";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";

/** "Add previous balance (we owe)" -- an old amount you still owe this supplier, added to the ledger. */
export default function PreviousBalanceForm({
  supplierId,
  supplierName,
  onClose,
  onSaved,
}: {
  supplierId: string;
  supplierName: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayKarachi());
  const [note, setNote] = useState("");
  const [clientId] = useState(() => crypto.randomUUID()); // a retry never saves twice
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const value = Number(amount.replace(/,/g, ""));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the amount you owe, more than 0.");
      return;
    }
    if (!date) {
      setError("Choose the date of this balance.");
      return;
    }
    if (date > todayKarachi()) {
      setError("The date cannot be in the future.");
      return;
    }

    setSaving(true);
    setError(null);

    if (!(await checkRealConnectivity())) {
      setError("Saving a previous balance needs a connection. Try again once you're back online.");
      setSaving(false);
      return;
    }

    try {
      const supabase = await getBrowserClient();
      const { error: rpcError } = await supabase.rpc("add_supplier_previous_balance", {
        p_client_id: clientId,
        p_supplier_id: supplierId,
        p_amount: value,
        p_date: date,
        p_note: note.trim() || null,
      });
      if (rpcError) {
        setError(
          rpcError.code === "42883" || rpcError.code === "PGRST202"
            ? "The setup is missing. Run 20_supplier_previous_balance.sql in Supabase, then try again."
            : rpcError.message
        );
        setSaving(false);
        return;
      }
      onSaved(`Previous balance of ${formatRs(value)} added.`);
    } catch {
      setError("The connection dropped. Refresh this page to see if it saved before you try again.");
      setSaving(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy="prev-balance-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="prev-balance-title" className="font-display text-2xl font-bold">
            Add previous balance
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

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
          <p className="text-sm text-lead">
            An old amount that <strong>we owe {supplierName}</strong> (from before this app, or not on a purchase bill
            here). It is added to the ledger and to their balance. No stock is added.
          </p>

          <div>
            <label htmlFor="pb-amount" className="mb-1.5 block text-sm font-medium">
              Amount we owe (Rs)
            </label>
            <input
              id="pb-amount"
              autoFocus
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^\d.,]/g, ""));
                setError(null);
              }}
              inputMode="decimal"
              placeholder="0"
              className="input tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="pb-date" className="mb-1.5 block text-sm font-medium">
              As of date
            </label>
            <input
              id="pb-date"
              type="date"
              max={todayKarachi()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label htmlFor="pb-note" className="mb-1.5 block text-sm font-medium">
              Note (optional)
            </label>
            <input
              id="pb-note"
              type="text"
              autoComplete="off"
              placeholder="e.g. Old khata, Ramzan stock"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input"
            />
          </div>
        </div>

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
              {saving ? "Saving" : "Add balance"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
