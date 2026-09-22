"use client";

import { useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { formatRs } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { ChargingJob, ChargingOutcome } from "@/lib/types";

const OUTCOMES: { value: ChargingOutcome; label: string }[] = [
  { value: "charged", label: "Charged fine" },
  { value: "faulty", label: "Turned out faulty" },
];

/** Opens when "Mark collected" is tapped on an in-shop charging job. Records
 * what was actually collected from the customer and whether the battery
 * came back charged or faulty, then marks the job collected. */
export default function ChargingHandoverForm({
  job,
  onClose,
  onSaved,
}: {
  job: ChargingJob;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [outcome, setOutcome] = useState<ChargingOutcome | null>(null);
  const [amountText, setAmountText] = useState(String(job.price));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!outcome) {
      setError("Choose whether the battery is charged or faulty.");
      return;
    }
    const amount = amountText.trim() === "" ? null : Number(amountText.replace(/,/g, ""));
    if (amount != null && (Number.isNaN(amount) || amount < 0)) {
      setError("Enter a valid amount, or leave it empty.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = await getBrowserClient();
    const { error: dbError } = await supabase.rpc("record_charging_handover", {
      p_id: job.id,
      p_outcome: outcome,
      p_amount: amount,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (dbError) {
      setError(
        dbError.code === "42883" || dbError.code === "PGRST202"
          ? "This needs a small database update first. Run 07_charging_handover.sql in Supabase, then try again."
          : dbError.message
      );
      return;
    }
    onSaved(outcome === "charged" ? "Marked collected -- charged fine." : "Marked collected -- battery was faulty.");
  }

  return (
    <Sheet onClose={onClose} labelledBy="handover-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="handover-title" className="font-display text-2xl font-bold">
            {job.slip_number}
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

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
          <div>
            <p className="mb-1 text-sm text-lead">
              {job.battery_brand} {job.battery_model} · {job.customer_name}
            </p>
            <p className="mb-3 font-display text-xl font-semibold">How did it come out?</p>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(o.value)}
                  aria-pressed={outcome === o.value}
                  className={`rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                    outcome === o.value
                      ? "border-casing bg-casing text-white"
                      : "border-line bg-white text-lead hover:border-lead/40 hover:text-casing"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="ho-amount" className="mb-1.5 block text-sm font-medium">
              Amount received
            </label>
            <input
              id="ho-amount"
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="input"
            />
            <p className="mt-1 text-sm text-lead">Slip price was {formatRs(job.price)}.</p>
          </div>

          <div>
            <label htmlFor="ho-note" className="mb-1.5 block text-sm font-medium">
              Note (optional)
            </label>
            <textarea
              id="ho-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input resize-none"
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
            <button type="submit" disabled={saving || !outcome} className="btn btn-primary min-w-36">
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
