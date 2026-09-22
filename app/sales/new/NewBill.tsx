"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { customerMatches, formatPhone, formatRegNo } from "@/lib/customers";
import { formatRs } from "@/lib/format";
import { categoryLabel, itemSpecs } from "@/lib/inventory";
import {
  friendlyInvoiceError,
  lineAmount,
  parseAmount,
  parseQty,
  PAYMENT_METHODS,
  round2,
  todayKarachi,
} from "@/lib/invoices";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { Customer, InventoryItem, PaymentMethod } from "@/lib/types";
import CustomerForm from "@/app/customers/CustomerForm";

export type BillItem = Pick<
  InventoryItem,
  | "id"
  | "category"
  | "brand"
  | "model"
  | "type"
  | "voltage"
  | "plates"
  | "ah_rating"
  | "wattage"
  | "warranty_months"
  | "cost_price"
  | "sale_price"
  | "quantity"
>;
export type BillCustomer = Pick<Customer, "id" | "name" | "phone" | "registration_type" | "cnic_or_ntn">;

/** One row on the bill. Qty and rate are kept as text while typing, and checked before saving. */
type Line = { itemId: string; qty: string; rate: string };
type PayMode = "full" | "part" | "credit";

const PAY_MODES: { value: PayMode; label: string; hint: string }[] = [
  { value: "full", label: "Paid in full", hint: "Customer pays everything now" },
  { value: "part", label: "Part payment", hint: "Some now, the rest is udhaar" },
  { value: "credit", label: "Udhaar", hint: "Nothing paid now" },
];

function specText(item: BillItem) {
  return itemSpecs(item as InventoryItem) || categoryLabel(item.category);
}

export default function NewBill({
  stock,
  customers,
  initialCustomerId,
}: {
  stock: BillItem[];
  customers: BillCustomer[];
  initialCustomerId: string | null;
}) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [walkinName, setWalkinName] = useState("");
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [note, setNote] = useState("");

  const [lines, setLines] = useState<Line[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [activeHit, setActiveHit] = useState(0);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<PayMode>("full");
  const [partText, setPartText] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const byId = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);

  /* ---------- Item search ---------- */
  const hits = useMemo(() => {
    const words = itemQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return stock
      .filter((s) => {
        const hay = `${s.brand} ${s.model} ${s.type ?? ""} ${categoryLabel(s.category)} ${s.ah_rating ?? ""}ah ${s.wattage ?? ""}w`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 8);
  }, [itemQuery, stock]);

  const addItem = useCallback(
    (item: BillItem) => {
      setLines((prev) => {
        const found = prev.find((l) => l.itemId === item.id);
        if (found) {
          return prev.map((l) =>
            l.itemId === item.id ? { ...l, qty: String((parseQty(l.qty) ?? 0) + 1) } : l
          );
        }
        return [...prev, { itemId: item.id, qty: "1", rate: String(item.sale_price) }];
      });
      setItemQuery("");
      setActiveHit(0);
      setError(null);
      itemInputRef.current?.focus();
    },
    []
  );

  const setLine = (itemId: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));
  const removeLine = (itemId: string) => setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  const stepQty = (l: Line, delta: number) => {
    const next = Math.max(1, (parseQty(l.qty) ?? 1) + delta);
    setLine(l.itemId, { qty: String(next) });
  };

  /* ---------- Totals (always calculated in code) ---------- */
  const computed = lines.map((l) => {
    const item = byId.get(l.itemId)!;
    const qty = parseQty(l.qty);
    const rate = parseAmount(l.rate);
    return {
      line: l,
      item,
      qty,
      rate,
      amount: qty != null && rate != null ? lineAmount(qty, rate) : 0,
      overStock: qty != null && qty > item.quantity,
      changed: rate != null && rate !== item.sale_price,
      belowCost: rate != null && rate < item.cost_price,
    };
  });
  const total = round2(computed.reduce((s, c) => s + c.amount, 0));

  const partValue = parseAmount(partText);
  const paidNow = mode === "full" ? total : mode === "credit" ? 0 : Math.min(partValue ?? 0, total);
  const due = round2(total - paidNow);

  /* ---------- Save ---------- */
  function problem(): string | null {
    if (lines.length === 0) return "Add at least one item to the bill.";
    for (const c of computed) {
      const name = `${c.item.brand} ${c.item.model}`;
      if (c.qty == null) return `Enter a quantity of 1 or more for ${name}.`;
      if (c.rate == null) return `Enter a valid price for ${name} (numbers only, up to 2 decimals).`;
      if (c.overStock) {
        return `Only ${c.item.quantity} of ${name} in stock. Lower the quantity to ${c.item.quantity} or less.`;
      }
    }
    if (total <= 0) return "The bill total is zero. Check the prices.";
    if (mode === "part") {
      if (partValue == null || partValue <= 0) return "Enter how much the customer is paying now.";
      if (partValue >= total) return "That is the full amount. Choose Paid in full, or enter a smaller amount.";
    }
    if (due > 0 && !customer) return "Udhaar needs a customer. Choose a customer, or take the full payment.";
    return null;
  }

  async function save(thenPrint: boolean) {
    if (savingRef.current) return; // never save the same bill twice
    const found = problem();
    if (found) {
      setError(found);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const supabase = await getBrowserClient();
      const { data, error: dbError } = await supabase.rpc("create_invoice", {
        p_customer_id: customerId,
        p_walkin_name: customerId ? null : walkinName.trim() || null,
        p_note: note.trim() || null,
        p_invoice_date: todayKarachi(),
        p_items: computed.map((c) => ({ inventory_id: c.item.id, quantity: c.qty, rate: c.rate })),
        p_paid: paidNow,
        p_method: method,
      });
      if (dbError || !data) {
        setError(dbError ? friendlyInvoiceError(dbError) : "The bill was not saved. Please try again.");
        savingRef.current = false;
        setSaving(false);
        return;
      }
      router.push(thenPrint ? `/print/${data}?auto=1` : `/sales/${data}`);
    } catch {
      setError("The connection dropped, so we could not confirm the bill was saved. Open Sales and check before you save again.");
      savingRef.current = false;
      setSaving(false);
    }

  }

  // Ctrl+S saves (desktop)
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const customerHits = useMemo(
    () => customers.filter((c) => customerMatches({ ...c, address: null }, customerQuery)).slice(0, 6),
    [customers, customerQuery]
  );

  function onItemKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveHit((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveHit((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[activeHit]) addItem(hits[activeHit]);
    }
  }

  const itemCount = lines.length;

  return (
    <div className="pb-44 lg:pb-0">
      <PageHeader title="New bill" subtitle="Choose a customer, add items, then save." />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="space-y-4">
          {/* ---------- Customer ---------- */}
          <section className="card anim-rise p-4 sm:p-5" style={{ "--i": 1 } as React.CSSProperties}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">Customer</h2>
              {!pickingCustomer && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPickingCustomer(true)}>
                  {customer ? "Change" : "Choose customer"}
                </button>
              )}
            </div>

            {!pickingCustomer && (
              <div className="mt-3">
                {customer ? (
                  <div className="flex items-center gap-3">
                    <Avatar name={customer.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{customer.name}</p>
                      <p className="truncate text-sm text-lead">
                        {customer.phone ? formatPhone(customer.phone) : "No phone saved"}
                        {customer.registration_type === "Registered" && customer.cnic_or_ntn
                          ? ` · ${formatRegNo(customer.cnic_or_ntn)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="walkin" className="text-sm font-medium text-lead">
                      Walk-in customer. Name on bill (optional)
                    </label>
                    <input
                      id="walkin"
                      value={walkinName}
                      onChange={(e) => setWalkinName(e.target.value)}
                      maxLength={120}
                      placeholder="Leave empty for Walk-in customer"
                      className="input mt-1.5"
                      autoComplete="off"
                    />
                  </div>
                )}
              </div>
            )}

            {pickingCustomer && (
              <div className="mt-3">
                <label className="relative block">
                  <span className="sr-only">Search customers</span>
                  <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
                  <input
                    autoFocus
                    type="search"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Search name or phone"
                    className="input pl-11"
                    autoComplete="off"
                  />
                </label>
                <ul className="mt-2 divide-y divide-line/60 overflow-hidden rounded-xl border border-line">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId(null);
                        setPickingCustomer(false);
                        setCustomerQuery("");
                      }}
                      className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-plate"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-casing/10 text-casing">
                        <Icon name="users" className="h-4 w-4" />
                      </span>
                      <span className="font-semibold">Walk-in customer</span>
                    </button>
                  </li>
                  {customerHits.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerId(c.id);
                          setPickingCustomer(false);
                          setCustomerQuery("");
                          setError(null);
                        }}
                        className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-plate"
                      >
                        <Avatar name={c.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{c.name}</span>
                          <span className="block truncate text-sm text-lead">{c.phone ? formatPhone(c.phone) : "No phone saved"}</span>
                        </span>
                        {c.registration_type === "Registered" && (
                          <span className="rounded-full bg-cell/10 px-2.5 py-1 text-xs font-semibold text-cell-deep">Registered</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {customerQuery.trim() && customerHits.length === 0 && (
                  <p className="mt-2 text-sm text-lead">No customer found. You can add them below.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAddingCustomer(true)}>
                    <Icon name="userplus" className="h-4 w-4" /> Add new customer
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPickingCustomer(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="note" className="text-sm font-medium text-lead">
                Vehicle or note (optional)
              </label>
              <input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="For example: Suzuki Cultus, old battery taken"
                className="input mt-1.5"
                autoComplete="off"
              />
            </div>
          </section>

          {/* ---------- Items ---------- */}
          <section className="card anim-rise p-4 sm:p-5" style={{ "--i": 2 } as React.CSSProperties}>
            <h2 className="font-display text-2xl font-semibold">Items</h2>

            <div className="relative mt-3">
              <label htmlFor="item-search" className="sr-only">
                Search stock to add
              </label>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
              <input
                id="item-search"
                ref={itemInputRef}
                value={itemQuery}
                onChange={(e) => {
                  setItemQuery(e.target.value);
                  setActiveHit(0);
                }}
                onKeyDown={onItemKey}
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="item-hits"
                aria-activedescendant={hits[activeHit] ? `hit-${hits[activeHit].id}` : undefined}
                placeholder="Search stock: brand, model, 100Ah"
                autoComplete="off"
                spellCheck={false}
                className="input pl-11"
              />
            </div>

            {itemQuery.trim() && (
              <ul id="item-hits" role="listbox" aria-label="Matching stock" className="mt-2 divide-y divide-line/60 overflow-hidden rounded-xl border border-line">
                {hits.length === 0 && <li className="px-3.5 py-3 text-lead">No stock matches. Check the spelling.</li>}
                {hits.map((s, i) => (
                  <li key={s.id} role="option" id={`hit-${s.id}`} aria-selected={i === activeHit}>
                    <button
                      type="button"
                      onClick={() => addItem(s)}
                      onMouseMove={() => setActiveHit(i)}
                      className={`flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left ${i === activeHit ? "bg-plate" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {s.brand} {s.model}
                        </span>
                        <span className="block truncate text-sm text-lead">{specText(s)}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">{formatRs(s.sale_price)}</span>
                        <span className={`block text-xs ${s.quantity <= 0 ? "font-semibold text-terminal-deep" : "text-lead"}`}>
                          {s.quantity <= 0 ? "Out of stock" : `${s.quantity} in stock`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {lines.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-lead/40 px-4 py-8 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sun/25 text-amber-800">
                  <Icon name="battery" className="h-6 w-6" />
                </span>
                <p className="mt-2 font-semibold">No items yet</p>
                <p className="mt-0.5 text-sm text-lead">
                  {stock.length === 0 ? "Add stock in Inventory first." : "Search above and press Enter or tap an item to add it."}
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <ul className="divide-y divide-line/60 rounded-xl border border-line">
                  {computed.map((c) => (
                    <li key={c.line.itemId} className="p-3 sm:p-4">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-semibold leading-snug">
                            {c.item.brand} {c.item.model}
                          </p>
                          <p className="text-sm text-lead">{specText(c.item)}</p>
                          {c.overStock && (
                            <p role="alert" className="mt-1 text-sm font-semibold text-terminal-deep">
                              Only {c.item.quantity} in stock. Lower the quantity to save.
                            </p>
                          )}
                          {!c.overStock && c.changed && (
                            <p className="mt-1 text-sm text-amber-800">Price changed from {formatRs(c.item.sale_price)}</p>
                          )}
                          {c.belowCost && <p className="mt-0.5 text-sm font-semibold text-terminal-deep">Below cost price</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(c.line.itemId)}
                          aria-label={`Remove ${c.item.brand} ${c.item.model}`}
                          className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lead hover:bg-terminal/10 hover:text-terminal"
                        >
                          <Icon name="trash" className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                        <div>
                          <span className="mb-1 block text-xs text-lead">Qty</span>
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => stepQty(c.line, -1)}
                              aria-label={`One less ${c.item.brand} ${c.item.model}`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-l-xl border border-line bg-white hover:bg-plate"
                            >
                              <Icon name="minus" className="h-4 w-4" />
                            </button>
                            <input
                              value={c.line.qty}
                              onChange={(e) => setLine(c.line.itemId, { qty: e.target.value.replace(/\D/g, "") })}
                              onFocus={(e) => e.target.select()}
                              inputMode="numeric"
                              aria-label={`Quantity of ${c.item.brand} ${c.item.model}`}
                              aria-invalid={c.qty == null}
                              className="input h-11 w-14 rounded-none border-x-0 px-1 text-center tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => stepQty(c.line, 1)}
                              aria-label={`One more ${c.item.brand} ${c.item.model}`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-r-xl border border-line bg-white hover:bg-plate"
                            >
                              <Icon name="plus" className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="w-32">
                          <label className="mb-1 block text-xs text-lead" htmlFor={`rate-${c.line.itemId}`}>
                            Rate (Rs)
                          </label>
                          <input
                            id={`rate-${c.line.itemId}`}
                            value={c.line.rate}
                            onChange={(e) => setLine(c.line.itemId, { rate: e.target.value.replace(/[^\d.,]/g, "") })}
                            onFocus={(e) => e.target.select()}
                            inputMode="decimal"
                            aria-invalid={c.rate == null}
                            className="input h-11 tabular-nums"
                          />
                        </div>
                        <div className="ml-auto text-right">
                          <span className="mb-1 block text-xs text-lead">Amount</span>
                          <span className="block font-display text-2xl font-semibold leading-[2.75rem] tabular-nums">{formatRs(c.amount)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        {/* ---------- Bill total and payment ---------- */}
        <aside className="card anim-rise p-4 sm:p-5 lg:sticky lg:top-20" style={{ "--i": 3 } as React.CSSProperties}>
          <h2 className="font-display text-2xl font-semibold">Bill total</h2>

          <dl className="mt-3 space-y-1.5 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-lead">Items</dt>
              <dd className="tabular-nums">{itemCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-lead">Subtotal</dt>
              <dd className="tabular-nums">{formatRs(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-lead">Sales tax</dt>
              <dd className="text-lead">Added when FBR is connected</dd>
            </div>
          </dl>

          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-display text-xl font-semibold">Total</span>
            <span className="font-display text-4xl font-bold tabular-nums">{formatRs(total)}</span>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-lead">How is the customer paying?</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PAY_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={mode === m.value}
                  onClick={() => {
                    setMode(m.value);
                    setError(null);
                  }}
                  className={`min-h-12 rounded-xl border px-2 py-2 text-sm font-semibold leading-tight transition-colors ${
                    mode === m.value ? "border-casing bg-casing text-white" : "border-line bg-white text-casing hover:bg-plate"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-sm text-lead">{PAY_MODES.find((m) => m.value === mode)?.hint}</p>
          </fieldset>

          {mode === "part" && (
            <div className="mt-3">
              <label htmlFor="part" className="text-sm font-medium text-lead">
                Paid now (Rs)
              </label>
              <input
                id="part"
                value={partText}
                onChange={(e) => setPartText(e.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                className="input mt-1.5 tabular-nums"
              />
            </div>
          )}

          {paidNow > 0 && (
            <div className="mt-3">
              <label htmlFor="method" className="text-sm font-medium text-lead">
                Payment method
              </label>
              <select id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="input mt-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <dl className="mt-4 space-y-1.5 rounded-xl bg-plate/70 p-3.5">
            <div className="flex justify-between">
              <dt className="text-lead">Paid now</dt>
              <dd className="font-semibold tabular-nums">{formatRs(paidNow)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-lead">Due (udhaar)</dt>
              <dd className={`font-display text-2xl font-semibold tabular-nums ${due > 0 ? "text-terminal-deep" : "text-cell-deep"}`}>
                {formatRs(due)}
              </dd>
            </div>
          </dl>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-terminal/10 px-3 py-2.5 text-[15px] text-terminal-deep">
              {error}
            </p>
          )}

          <div className="mt-4 hidden flex-col gap-2 lg:flex">
            <button type="button" onClick={() => save(false)} disabled={saving} className="btn btn-primary">
              {saving ? "Saving" : "Save bill"}
            </button>
            <button type="button" onClick={() => save(true)} disabled={saving} className="btn btn-quiet">
              <Icon name="printer" className="h-5 w-5" /> Save and print
            </button>
            <p className="text-center text-xs text-lead">
              Press <kbd className="rounded border border-line bg-plate px-1.5 py-0.5">Ctrl</kbd> +{" "}
              <kbd className="rounded border border-line bg-plate px-1.5 py-0.5">S</kbd> to save
            </p>
          </div>

          <button type="button" onClick={() => save(true)} disabled={saving} className="btn btn-quiet mt-4 w-full lg:hidden">
            <Icon name="printer" className="h-5 w-5" /> Save and print
          </button>
        </aside>
      </div>

      {/* Phone: total and Save stay pinned above the tab bar */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line/70 bg-white/95 px-4 py-2.5 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-lead">
              {itemCount} {itemCount === 1 ? "item" : "items"}
              {due > 0 ? ` · ${formatRs(due)} due` : ""}
            </p>
            <p className="font-display text-2xl font-bold leading-none tabular-nums">{formatRs(total)}</p>
          </div>
          <button type="button" onClick={() => save(false)} disabled={saving} className="btn btn-primary min-w-32">
            {saving ? "Saving" : "Save bill"}
          </button>
        </div>
      </div>

      {addingCustomer && (
        <CustomerForm
          customer={null}
          others={customers}
          onClose={() => setAddingCustomer(false)}
          onSaved={(m) => {
            setAddingCustomer(false);
            setToast(`${m} Search for them to add to this bill.`);
            router.refresh();
          }}
        />
      )}

      {toast && (
        <p role="status" className="anim-pop fixed inset-x-4 bottom-40 z-[60] mx-auto w-fit max-w-sm rounded-full bg-casing px-4 py-2.5 text-center text-[15px] font-medium text-white shadow-lift lg:bottom-8">
          {toast}
        </p>
      )}
    </div>
  );
}
