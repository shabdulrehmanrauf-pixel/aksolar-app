"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Toast from "@/components/Toast";
import { formatRs } from "@/lib/format";
import { formatDay } from "@/lib/invoices";
import { friendlyPaymentError, paymentMatches } from "@/lib/payments";
import { balanceLabel, supplierMatches } from "@/lib/suppliers";
import { friendlyPurchaseError, purchaseMatches, supplierMethodLabel } from "@/lib/purchases";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { PaymentDetails, PurchaseInvoice, SupplierBalance } from "@/lib/types";
import PurchasePayBadge from "../purchases/PayBadge";

type Tab = "payments" | "purchases" | "suppliers";

const TABS: { value: Tab; label: string }[] = [
  { value: "payments", label: "Payments" },
  { value: "purchases", label: "Purchase bills" },
  { value: "suppliers", label: "Suppliers" },
];

export default function PaymentsClient({
  payments: serverPayments,
  purchases,
  suppliers,
  supplierNames,
  initialTab,
}: {
  payments: PaymentDetails[];
  purchases: PurchaseInvoice[];
  suppliers: SupplierBalance[];
  supplierNames: Record<string, string>;
  initialTab: Tab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");

  const [payments, setPayments] = useState(serverPayments);
  useEffect(() => setPayments(serverPayments), [serverPayments]);

  const [target, setTarget] = useState<PaymentDetails | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function askCancel(p: PaymentDetails) {
    setReason("");
    setCancelError(null);
    setTarget(p);
  }

  async function confirmCancel() {
    if (!target || busy) return;
    if (!reason.trim()) {
      setCancelError("Say why this payment is being cancelled -- it's kept with the payment for the record.");
      return;
    }
    setBusy(true);
    setCancelError(null);

    const online = await checkRealConnectivity();
    if (!online) {
      setCancelError("Cancelling a payment needs a connection, so balances stay correct. Try again once you're back online.");
      setBusy(false);
      return;
    }

    try {
      const supabase = await getBrowserClient();
      const { error } = await supabase.rpc("cancel_supplier_payment", { p_payment_id: target.id, p_reason: reason.trim() });
      if (error) {
        setCancelError(friendlyPaymentError(error));
        setBusy(false);
        return;
      }
      setToast(`${target.payment_number} cancelled.`);
      setTarget(null);
      setBusy(false);
      router.refresh();
    } catch {
      setCancelError("The connection dropped. Refresh this page to see if it was cancelled before you try again.");
      setBusy(false);
    }
  }

  const shownPayments = useMemo(() => payments.filter((p) => paymentMatches(p, query)), [payments, query]);
  const shownPurchasesAll = useMemo(
    () => purchases.filter((p) => purchaseMatches(p, supplierNames[p.supplier_id] ?? "", query)),
    [purchases, supplierNames, query]
  );
  const duePurchases = useMemo(() => shownPurchasesAll.filter((p) => p.status !== "Cancelled" && p.due_total > 0), [shownPurchasesAll]);
  const shownSuppliers = useMemo(() => suppliers.filter((s) => supplierMatches(s, query)), [suppliers, query]);

  const totalPaidShown = shownPayments.filter((p) => p.status !== "Cancelled").reduce((s, p) => s + p.amount, 0);
  const totalDueShown = duePurchases.reduce((s, p) => s + p.due_total, 0);

  const placeholder =
    tab === "payments"
      ? "Search payment no., supplier, bill or reference"
      : tab === "purchases"
        ? "Search bill no., supplier, or their invoice no."
        : "Search supplier name, phone or address";

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={payments.length === 0 ? "Money paid to suppliers will appear here." : `${payments.length} payments recorded`}
        action={
          <Link href="/payments/new" className="btn btn-primary">
            <Icon name="plus" className="h-5 w-5" /> Make payment
          </Link>
        }
      />

      <div className="anim-rise mt-6 space-y-3">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              aria-pressed={tab === t.value}
              className={`shrink-0 rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                tab === t.value
                  ? "border-casing bg-casing text-white shadow-sm"
                  : "border-line bg-white text-lead hover:border-lead/40 hover:text-casing"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:max-w-md">
          <label htmlFor="payments-search" className="sr-only">
            Search
          </label>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
          <input
            id="payments-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="input pl-11"
          />
        </div>
      </div>

      {tab === "payments" && (
        <>
          {payments.length === 0 ? (
            <section className="card anim-rise mt-6 px-6 py-12 text-center">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-cell/10 text-cell">
                <Icon name="banknote" className="h-7 w-7" />
              </span>
              <h2 className="mt-4 font-display text-3xl font-semibold">No payments yet</h2>
              <p className="mx-auto mt-2 max-w-md text-lead">
                Pay a supplier against one bill, or pay them on account. Either way it shows up here and in their ledger.
              </p>
              <Link href="/payments/new" className="btn btn-primary mt-6">
                Make first payment
              </Link>
            </section>
          ) : shownPayments.length === 0 ? (
            <div className="card mt-4 px-6 py-12 text-center">
              <p className="font-display text-2xl font-semibold">Nothing matches</p>
              <p className="mt-2 text-lead">Try a different search.</p>
            </div>
          ) : (
            <>
              <dl className="anim-rise mt-4 grid grid-cols-1 gap-3 sm:max-w-xs">
                <div className="card p-3.5">
                  <dt className="text-xs text-lead sm:text-sm">Total shown</dt>
                  <dd className="font-display text-xl font-semibold tabular-nums text-cell-deep sm:text-2xl">{formatRs(totalPaidShown)}</dd>
                </div>
              </dl>

              <div className="card anim-rise mt-4 hidden overflow-hidden md:block">
                <table className="w-full text-left text-[15px]">
                  <thead className="border-b border-line bg-plate/60 text-xs uppercase tracking-[0.1em] text-lead">
                    <tr>
                      <th className="px-5 py-3 font-medium">Payment</th>
                      <th className="px-3 py-3 font-medium">Date</th>
                      <th className="px-3 py-3 font-medium">Supplier</th>
                      <th className="px-3 py-3 font-medium">Against</th>
                      <th className="px-3 py-3 font-medium">Method</th>
                      <th className="px-3 py-3 text-right font-medium">Amount</th>
                      <th className="px-3 py-3 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {shownPayments.map((p) => (
                      <tr key={p.id} className={`transition-colors hover:bg-plate/50 ${p.status === "Cancelled" ? "opacity-60" : ""}`}>
                        <td className="px-5 py-3.5 font-semibold">{p.payment_number}</td>
                        <td className="px-3 py-3.5 tabular-nums text-lead">{formatDay(p.paid_at)}</td>
                        <td className="max-w-[14rem] truncate px-3 py-3.5 font-medium">
                          <Link href={`/suppliers/${p.supplier_id}`} className="text-focus hover:underline">
                            {p.supplier_name}
                          </Link>
                        </td>
                        <td className="px-3 py-3.5 text-lead">
                          {p.purchase_id && p.purchase_number ? (
                            <Link href={`/purchases/${p.purchase_id}`} className="text-focus hover:underline">
                              {p.purchase_number}
                            </Link>
                          ) : (
                            "On account"
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-lead">{supplierMethodLabel(p.method)}</td>
                        <td className="px-3 py-3.5 text-right font-semibold tabular-nums">{formatRs(p.amount)}</td>
                        <td className="px-3 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/print/payment/${p.id}?auto=1`}
                              aria-label={`Print voucher ${p.payment_number}`}
                              title="Print voucher"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-plate"
                            >
                              <Icon name="printer" className="h-5 w-5" />
                            </Link>
                            {p.status !== "Cancelled" && (
                              <button
                                type="button"
                                onClick={() => askCancel(p)}
                                aria-label={`Cancel payment ${p.payment_number}`}
                                title="Cancel payment"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-terminal/10 hover:text-terminal-deep"
                              >
                                <Icon name="x" className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="mt-4 space-y-2.5 md:hidden">
                {shownPayments.map((p) => (
                  <li key={p.id} className="flex items-stretch gap-2">
                    <div className={`card flex min-w-0 flex-1 items-center gap-3 p-4 ${p.status === "Cancelled" ? "opacity-60" : ""}`}>
                      <span className="min-w-0 flex-1">
                        <span className="truncate font-semibold">{p.supplier_name}</span>
                        <span className="mt-0.5 block text-sm text-lead">
                          {p.payment_number} · {formatDay(p.paid_at)}
                        </span>
                        <span className="mt-0.5 block text-sm text-lead">
                          {p.purchase_id && p.purchase_number ? p.purchase_number : "On account"} · {supplierMethodLabel(p.method)}
                          {p.status === "Cancelled" ? " · Cancelled" : ""}
                        </span>
                      </span>
                      <span className="font-display text-2xl font-semibold leading-none tabular-nums">{formatRs(p.amount)}</span>
                    </div>
                    <Link
                      href={`/print/payment/${p.id}?auto=1`}
                      aria-label={`Print voucher ${p.payment_number}`}
                      className="card inline-flex w-12 shrink-0 items-center justify-center text-lead hover:bg-plate"
                    >
                      <Icon name="printer" className="h-5 w-5" />
                    </Link>
                    {p.status !== "Cancelled" && (
                      <button
                        type="button"
                        onClick={() => askCancel(p)}
                        aria-label={`Cancel payment ${p.payment_number}`}
                        className="card inline-flex w-12 shrink-0 items-center justify-center text-lead hover:bg-terminal/10 hover:text-terminal-deep"
                      >
                        <Icon name="x" className="h-5 w-5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {payments.length >= 1000 && <p className="mt-3 text-sm text-lead">Showing the latest 1,000 payments.</p>}
            </>
          )}
        </>
      )}

      {tab === "purchases" && (
        <>
          {shownPurchasesAll.length === 0 ? (
            <div className="card anim-rise mt-6 px-6 py-12 text-center">
              <p className="font-display text-2xl font-semibold">Nothing matches</p>
              <p className="mt-2 text-lead">Try a different search, or make a purchase first.</p>
            </div>
          ) : (
            <>
              <dl className="anim-rise mt-4 grid grid-cols-1 gap-3 sm:max-w-xs">
                <div className={`card p-3.5 ${totalDueShown > 0 ? "border-terminal/30 bg-terminal/5" : ""}`}>
                  <dt className="text-xs text-lead sm:text-sm">Still owed, shown</dt>
                  <dd className={`font-display text-xl font-semibold tabular-nums sm:text-2xl ${totalDueShown > 0 ? "text-terminal-deep" : ""}`}>
                    {formatRs(totalDueShown)}
                  </dd>
                </div>
              </dl>
              <ul className="mt-4 space-y-2.5">
                {shownPurchasesAll.map((p) => (
                  <li key={p.id} className="card flex items-center gap-3 p-4">
                    <Link href={`/purchases/${p.id}`} className="min-w-0 flex-1">
                      <span className="truncate font-semibold">{supplierNames[p.supplier_id] ?? "Unknown supplier"}</span>
                      <span className="mt-0.5 block text-sm text-lead">
                        {p.purchase_number} · {formatDay(p.invoice_date)}
                      </span>
                      <span className="mt-1.5 block">
                        <PurchasePayBadge tag={p.payment_tag} status={p.status} />
                      </span>
                    </Link>
                    <div className="text-right">
                      <span className="block font-display text-2xl font-semibold leading-none tabular-nums">{formatRs(p.total_value)}</span>
                      {p.status !== "Cancelled" && p.due_total > 0 && (
                        <span className="mt-1 block text-sm font-semibold tabular-nums text-terminal-deep">{formatRs(p.due_total)} due</span>
                      )}
                    </div>
                    {p.status !== "Cancelled" && p.due_total > 0 && (
                      <Link href={`/payments/new?purchase=${p.id}`} className="btn btn-primary btn-sm shrink-0">
                        Pay
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {tab === "suppliers" && (
        <>
          {shownSuppliers.length === 0 ? (
            <div className="card anim-rise mt-6 px-6 py-12 text-center">
              <p className="font-display text-2xl font-semibold">Nothing matches</p>
              <p className="mt-2 text-lead">Try a different search.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {shownSuppliers.map((s) => {
                const { text, tone } = balanceLabel(s.balance);
                const cls = tone === "owe" ? "text-terminal-deep" : tone === "advance" ? "text-cell-deep" : "text-lead";
                return (
                  <li key={s.id} className="card flex items-center gap-3 p-4">
                    <Link href={`/suppliers/${s.id}`} className="min-w-0 flex-1">
                      <span className="truncate font-semibold">{s.name}</span>
                      {s.phone && <span className="mt-0.5 block text-sm text-lead">{s.phone}</span>}
                      <span className={`mt-1 block text-sm font-semibold tabular-nums ${cls}`}>{text}</span>
                    </Link>
                    {s.balance > 0 && (
                      <Link href={`/payments/new?supplier=${s.id}`} className="btn btn-primary btn-sm shrink-0">
                        Pay
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {target && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="cancel-pay-title" className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="cancel-pay-title" className="font-display text-2xl font-bold">
              Cancel {target.payment_number}?
            </h2>
            <p className="mt-2 text-lead">
              This marks the {formatRs(target.amount)} payment to {target.supplier_name} cancelled. It stops counting toward what's paid,
              so the balance owed goes back up. It cannot be undone.
            </p>
            <label htmlFor="cancel-pay-reason" className="mt-4 block text-sm font-medium">
              Reason
            </label>
            <input
              id="cancel-pay-reason"
              type="text"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Entered by mistake, cheque bounced"
              className="input mt-1.5"
            />
            {cancelError && (
              <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
                {cancelError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className="btn btn-quiet">
                Keep it
              </button>
              <button type="button" onClick={confirmCancel} disabled={busy} className="btn btn-danger">
                {busy ? "Cancelling" : "Cancel payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
