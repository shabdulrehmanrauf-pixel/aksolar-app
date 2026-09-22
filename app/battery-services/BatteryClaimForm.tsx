"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { customerMatches, formatPhone, isValidPhone, normalizePhone } from "@/lib/customers";
import { formatDay, todayKarachi } from "@/lib/invoices";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { Customer, Distributor, Invoice } from "@/lib/types";

type CustomerLite = Pick<Customer, "id" | "name" | "phone">;
type InvoiceHit = Pick<Invoice, "id" | "invoice_number" | "buyer_name" | "invoice_date">;

export default function BatteryClaimForm({
  customers,
  distributors,
  onClose,
  onCreated,
}: {
  customers: CustomerLite[];
  distributors: Distributor[];
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

  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoiceHits, setInvoiceHits] = useState<InvoiceHit[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [originalInvoice, setOriginalInvoice] = useState<InvoiceHit | null>(null);

  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [newDistributor, setNewDistributor] = useState("");

  const [claimAmountText, setClaimAmountText] = useState("");
  const [extraChargesText, setExtraChargesText] = useState("");
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

  async function searchInvoices(q: string) {
    setInvoiceQuery(q);
    setOriginalInvoice(null);
    if (q.trim().length < 2) {
      setInvoiceHits([]);
      return;
    }
    setInvoiceLoading(true);
    const supabase = await getBrowserClient();
    const { data } = await supabase
      .from("invoice_balances")
      .select("id,invoice_number,buyer_name,invoice_date")
      .or(`invoice_number.ilike.%${q}%,buyer_name.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(6);
    setInvoiceHits((data ?? []) as InvoiceHit[]);
    setInvoiceLoading(false);
  }

  function parseMoney(text: string): number | null {
    const t = text.trim().replace(/,/g, "");
    if (t === "") return null;
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
    return Number(t);
  }

  function problem(): string | null {
    if (!brand.trim() || !model.trim()) return "Enter the battery brand and model.";
    const claimAmount = parseMoney(claimAmountText);
    if (Number.isNaN(claimAmount)) return "Enter a valid claim amount, or leave it blank.";
    const extraCharges = parseMoney(extraChargesText);
    if (Number.isNaN(extraCharges)) return "Enter valid extra charges, or leave it blank.";
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
    const { data, error: dbError } = await supabase.rpc("create_battery_claim", {
      p_customer_id: customerId,
      p_walkin_name: customerId ? null : walkinName.trim() || null,
      p_walkin_phone: customerId ? null : normalizePhone(walkinPhone) || null,
      p_battery_brand: brand.trim(),
      p_battery_model: model.trim(),
      p_battery_number: number.trim() || null,
      p_original_invoice_id: originalInvoice?.id ?? null,
      p_claim_amount: parseMoney(claimAmountText),
      p_extra_charges: parseMoney(extraChargesText),
      p_note: note.trim() || null,
      p_received_date: receivedDate,
      p_distributor_id: newDistributor.trim() ? null : distributorId,
      p_new_distributor_name: newDistributor.trim() || null,
    });
    if (dbError || !data) {
      setError(
        dbError?.code === "42883" || dbError?.code === "PGRST202"
          ? "The battery-services setup is missing. Run 06_battery_services.sql in Supabase, then try again."
          : dbError?.message ?? "The claim was not saved. Please try again."
      );
      setSaving(false);
      return;
    }
    onCreated(data as string);
  }

  return (
    <Sheet onClose={onClose} labelledBy="claim-form-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="claim-form-title" className="font-display text-2xl font-bold">
            New battery claim
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
              <input
                type="text"
                autoFocus
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Brand"
                className="input"
              />
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Model"
                className="input"
              />
            </div>
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Battery number (optional)"
              className="input"
            />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-display text-xl font-semibold">Original bill (optional)</legend>
            {originalInvoice ? (
              <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3">
                <div>
                  <p className="font-semibold">{originalInvoice.invoice_number}</p>
                  <p className="text-sm text-lead">
                    {originalInvoice.buyer_name} · {formatDay(originalInvoice.invoice_date)}
                  </p>
                </div>
                <button type="button" onClick={() => setOriginalInvoice(null)} className="btn btn-quiet btn-sm">
                  Remove
                </button>
              </div>
            ) : (
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
                <input
                  type="text"
                  value={invoiceQuery}
                  onChange={(e) => searchInvoices(e.target.value)}
                  placeholder="Bill number or customer name"
                  className="input pl-11"
                />
                {invoiceQuery.trim().length >= 2 && (invoiceLoading || invoiceHits.length > 0) && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lift">
                    {invoiceLoading ? (
                      <li className="px-3.5 py-2.5 text-sm text-lead">Searching…</li>
                    ) : (
                      invoiceHits.map((inv) => (
                        <li key={inv.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setOriginalInvoice(inv);
                              setInvoiceQuery("");
                              setInvoiceHits([]);
                            }}
                            className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-plate"
                          >
                            <span className="font-medium">{inv.invoice_number}</span>
                            <span className="text-sm text-lead">{inv.buyer_name}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 font-display text-xl font-semibold">Distributor (optional for now)</legend>
            <p className="text-sm text-lead">Pick one now, or leave blank and choose it when you send the battery off.</p>
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

          <fieldset className="space-y-3">
            <legend className="mb-1 font-display text-xl font-semibold">Money</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="clm-amount" className="mb-1.5 block text-sm font-medium">
                  Claim amount (optional)
                </label>
                <input
                  id="clm-amount"
                  type="text"
                  inputMode="decimal"
                  value={claimAmountText}
                  onChange={(e) => setClaimAmountText(e.target.value)}
                  placeholder="Recovered from distributor"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="clm-extra" className="mb-1.5 block text-sm font-medium">
                  Extra charges (optional)
                </label>
                <input
                  id="clm-extra"
                  type="text"
                  inputMode="decimal"
                  value={extraChargesText}
                  onChange={(e) => setExtraChargesText(e.target.value)}
                  placeholder="Acid, service charges etc."
                  className="input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clm-date" className="mb-1.5 block text-sm font-medium">
                Date received
              </label>
              <input
                id="clm-date"
                type="date"
                value={receivedDate}
                max={today}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="input"
              />
            </div>

            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="input resize-none"
            />
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
