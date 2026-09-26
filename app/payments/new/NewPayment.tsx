"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { formatRs } from "@/lib/format";
import { formatDay, parseAmount, todayKarachi } from "@/lib/invoices";
import { friendlyPaymentError, validatePayment } from "@/lib/payments";
import { SUPPLIER_PAYMENT_METHODS } from "@/lib/purchases";
import { balanceLabel, supplierMatches } from "@/lib/suppliers";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { PurchaseInvoice, SupplierBalance, SupplierPaymentMethod } from "@/lib/types";

export default function NewPayment({
  suppliers,
  duePurchases,
  initialSupplierId,
  initialPurchaseId,
}: {
  suppliers: SupplierBalance[];
  duePurchases: PurchaseInvoice[];
  initialSupplierId: string | null;
  initialPurchaseId: string | null;
}) {
  const router = useRouter();
  const clientId = useRef(crypto.randomUUID());

  const initialPurchase = initialPurchaseId ? (duePurchases.find((p) => p.id === initialPurchaseId) ?? null) : null;
  const startSupplierId = initialPurchase?.supplier_id ?? initialSupplierId;
  const initialSupplier = startSupplierId ? (suppliers.find((s) => s.id === startSupplierId) ?? null) : null;

  // ---------- Supplier ----------
  const [supplierId, setSupplierId] = useState<string | null>(initialSupplier?.id ?? null);
  const [supplierQuery, setSupplierQuery] = useState(initialSupplier?.name ?? "");
  const [supplierListOpen, setSupplierListOpen] = useState(false);

  const supplierMatchesQuery = useMemo(
    () => (supplierQuery.trim() ? suppliers.filter((s) => supplierMatches(s, supplierQuery)) : suppliers).slice(0, 8),
    [suppliers, supplierQuery]
  );
  const selectedSupplier = supplierId ? (suppliers.find((s) => s.id === supplierId) ?? null) : null;

  function pickSupplier(s: SupplierBalance) {
    setSupplierId(s.id);
    setSupplierQuery(s.name);
    setSupplierListOpen(false);
    setPurchaseId(null);
  }
  function changeSupplierQuery(v: string) {
    setSupplierQuery(v);
    setSupplierId(null);
    setPurchaseId(null);
    setSupplierListOpen(true);
  }

  // ---------- Against a bill, or on account ----------
  const supplierDueBills = useMemo(
    () => (supplierId ? duePurchases.filter((p) => p.supplier_id === supplierId) : []),
    [duePurchases, supplierId]
  );
  const [purchaseId, setPurchaseId] = useState<string | null>(initialPurchase?.id ?? null);
  const selectedPurchase = purchaseId ? (duePurchases.find((p) => p.id === purchaseId) ?? null) : null;

  function choosePurchase(p: PurchaseInvoice | null) {
    setPurchaseId(p?.id ?? null);
    setAmountText(p ? String(p.due_total) : "");
  }

  // ---------- Amount, date, method ----------
  const [amountText, setAmountText] = useState(initialPurchase ? String(initialPurchase.due_total) : "");
  const [paidAt, setPaidAt] = useState(todayKarachi());
  const [method, setMethod] = useState<SupplierPaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState(todayKarachi());
  const [bankName, setBankName] = useState("");

  const [errors, setErrors] = useState<ReturnType<typeof validatePayment>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const showCheque = method === "cheque";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errs = validatePayment({
      supplierId,
      amountText,
      dueTotal: selectedPurchase ? selectedPurchase.due_total : null,
      paidAt,
      method,
      chequeNumber,
    });
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setSaveError("Some fields need attention. They are marked in red.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    const online = await checkRealConnectivity();
    if (!online) {
      setSaveError("Recording a payment needs a connection, so balances update reliably. Try again once you're back online.");
      setSaving(false);
      return;
    }

    try {
      const supabase = await getBrowserClient();
      const { data, error } = await supabase.rpc("record_supplier_payment", {
        p_client_id: clientId.current,
        p_supplier_id: supplierId,
        p_purchase_id: purchaseId,
        p_amount: parseAmount(amountText),
        p_method: method,
        p_paid_at: paidAt,
        p_reference: reference.trim() || null,
        p_cheque_number: method === "cheque" ? chequeNumber.trim() || null : null,
        p_cheque_date: method === "cheque" ? chequeDate : null,
        p_bank_name: method === "cheque" ? bankName.trim() || null : null,
      });

      if (error) {
        setSaveError(friendlyPaymentError(error));
        setSaving(false);
        return;
      }
      router.push(`/print/payment/${data}`);
    } catch {
      setSaveError("The connection dropped partway through. Check Payments before saving again, so it isn't paid twice.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Make payment" subtitle="Pay a supplier against one bill, or on account" />

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
        {/* Supplier */}
        <section className="card p-5">
          <h2 className="font-display text-xl font-semibold">Supplier</h2>
          <div className="relative mt-3">
            <label htmlFor="supplier-query" className="sr-only">
              Supplier
            </label>
            <input
              id="supplier-query"
              type="text"
              autoComplete="off"
              value={supplierQuery}
              onChange={(e) => changeSupplierQuery(e.target.value)}
              onFocus={() => setSupplierListOpen(true)}
              placeholder="Search a supplier"
              aria-invalid={errors.supplier ? true : undefined}
              className="input"
            />
            {supplierListOpen && supplierMatchesQuery.length > 0 && (
              <ul className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl border border-line bg-white shadow-lift">
                {supplierMatchesQuery.map((s) => {
                  const { text, tone } = balanceLabel(s.balance);
                  const cls = tone === "owe" ? "text-terminal-deep" : tone === "advance" ? "text-cell-deep" : "text-lead";
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => pickSupplier(s)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-plate">
                        <span>
                          <span className="block font-medium">{s.name}</span>
                          {s.phone && <span className="block text-sm text-lead">{s.phone}</span>}
                        </span>
                        <span className={`text-sm font-semibold tabular-nums ${cls}`}>{text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {errors.supplier && <p className="mt-1.5 text-sm text-terminal-deep">{errors.supplier}</p>}
        </section>

        {/* Against a bill, or on account */}
        {selectedSupplier && (
          <section className="card space-y-3 p-5">
            <h2 className="font-display text-xl font-semibold">What is this for</h2>
            {supplierDueBills.length === 0 ? (
              <p className="text-[15px] text-lead">
                No unpaid bills for {selectedSupplier.name}. This will be recorded on account
                {selectedSupplier.balance > 0 ? `, against the ${formatRs(selectedSupplier.balance)} owed overall` : ""}.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => choosePurchase(null)}
                    aria-pressed={!purchaseId}
                    className={`rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                      !purchaseId ? "border-casing bg-casing text-white" : "border-line bg-white text-lead hover:border-lead/40"
                    }`}
                  >
                    On account
                  </button>
                  {supplierDueBills.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => choosePurchase(p)}
                      aria-pressed={purchaseId === p.id}
                      className={`rounded-full border px-4 py-2 text-[15px] font-medium tabular-nums transition-colors ${
                        purchaseId === p.id ? "border-casing bg-casing text-white" : "border-line bg-white text-lead hover:border-lead/40"
                      }`}
                    >
                      {p.purchase_number} · {formatRs(p.due_total)} due
                    </button>
                  ))}
                </div>
                <p className="text-sm text-lead">
                  {selectedPurchase
                    ? `Against ${selectedPurchase.purchase_number}, dated ${formatDay(selectedPurchase.invoice_date)}. Up to ${formatRs(selectedPurchase.due_total)} due.`
                    : "A general payment to this supplier, not tied to one bill."}
                </p>
              </>
            )}
          </section>
        )}

        {/* Amount, date */}
        <section className="card space-y-4 p-5">
          <h2 className="font-display text-xl font-semibold">Amount</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="amount" className="mb-1.5 block text-sm font-medium">
                Amount paid (Rs)
              </label>
              <input
                id="amount"
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0"
                aria-invalid={errors.amount ? true : undefined}
                className="input tabular-nums"
              />
              {selectedPurchase && (
                <button type="button" onClick={() => setAmountText(String(selectedPurchase.due_total))} className="mt-1.5 text-sm font-semibold text-focus hover:underline">
                  Pay everything due
                </button>
              )}
              {errors.amount && <p className="mt-1 text-sm text-terminal-deep">{errors.amount}</p>}
            </div>
            <div>
              <label htmlFor="paid-at" className="mb-1.5 block text-sm font-medium">
                Date
              </label>
              <input id="paid-at" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} max={todayKarachi()} aria-invalid={errors.paid_at ? true : undefined} className="input" />
              {errors.paid_at && <p className="mt-1 text-sm text-terminal-deep">{errors.paid_at}</p>}
            </div>
          </div>
        </section>

        {/* Method */}
        <section className="card space-y-4 p-5">
          <h2 className="font-display text-xl font-semibold">Method</h2>
          <div className="flex flex-wrap gap-2">
            {SUPPLIER_PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                aria-pressed={method === m.value}
                className={`rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                  method === m.value ? "border-casing bg-casing text-white" : "border-line bg-white text-lead hover:border-lead/40"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {showCheque && (
            <div className="grid grid-cols-1 gap-3 rounded-2xl bg-plate/60 p-3.5 sm:grid-cols-3">
              <div>
                <label htmlFor="cheque-number" className="mb-1.5 block text-sm font-medium">
                  Cheque number
                </label>
                <input id="cheque-number" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} aria-invalid={errors.cheque_number ? true : undefined} className="input" />
                {errors.cheque_number && <p className="mt-1 text-xs text-terminal-deep">{errors.cheque_number}</p>}
              </div>
              <div>
                <label htmlFor="cheque-date" className="mb-1.5 block text-sm font-medium">
                  Cheque date
                </label>
                <input id="cheque-date" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="bank-name" className="mb-1.5 block text-sm font-medium">
                  Bank
                </label>
                <input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} className="input" />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="reference" className="mb-1.5 block text-sm font-medium">
              Reference (optional)
            </label>
            <input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID, receipt no., etc." className="input" />
          </div>
        </section>

        {saveError && (
          <p role="alert" className="rounded-xl bg-terminal/10 px-3.5 py-3 text-sm text-terminal-deep">
            {saveError}
          </p>
        )}

        <div className="flex justify-end gap-3 pb-6">
          <button type="button" onClick={() => router.back()} disabled={saving} className="btn btn-quiet">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary min-w-40">
            {saving ? "Saving" : "Save payment"}
          </button>
        </div>
      </form>
    </div>
  );
}
