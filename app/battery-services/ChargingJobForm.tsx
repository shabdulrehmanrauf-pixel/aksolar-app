"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { customerMatches, formatPhone, isValidPhone, normalizePhone } from "@/lib/customers";
import { formatRs } from "@/lib/format";
import { todayKarachi } from "@/lib/invoices";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { ChargingPriceListItem, Customer } from "@/lib/types";

type CustomerLite = Pick<Customer, "id" | "name" | "phone">;

export default function ChargingJobForm({
  customers,
  priceList,
  onClose,
  onCreated,
}: {
  customers: CustomerLite[];
  priceList: ChargingPriceListItem[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [walkinName, setWalkinName] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("");

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [number, setNumber] = useState("");
  const [priceText, setPriceText] = useState("");
  const [note, setNote] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => todayKarachi());
  const today = useMemo(() => todayKarachi(), []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const hits = useMemo(
    () => (customerQuery.trim() ? customers.filter((c) => customerMatches({ ...c, cnic_or_ntn: null, address: null }, customerQuery)).slice(0, 6) : []),
    [customers, customerQuery]
  );

  function problem(): string | null {
    if (!brand.trim() || !model.trim()) return "Enter the battery brand and model.";
    const price = Number(priceText.replace(/,/g, ""));
    if (priceText.trim() === "" || Number.isNaN(price) || price < 0) return "Enter a charging price of 0 or more.";
    if (!receivedDate) return "Choose the date received.";
    if (receivedDate > today) return "The received date cannot be in the future.";
    if (!customer) {
      const phone = normalizePhone(walkinPhone);
      if (phone && !isValidPhone(phone)) return "Enter a valid phone number, or leave it empty.";
    }
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
    const { data, error: dbError } = await supabase.rpc("create_charging_job", {
      p_customer_id: customerId,
      p_walkin_name: customerId ? null : walkinName.trim() || null,
      p_walkin_phone: customerId ? null : normalizePhone(walkinPhone) || null,
      p_battery_brand: brand.trim(),
      p_battery_model: model.trim(),
      p_battery_number: number.trim() || null,
      p_price: Number(priceText.replace(/,/g, "")),
      p_note: note.trim() || null,
      p_received_date: receivedDate,
    });
    if (dbError || !data) {
      setError(
        dbError?.code === "42883" || dbError?.code === "PGRST202"
          ? "The battery-services setup is missing. Run 06_battery_services.sql in Supabase, then try again."
          : dbError?.message ?? "The slip was not saved. Please try again."
      );
      setSaving(false);
      return;
    }
    onCreated(data as string);
  }

  return (
    <Sheet onClose={onClose} labelledBy="charging-form-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="charging-form-title" className="font-display text-2xl font-bold">
            New charging slip
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
          <fieldset className="space-y-3">
            <legend className="mb-1 font-display text-xl font-semibold">Customer</legend>
            {customer ? (
              <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3">
                <div>
                  <p className="font-semibold">{customer.name}</p>
                  {customer.phone && <p className="text-sm text-lead">{formatPhone(customer.phone)}</p>}
                </div>
                <button type="button" onClick={() => setCustomerId(null)} className="btn btn-quiet btn-sm">
                  Change
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
                  <input
                    type="text"
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setPickerOpen(true);
                    }}
                    onFocus={() => setPickerOpen(true)}
                    placeholder="Search a saved customer, or leave blank for walk-in"
                    className="input pl-11"
                  />
                  {pickerOpen && hits.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lift">
                      {hits.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerId(c.id);
                              setCustomerQuery("");
                              setPickerOpen(false);
                            }}
                            className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-plate"
                          >
                            <span className="font-medium">{c.name}</span>
                            {c.phone && <span className="text-sm text-lead">{formatPhone(c.phone)}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="text-sm text-lead">No customer picked: this is a walk-in.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={walkinName}
                    onChange={(e) => setWalkinName(e.target.value)}
                    placeholder="Walk-in name (optional)"
                    className="input"
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={walkinPhone}
                    onChange={(e) => setWalkinPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    className="input"
                  />
                </div>
              </>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-display text-xl font-semibold">Battery</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="chg-brand" className="mb-1.5 block text-sm font-medium">
                  Brand
                </label>
                <input
                  id="chg-brand"
                  type="text"
                  autoFocus
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Osaka"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="chg-model" className="mb-1.5 block text-sm font-medium">
                  Model
                </label>
                <input
                  id="chg-model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="AK-200"
                  className="input"
                />
              </div>
            </div>
            <div>
              <label htmlFor="chg-number" className="mb-1.5 block text-sm font-medium">
                Battery number (optional)
              </label>
              <input
                id="chg-number"
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Serial or bar-code"
                className="input"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-display text-xl font-semibold">Charging price</legend>
            {priceList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {priceList.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriceText(String(p.price))}
                    className="rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-lead transition-colors hover:border-lead/40 hover:text-casing"
                  >
                    {p.label} · {formatRs(p.price)}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              inputMode="decimal"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              placeholder="Price"
              className="input"
            />

            <div>
              <label htmlFor="chg-date" className="mb-1.5 block text-sm font-medium">
                Date received
              </label>
              <input
                id="chg-date"
                type="date"
                value={receivedDate}
                max={today}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label htmlFor="chg-note" className="mb-1.5 block text-sm font-medium">
                Note (optional)
              </label>
              <textarea
                id="chg-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input resize-none"
              />
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
              {saving ? "Saving" : "Save and print"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
