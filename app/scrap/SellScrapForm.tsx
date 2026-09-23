"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { isValidPhone, normalizePhone } from "@/lib/customers";
import { formatRs } from "@/lib/format";
import { parseAmount, todayKarachi } from "@/lib/invoices";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { ScrapBatteryInventory } from "@/lib/types";

export default function SellScrapForm({
  rows,
  onClose,
  onSold,
}: {
  rows: ScrapBatteryInventory[];
  onClose: () => void;
  onSold: (message: string) => void;
}) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [weightText, setWeightText] = useState("");
  const [rateText, setRateText] = useState("");
  const [saleDate, setSaleDate] = useState(() => todayKarachi());
  const [note, setNote] = useState("");
  const today = useMemo(() => todayKarachi(), []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0);
  const weight = parseAmount(weightText);
  const rate = parseAmount(rateText);
  const total = weight != null && rate != null ? Math.round(weight * rate * 100) / 100 : null;

  function problem(): string | null {
    if (rows.length === 0) return "Select at least one scrap battery to sell.";
    if (!buyerName.trim()) return "Enter the buyer's name.";
    const phone = normalizePhone(buyerPhone);
    if (phone && !isValidPhone(phone)) return "Enter a valid phone number, or leave it empty.";
    if (weightText.trim() === "" || weight === null || weight <= 0) return "Enter the total weight in kg.";
    if (rateText.trim() === "" || rate === null || rate < 0) return "Enter the rate per kg.";
    if (!saleDate) return "Choose the sale date.";
    if (saleDate > today) return "The sale date cannot be in the future.";
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = problem();
    if (found) {
      setError(found);
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = await getBrowserClient();
    const { data, error: dbError } = await supabase.rpc("sell_scrap", {
      p_intake_ids: rows.map((r) => r.id),
      p_buyer_name: buyerName.trim(),
      p_buyer_phone: normalizePhone(buyerPhone) || null,
      p_total_weight_kg: weight,
      p_rate_per_kg: rate,
      p_sale_date: saleDate,
      p_note: note.trim() || null,
    });
    if (dbError || !data) {
      setError(
        dbError?.code === "42883" || dbError?.code === "PGRST202"
          ? "The scrap battery setup is missing. Run 07_scrap_battery.sql in Supabase, then try again."
          : dbError?.message ?? "The sale was not saved. Please try again."
      );
      setSaving(false);
      return;
    }
    onSold(`Sold to ${buyerName.trim()} for ${formatRs(total ?? 0)}.`);
  }

  return (
    <Sheet onClose={onClose} labelledBy="sell-scrap-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="sell-scrap-title" className="font-display text-2xl font-bold">
            Sell scrap
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
          <fieldset className="space-y-2">
            <legend className="mb-1 font-display text-xl font-semibold">This lot</legend>
            <p className="text-sm text-lead">
              {rows.length} {rows.length === 1 ? "batch" : "batches"} · {totalQty} {totalQty === 1 ? "battery" : "batteries"}
            </p>
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-line px-3.5 py-2.5 text-sm text-lead">
              {rows.map((r) => (
                <li key={r.id} className="truncate">
                  {r.intake_number} · {r.brand} {r.model} · qty {r.quantity}
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-display text-xl font-semibold">Buyer</legend>
            <div>
              <label htmlFor="ss-buyer" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="ss-buyer"
                type="text"
                autoFocus
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Scrap buyer / kabari"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="ss-phone" className="mb-1.5 block text-sm font-medium">
                Phone (optional)
              </label>
              <input
                id="ss-phone"
                type="tel"
                inputMode="tel"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                className="input"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-display text-xl font-semibold">Weight and rate</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ss-weight" className="mb-1.5 block text-sm font-medium">
                  Total weight (kg)
                </label>
                <input
                  id="ss-weight"
                  type="text"
                  inputMode="decimal"
                  value={weightText}
                  onChange={(e) => setWeightText(e.target.value)}
                  placeholder="0"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="ss-rate" className="mb-1.5 block text-sm font-medium">
                  Rate per kg
                </label>
                <input
                  id="ss-rate"
                  type="text"
                  inputMode="decimal"
                  value={rateText}
                  onChange={(e) => setRateText(e.target.value)}
                  placeholder="0"
                  className="input"
                />
              </div>
            </div>
            {total != null && (
              <p className="rounded-xl bg-plate px-3.5 py-2.5 text-sm font-medium">
                Total: <span className="font-display text-lg font-semibold tabular-nums">{formatRs(total)}</span>
              </p>
            )}

            <div>
              <label htmlFor="ss-date" className="mb-1.5 block text-sm font-medium">
                Sale date
              </label>
              <input
                id="ss-date"
                type="date"
                value={saleDate}
                max={today}
                onChange={(e) => setSaleDate(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label htmlFor="ss-note" className="mb-1.5 block text-sm font-medium">
                Note (optional)
              </label>
              <textarea id="ss-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input resize-none" />
            </div>
          </fieldset>
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
              {saving ? "Saving" : "Sell lot"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
