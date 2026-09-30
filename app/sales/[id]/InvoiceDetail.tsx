"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import { useRoleInfo } from "@/components/RoleProvider";
import { can } from "@/lib/roles";
import Sheet from "@/components/Sheet";
import Toast from "@/components/Toast";
import { formatPhone, formatRegNo, regNoKind } from "@/lib/customers";
import { formatRs } from "@/lib/format";
import { formatDay, formatTime, friendlyInvoiceError, methodLabel, parseAmount, PAYMENT_METHODS } from "@/lib/invoices";
import type { InvoiceDocument } from "@/lib/invoiceDoc";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { PaymentMethod } from "@/lib/types";
import PayBadge from "../PayBadge";
import InvoiceActions from "./InvoiceActions";
import FbrBadge from "../FbrBadge";
import FbrCard from "./FbrCard";
import { showFbrBadge, type FbrInfo } from "@/lib/fbrStatus";

const btrim = (s: string) => s.trim();

export default function InvoiceDetail({ doc, fbr = null }: { doc: InvoiceDocument; fbr?: FbrInfo | null }) {
  const roleInfo = useRoleInfo();
  const canDeleteBill = can(roleInfo, "sales.delete");
  const { invoice: inv, items, payments } = doc;
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restock, setRestock] = useState(true);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const [delBlockedByFbr, setDelBlockedByFbr] = useState(false);

  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelRestock, setCancelRestock] = useState(true);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const canReceive = inv.status !== "Cancelled" && inv.due_total > 0 && can(roleInfo, "payment.receive");
  const canCancel = can(roleInfo, "sales.delete") && inv.status !== "Cancelled";
  const wasSentToFbr = fbr?.status === "sent";
  const kind = inv.buyer_cnic_or_ntn ? regNoKind(inv.buyer_cnic_or_ntn) : null;

  function openPayment() {
    setAmountText(String(inv.due_total));
    setMethod("cash");
    setError(null);
    setPaying(true);
  }

  async function savePayment(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const amount = parseAmount(amountText);
    if (amount == null || amount <= 0) {
      setError("Enter an amount greater than zero, with up to 2 decimals.");
      return;
    }
    if (amount > inv.due_total) {
      setError(`That is more than the amount due (${formatRs(inv.due_total)}).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = await getBrowserClient();
      const { error: dbError } = await supabase.rpc("record_payment", {
        p_invoice_id: inv.id,
        p_amount: amount,
        p_method: method,
      });
      if (dbError) {
        setError(friendlyInvoiceError(dbError));
        setBusy(false);
        return;
      }
      setPaying(false);
      setBusy(false);
      setToast(`${formatRs(amount)} received.`);
      router.refresh();
    } catch {
      setError("The connection dropped. Refresh this page to see if the payment was saved before you try again.");
      setBusy(false);
    }
  }

  function openDelete() {
    setRestock(true);
    setDelError(null);
    setDelBlockedByFbr(false);
    setDeleting(true);
  }

  function openCancel() {
    setCancelReason("");
    setCancelRestock(true);
    setCancelError(null);
    setCancelling(true);
  }

  async function cancelBill() {
    if (cancelBusy) return;
    if (btrim(cancelReason) === "") {
      setCancelError("Enter a reason for cancelling this bill.");
      return;
    }
    setCancelBusy(true);
    setCancelError(null);
    try {
      const supabase = await getBrowserClient();
      const { error: dbError } = await supabase.rpc("cancel_invoice", {
        p_invoice_id: inv.id,
        p_reason: cancelReason,
        p_restock: cancelRestock,
      });
      if (dbError) {
        setCancelError(
          dbError.code === "42883" || dbError.code === "PGRST202"
            ? "The cancel setup is missing. Run 20_fbr_d7.sql in Supabase, then try again."
            : friendlyInvoiceError(dbError),
        );
        setCancelBusy(false);
        return;
      }
      setCancelling(false);
      setCancelBusy(false);
      router.refresh();
    } catch {
      setCancelError("The connection dropped. Refresh this page to see if the bill was cancelled before you try again.");
      setCancelBusy(false);
    }
  }

  async function deleteBill() {
    if (delBusy) return;
    setDelBusy(true);
    setDelError(null);
    try {
      const supabase = await getBrowserClient();
      const { error: dbError } = await supabase.rpc("delete_invoice", {
        p_invoice_id: inv.id,
        p_restock: restock,
      });
      if (dbError) {
        if (dbError.code === "23503" && /fbr_invoices/i.test(dbError.message)) {
          setDelBlockedByFbr(true);
          setDelError(
            "This bill was reported to FBR, so it cannot be deleted the normal way. FBR keeps its own record of it.",
          );
        } else {
          setDelError(
            dbError.code === "42883" || dbError.code === "PGRST202"
              ? "The delete setup is missing. Run 06_delete_invoice.sql in Supabase, then try again."
              : friendlyInvoiceError(dbError),
          );
        }
        setDelBusy(false);
        return;
      }
      router.replace("/sales");
      router.refresh();
    } catch {
      setDelError("The connection dropped. Refresh this page to see if the bill was deleted before you try again.");
      setDelBusy(false);
    }
  }

  /** Only for a SANDBOX test FBR bill: removes its FBR rows first, then deletes it normally. */
  async function deleteSandboxTestBill() {
    if (delBusy) return;
    setDelBusy(true);
    setDelError(null);
    try {
      const supabase = await getBrowserClient();
      const { error: dbError } = await supabase.rpc("delete_sandbox_fbr_bill", {
        p_invoice_id: inv.id,
        p_restock: restock,
      });
      if (dbError) {
        setDelError(
          dbError.code === "42883" || dbError.code === "PGRST202"
            ? "The setup for this is missing. Run 20_fbr_d7.sql in Supabase, then try again."
            : friendlyInvoiceError(dbError),
        );
        setDelBusy(false);
        return;
      }
      router.replace("/sales");
      router.refresh();
    } catch {
      setDelError("The connection dropped. Refresh this page to see if the bill was deleted before you try again.");
      setDelBusy(false);
    }
  }

  return (
    <div>
      <Link href="/sales" className="anim-rise inline-flex items-center gap-1 text-[15px] font-medium text-lead hover:text-casing">
        <Icon name="back" className="h-4 w-4" /> Sales
      </Link>

      <section className="hero-card anim-slide relative mt-3 overflow-hidden rounded-3xl p-5 text-white shadow-lift sm:p-7">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-white/70">
              {inv.invoice_type} · {formatDay(inv.invoice_date)}
            </p>
            <h1 className="mt-1 font-display text-4xl font-bold leading-none sm:text-5xl">{inv.invoice_number}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PayBadge status={inv.payment_status} bill={inv.status} onDark />
              {showFbrBadge(fbr ?? undefined, inv.status === "Cancelled") && fbr && <FbrBadge info={fbr} onDark />}
              {inv.status === "Cancelled" && <span className="text-sm text-white/70">This bill is cancelled.</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/70">Total</p>
            <p className="font-display text-4xl font-bold tabular-nums sm:text-5xl">{formatRs(inv.total_value)}</p>
            {inv.due_total > 0 && inv.status !== "Cancelled" ? (
              <p className="mt-1 font-semibold tabular-nums text-red-200">{formatRs(inv.due_total)} still due</p>
            ) : (
              <p className="mt-1 text-sm text-emerald-200">Paid in full</p>
            )}
          </div>
        </div>
        <div className="relative mt-5">
          <InvoiceActions doc={doc} onDark />
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
                    <th className="px-5 py-2.5 font-medium">Item</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">Rate</th>
                    <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-4 text-lead">
                        Udhaar entered by hand. This bill has no items, so stock did not change.
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-5 py-3">
                        <span className="font-semibold">{it.description}</span>
                        {it.hs_code && <span className="block text-xs text-lead">HS code {it.hs_code}</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{it.quantity}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatRs(it.rate)}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatRs(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="space-y-1.5 border-t border-line px-5 py-4">
              <div className="flex justify-between">
                <dt className="text-lead">Total</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">{formatRs(inv.total_value)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-lead">Paid</dt>
                <dd className="font-semibold tabular-nums">{formatRs(inv.paid_total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-lead">Still due</dt>
                <dd className={`font-semibold tabular-nums ${inv.due_total > 0 ? "text-terminal-deep" : "text-cell-deep"}`}>
                  {formatRs(inv.due_total)}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="space-y-4">
          {fbr && <FbrCard info={fbr} invoiceNumber={inv.invoice_number} cancelled={inv.status === "Cancelled"} />}
          <section className="card anim-rise p-5" style={{ "--i": 2 } as React.CSSProperties}>
            <h2 className="font-display text-2xl font-semibold">Customer</h2>
            <p className="mt-2 break-words font-semibold">
              {inv.customer_id ? (
                <Link href={`/customers/${inv.customer_id}`} className="text-focus hover:underline">
                  {inv.buyer_name}
                </Link>
              ) : (
                inv.buyer_name
              )}
            </p>
            <dl className="mt-1.5 space-y-1 text-[15px] text-lead">
              {inv.buyer_phone && <div>{formatPhone(inv.buyer_phone)}</div>}
              {inv.buyer_address && <div>{inv.buyer_address}</div>}
              <div>{inv.buyer_registration_type}</div>
              {inv.buyer_cnic_or_ntn && (
                <div className="tabular-nums">
                  {kind} {formatRegNo(inv.buyer_cnic_or_ntn)}
                </div>
              )}
            </dl>
            {inv.note && (
              <p className="mt-3 rounded-xl bg-plate/70 px-3 py-2 text-[15px]">
                <span className="text-lead">Note: </span>
                {inv.note}
              </p>
            )}
          </section>

          <section className="card anim-rise p-5" style={{ "--i": 3 } as React.CSSProperties}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">Payments</h2>
              {canReceive && (
                <button type="button" onClick={openPayment} className="btn btn-primary btn-sm">
                  <Icon name="banknote" className="h-4 w-4" /> Receive payment
                </button>
              )}
            </div>
            {payments.length === 0 ? (
              <p className="mt-2 text-lead">Nothing received yet. The full {formatRs(inv.total_value)} is udhaar.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line/60">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <span className="block font-semibold">{methodLabel(p.method)}</span>
                      <span className="block text-sm text-lead">
                        {formatDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(p.paid_at)))},{" "}
                        {formatTime(p.paid_at)}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatRs(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canCancel && (
<section className="card anim-rise p-5" style={{ "--i": 4 } as React.CSSProperties}>
            <h2 className="font-display text-2xl font-semibold">Cancel this bill</h2>
            <p className="mt-2 text-[15px] text-lead">
              {wasSentToFbr
                ? "This bill was already reported to FBR. Cancelling it here marks it cancelled in AK Solar only -- FBR keeps its own record. To correct FBR's record, use a debit note."
                : "Keeps the bill on record but marks it cancelled, and puts the items back in stock."}
            </p>
            <button type="button" onClick={openCancel} className="btn btn-danger mt-3">
              <Icon name="x" className="h-5 w-5" /> Cancel bill
            </button>
          </section>
)}

          {canDeleteBill && (
<section className="card anim-rise p-5" style={{ "--i": 5 } as React.CSSProperties}>
            <h2 className="font-display text-2xl font-semibold">Delete this bill</h2>
            <p className="mt-2 text-[15px] text-lead">
              Removes the bill, its items and its payments completely. Use this for demo or test bills.
            </p>
            <button type="button" onClick={openDelete} className="btn btn-danger mt-3">
              <Icon name="trash" className="h-5 w-5" /> Delete bill
            </button>
          </section>
)}
        </div>
      </div>

      {paying && (
        <Sheet onClose={() => !busy && setPaying(false)} labelledBy="pay-title">
          <form onSubmit={savePayment} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 id="pay-title" className="font-display text-3xl font-bold">
                Receive payment
              </h2>
              <button
                type="button"
                onClick={() => setPaying(false)}
                aria-label="Close"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-lead hover:bg-plate"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">
              <p className="text-lead">
                {inv.buyer_name} owes <span className="font-semibold text-terminal-deep">{formatRs(inv.due_total)}</span> on {inv.invoice_number}.
              </p>
              <div>
                <label htmlFor="pay-amount" className="text-sm font-medium text-lead">
                  Amount received (Rs)
                </label>
                <input
                  id="pay-amount"
                  autoFocus
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  className="input mt-1.5 tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setAmountText(String(inv.due_total))}
                  className="mt-1.5 text-sm font-semibold text-focus hover:underline"
                >
                  Pay everything due
                </button>
              </div>
              <div>
                <label htmlFor="pay-method" className="text-sm font-medium text-lead">
                  Payment method
                </label>
                <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="input mt-1.5">
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {error && (
                <p role="alert" className="rounded-xl bg-terminal/10 px-3 py-2.5 text-[15px] text-terminal-deep">
                  {error}
                </p>
              )}
            </div>
            <div className="pb-safe flex justify-end gap-3 border-t border-line px-5 py-4">
              <button type="button" onClick={() => setPaying(false)} disabled={busy} className="btn btn-quiet">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? "Saving" : "Save payment"}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {deleting && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-title"
            aria-describedby="del-text"
            className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <h2 id="del-title" className="font-display text-2xl font-bold">
              Delete {inv.invoice_number}?
            </h2>
            <p id="del-text" className="mt-2 text-lead">
              This permanently deletes the bill for {inv.buyer_name} ({formatRs(inv.total_value)}) with all its items
              and payments. It cannot be undone.
            </p>
            <label className="mt-4 flex items-start gap-3 rounded-xl bg-plate/70 px-3 py-3 text-[15px]">
              <input
                type="checkbox"
                checked={restock}
                onChange={(e) => setRestock(e.target.checked)}
                disabled={delBusy}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="block font-semibold">Put the items back in stock</span>
                <span className="block text-lead">Turn this off only if the goods really left the shop.</span>
              </span>
            </label>
            {delError && (
              <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
                {delError}
              </p>
            )}
            {delBlockedByFbr && fbr?.environment === "sandbox" && (
              <p className="mt-2 text-sm text-lead">
                This looks like a sandbox test bill. You can remove its test FBR rows and delete it below.
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleting(false)} disabled={delBusy} autoFocus className="btn btn-quiet">
                Keep it
              </button>
              {delBlockedByFbr && fbr?.environment === "sandbox" ? (
                <button type="button" onClick={deleteSandboxTestBill} disabled={delBusy} className="btn btn-danger">
                  {delBusy ? "Deleting" : "Delete test FBR bill"}
                </button>
              ) : (
                <button type="button" onClick={deleteBill} disabled={delBusy} className="btn btn-danger">
                  {delBusy ? "Deleting" : "Delete bill"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {cancelling && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            aria-describedby="cancel-text"
            className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <h2 id="cancel-title" className="font-display text-2xl font-bold">
              Cancel {inv.invoice_number}?
            </h2>
            <p id="cancel-text" className="mt-2 text-lead">
              {inv.buyer_name}, {formatRs(inv.total_value)}. The bill stays on record, marked cancelled.
              {wasSentToFbr && " This bill was already reported to FBR -- FBR's own record is not changed by this."}
            </p>
            <label htmlFor="cancel-reason" className="mt-4 block text-sm font-medium text-lead">
              Reason
            </label>
            <input
              id="cancel-reason"
              autoFocus
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={cancelBusy}
              placeholder="e.g. Customer changed their mind"
              className="input mt-1.5"
            />
            <label className="mt-4 flex items-start gap-3 rounded-xl bg-plate/70 px-3 py-3 text-[15px]">
              <input
                type="checkbox"
                checked={cancelRestock}
                onChange={(e) => setCancelRestock(e.target.checked)}
                disabled={cancelBusy}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="block font-semibold">Put the items back in stock</span>
                <span className="block text-lead">Turn this off only if the goods really left the shop.</span>
              </span>
            </label>
            {cancelError && (
              <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
                {cancelError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setCancelling(false)} disabled={cancelBusy} className="btn btn-quiet">
                Keep it
              </button>
              <button type="button" onClick={cancelBill} disabled={cancelBusy} className="btn btn-danger">
                {cancelBusy ? "Cancelling" : "Cancel bill"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
