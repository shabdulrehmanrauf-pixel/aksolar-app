"use client";

import { useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { claimStatusLabel } from "@/lib/batteryClaims";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { BatteryClaim, BatteryClaimStatus, Distributor } from "@/lib/types";

/** What a claim can move to next. Rejected and approved both still hand a battery back eventually. */
const NEXT_STATUSES: Record<BatteryClaimStatus, BatteryClaimStatus[]> = {
  received: ["sent_to_distributor"],
  sent_to_distributor: ["approved", "rejected"],
  approved: ["given_to_customer"],
  rejected: ["given_to_customer"],
  given_to_customer: ["settled"],
  settled: [],
};

export default function ClaimStatusForm({
  claim,
  distributors,
  onClose,
  onSaved,
}: {
  claim: BatteryClaim;
  distributors: Distributor[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const options = NEXT_STATUSES[claim.status];
  const [target, setTarget] = useState<BatteryClaimStatus | null>(options.length === 1 ? options[0] : null);
  const [distributorId, setDistributorId] = useState<string | null>(claim.distributor_id);
  const [newDistributor, setNewDistributor] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsDistributor = target === "sent_to_distributor" && !claim.distributor_id;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) {
      setError("Choose what happened next.");
      return;
    }
    if (needsDistributor && !distributorId && !newDistributor.trim()) {
      setError("Choose which distributor this battery is going to, or type a new one.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = await getBrowserClient();
    const { error: dbError } = await supabase.rpc("update_battery_claim_status", {
      p_id: claim.id,
      p_status: target,
      p_distributor_id: newDistributor.trim() ? null : distributorId,
      p_note: note.trim() || null,
      p_new_distributor_name: newDistributor.trim() || null,
    });
    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    onSaved(`Marked as ${claimStatusLabel(target).toLowerCase()}.`);
  }

  return (
    <Sheet onClose={onClose} labelledBy="claim-status-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="claim-status-title" className="font-display text-2xl font-bold">
            {claim.claim_number}
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
            <p className="mb-2 text-sm font-medium">Currently: {claimStatusLabel(claim.status)}</p>
            <p className="mb-3 font-display text-xl font-semibold">What happened next?</p>
            <div className="flex flex-wrap gap-2">
              {options.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTarget(s)}
                  aria-pressed={target === s}
                  className={`rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                    target === s
                      ? "border-casing bg-casing text-white"
                      : "border-line bg-white text-lead hover:border-lead/40 hover:text-casing"
                  }`}
                >
                  {claimStatusLabel(s)}
                </button>
              ))}
            </div>
          </div>

          {needsDistributor && (
            <fieldset className="space-y-3">
              <legend className="mb-1 font-display text-xl font-semibold">Send to which distributor?</legend>
              {distributors.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {distributors.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setDistributorId((v) => (v === d.id ? null : d.id));
                        setNewDistributor("");
                      }}
                      aria-pressed={distributorId === d.id}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        distributorId === d.id
                          ? "border-casing bg-casing text-white"
                          : "border-line bg-white text-lead hover:border-lead/40 hover:text-casing"
                      }`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={newDistributor}
                onChange={(e) => {
                  setNewDistributor(e.target.value);
                  if (e.target.value.trim()) setDistributorId(null);
                }}
                placeholder="Or type a new distributor's name"
                className="input"
              />
            </fieldset>
          )}

          <div>
            <label htmlFor="clm-status-note" className="mb-1.5 block text-sm font-medium">
              Note (optional)
            </label>
            <textarea
              id="clm-status-note"
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
            <button type="submit" disabled={saving || !target} className="btn btn-primary min-w-36">
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
