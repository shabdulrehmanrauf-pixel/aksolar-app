"use client";

import { useEffect, useState } from "react";
import { useRoleInfo } from "@/components/RoleProvider";
import { can } from "@/lib/roles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import Toast from "@/components/Toast";
import { formatRs } from "@/lib/format";
import { formatDay, formatTime } from "@/lib/invoices";
import { friendlyPurchaseError, supplierMethodLabel } from "@/lib/purchases";
import type { PurchaseDocument } from "@/lib/purchaseDoc";
import { getBrowserClient } from "@/lib/supabase/lazy";
import PurchasePayBadge from "../PayBadge";
import PurchaseActions from "./PurchaseActions";

export default function PurchaseDetail({ purchase: p, items, payments, supplier }: PurchaseDocument) {
  const roleInfo = useRoleInfo();
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function openCancel() {
    setReason("");
    setError(null);
    setCancelling(true);
  }

  async function confirmCancel() {
    if (busy) return;
    if (!reason.trim()) {
      setError("Say why this bill is being cancelled -- it's kept with the bill for the record.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = await getBrowserClient();
      const { error: dbError } = await supabase.rpc("cancel_purchase", { p_purchase_id: p.id, p_reason: reason.trim() });
      if (dbError) {
        setError(friendlyPurchaseError(dbError));
        setBusy(false);
        return;
      }
      router.replace("/purchases");
      router.refresh();
    } catch {
      setError("The connection dropped. Refresh this page to see if it was cancelled before you try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <Link href="/purchases" className="anim-rise inline-flex items-center gap-1 text-[15px] font-medium text-lead hover:text-casing">
        <Icon name="back" className="h-4 w-4" /> Purchases
      </Link>

      <section className="hero-card anim-slide relative mt-3 overflow-hidden rounded-3xl p-5 text-white shadow-lift sm:p-7">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-white/70">
              Purchase bill · {formatDay(p.invoice_date)}
              {p.supplier_invoice_number ? ` · Their inv ${p.supplier_invoice_number}` : ""}
            </p>
            <h1 className="mt-1 font-display text-4xl font-bold leading-none sm:text-5xl">{p.purchase_number}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PurchasePayBadge tag={p.payment_tag} status={p.status} />
              {p.status === "Cancelled" && <span className="text-sm text-white/70">This bill is cancelled.</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/70">Total</p>
            <p className="font-display text-4xl font-bold tabular-nums sm:text-5xl">{formatRs(p.total_value)}</p>
            {p.status !== "Cancelled" && p.due_total > 0 ? (
              <p className="mt-1 font-semibold tabular-nums text-red-200">{formatRs(p.due_total)} still owed</p>
            ) : (
              <p className="mt-1 text-sm text-emerald-200">Paid in full</p>
            )}
          </div>
        </div>
        <div className="relative mt-5">
          <PurchaseActions purchase={p} onDark />
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="card anim-rise overflow-hidden" style={{ "--i": 1 } as React.CSSProperties}>
            <h2 className="px-5 pb-2 pt-5 font-display text-2xl font-semibold">Items</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left">
                <thead className="bg-plate/70 text-sm text-lead">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Product</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                    <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-5 py-3 font-semibold">{it.description}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{it.quantity}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatRs(it.unit_cost)}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatRs(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="space-y-1.5 border-t border-line px-5 py-4">
              <div className="flex justify-between">
                <dt className="text-lead">Subtotal</dt>
                <dd className="tabular-nums">{formatRs(p.subtotal)}</dd>
              </div>
              {p.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-lead">Discount</dt>
                  <dd className="tabular-nums">-{formatRs(p.discount)}</dd>
                </div>
              )}
              {p.freight > 0 && (
                <div className="flex justify-between">
                  <dt className="text-lead">Freight</dt>
                  <dd className="tabular-nums">+{formatRs(p.freight)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-lead">Total</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">{formatRs(p.total_value)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-lead">Paid</dt>
                <dd className="font-semibold tabular-nums">{formatRs(p.paid_total)}</dd>
              </div>
              {p.status !== "Cancelled" && p.due_total > 0 && (
                <div className="flex justify-between">
                  <dt className="font-semibold text-terminal-deep">Still owed</dt>
                  <dd className="font-semibold tabular-nums text-terminal-deep">{formatRs(p.due_total)}</dd>
                </div>
              )}
            </dl>
            {p.status === "Cancelled" && p.cancel_reason && (
              <p className="border-t border-line bg-plate/50 px-5 py-3 text-sm text-lead">
                Cancelled{p.cancelled_at ? ` on ${formatDay(p.cancelled_at)}` : ""}: {p.cancel_reason}
              </p>
            )}
          </section>

          {p.status !== "Cancelled" && can(roleInfo, "purchases.manage") && (
            <section className="card anim-rise p-5" style={{ "--i": 4 } as React.CSSProperties}>
              <h2 className="font-display text-2xl font-semibold">Cancel this bill</h2>
              <p className="mt-2 text-[15px] text-lead">
                Reverses the stock this bill added. Refused if any of it has already been sold. Any payment already
                made stays recorded, as an advance.
              </p>
              <button type="button" onClick={openCancel} className="btn btn-danger mt-3">
                <Icon name="x" className="h-5 w-5" /> Cancel bill
              </button>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="card anim-rise p-5" style={{ "--i": 2 } as React.CSSProperties}>
            <h2 className="font-display text-lg font-semibold text-lead">Supplier</h2>
            <p className="mt-1 font-display text-2xl font-bold">
              <Link href={`/suppliers/${supplier.id}`} className="text-focus hover:underline">
                {supplier.name}
              </Link>
            </p>
            <dl className="mt-1.5 space-y-1 text-[15px] text-lead">
              {supplier.phone && <div>{supplier.phone}</div>}
              {supplier.address && <div>{supplier.address}</div>}
            </dl>
            {p.note && (
              <p className="mt-3 rounded-xl bg-plate/70 px-3 py-2 text-[15px]">
                <span className="text-lead">Note: </span>
                {p.note}
              </p>
            )}
          </section>

          <section className="card anim-rise p-5" style={{ "--i": 3 } as React.CSSProperties}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">Payments</h2>
              {p.status !== "Cancelled" && p.due_total > 0 && (
                <Link href={`/payments/new?purchase=${p.id}`} className="btn btn-primary btn-sm">
                  <Icon name="banknote" className="h-4 w-4" /> Record payment
                </Link>
              )}
            </div>
            {payments.length === 0 ? (
              <p className="mt-2 text-lead">
                Nothing paid yet. The full {formatRs(p.total_value)} is owed to {supplier.name}.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line/60">
                {payments.map((pay) => (
                  <li key={pay.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <span className="block font-semibold">
                        {supplierMethodLabel(pay.method)}
                        {pay.status === "Cancelled" && <span className="ml-2 font-normal text-lead">Cancelled</span>}
                      </span>
                      <span className="block text-sm text-lead">
                        {formatDay(pay.paid_at)}, {formatTime(pay.created_at)}
                      </span>
                    </span>
                    <span className={`font-semibold tabular-nums ${pay.status === "Cancelled" ? "text-lead line-through" : ""}`}>
                      {formatRs(pay.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {cancelling && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="cancel-title" className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="cancel-title" className="font-display text-2xl font-bold">
              Cancel {p.purchase_number}?
            </h2>
            <p className="mt-2 text-lead">
              This permanently marks the bill cancelled and reverses its stock. It cannot be undone.
            </p>
            <label htmlFor="cancel-reason" className="mt-4 block text-sm font-medium">
              Reason
            </label>
            <input
              id="cancel-reason"
              type="text"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Entered by mistake, wrong supplier"
              className="input mt-1.5"
            />
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setCancelling(false)} disabled={busy} className="btn btn-quiet">
                Keep it
              </button>
              <button type="button" onClick={confirmCancel} disabled={busy} className="btn btn-danger">
                {busy ? "Cancelling" : "Cancel bill"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
