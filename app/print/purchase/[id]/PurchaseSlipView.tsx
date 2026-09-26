"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icons";
import { formatRs } from "@/lib/format";
import { formatDay, formatTime } from "@/lib/invoices";
import { supplierMethodLabel } from "@/lib/purchases";
import type { PurchaseDocument } from "@/lib/purchaseDoc";

/** The purchase bill as it looks on paper (A4) -- an internal record for the shop's own files, not
 * something handed to the supplier. "Print" also offers Save as PDF on every phone and computer. */
export default function PurchaseSlipView({ doc }: { doc: PurchaseDocument }) {
  const { purchase: p, items, payments, supplier, seller } = doc;
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("auto") !== "1") return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [params]);

  return (
    <div className="px-3 pb-10 pt-4 sm:px-6 print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2">
        <Link href={`/purchases/${p.id}`} className="btn btn-quiet">
          <Icon name="back" className="h-5 w-5" /> Back to bill
        </Link>
        <button type="button" onClick={() => window.print()} className="btn btn-primary">
          <Icon name="printer" className="h-5 w-5" /> Print
        </button>
        <p className="w-full text-sm text-lead">To save a PDF from the print box, choose Save as PDF as the printer.</p>
      </div>

      <article className="mx-auto max-w-[210mm] rounded-lg border border-line bg-white p-5 text-[13px] leading-snug shadow-card sm:p-[12mm] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-casing pb-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold leading-none">{seller.business_name}</h1>
            {seller.address && <p className="mt-1.5">{seller.address}</p>}
            <p className="mt-0.5 text-lead">
              {[seller.phone, seller.ntn ? `NTN ${seller.ntn}` : null].filter(Boolean).join("   ")}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-bold leading-none">Purchase Bill</p>
            <p className="mt-1.5 text-base font-semibold tabular-nums">{p.purchase_number}</p>
            <p className="tabular-nums text-lead">{formatDay(p.invoice_date)}</p>
            {p.status === "Cancelled" && <p className="mt-1 font-bold text-terminal">CANCELLED</p>}
          </div>
        </header>

        <section className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-lead">Received from</p>
          <p className="mt-1 text-base font-bold">{supplier.name}</p>
          {supplier.phone && <p>{supplier.phone}</p>}
          {supplier.address && <p>{supplier.address}</p>}
          {supplier.ntn_or_cnic && <p className="tabular-nums">NTN/CNIC {supplier.ntn_or_cnic}</p>}
          {p.supplier_invoice_number && <p>Their invoice number: {p.supplier_invoice_number}</p>}
          {p.note && <p className="mt-1">Note: {p.note}</p>}
        </section>

        <table className="mt-5 w-full text-left">
          <thead>
            <tr className="bg-plate text-[12px]">
              <th className="w-8 px-2 py-2 font-bold">#</th>
              <th className="px-2 py-2 font-bold">Product</th>
              <th className="px-2 py-2 text-right font-bold">Qty</th>
              <th className="px-2 py-2 text-right font-bold">Cost</th>
              <th className="px-2 py-2 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="break-inside-avoid border-b border-line/80">
                <td className="px-2 py-2 align-top tabular-nums">{i + 1}</td>
                <td className="px-2 py-2 align-top">{it.description}</td>
                <td className="px-2 py-2 text-right align-top tabular-nums">{it.quantity}</td>
                <td className="px-2 py-2 text-right align-top tabular-nums">{formatRs(it.unit_cost)}</td>
                <td className="px-2 py-2 text-right align-top font-bold tabular-nums">{formatRs(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="w-64 space-y-1 break-inside-avoid">
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
            <div className="flex items-baseline justify-between">
              <dt className="text-base font-bold">Total</dt>
              <dd className="text-xl font-bold tabular-nums">{formatRs(p.total_value)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-lead">Paid</dt>
              <dd className="tabular-nums">{formatRs(p.paid_total)}</dd>
            </div>
            {p.due_total > 0 ? (
              <div className="flex justify-between rounded bg-plate px-2 py-1.5 font-bold">
                <dt>Balance owed</dt>
                <dd className="tabular-nums">{formatRs(p.due_total)}</dd>
              </div>
            ) : (
              <p className="pt-1 font-bold">Paid in full</p>
            )}
          </dl>
        </div>

        {payments.length > 0 && (
          <section className="mt-5 break-inside-avoid">
            <p className="text-[11px] font-bold uppercase tracking-widest text-lead">Payments made</p>
            <ul className="mt-1 space-y-0.5">
              {payments.map((pay) => (
                <li key={pay.id} className="flex max-w-xs justify-between tabular-nums">
                  <span>
                    {formatDay(pay.paid_at)}, {formatTime(pay.created_at)} · {supplierMethodLabel(pay.method)}
                  </span>
                  <span>{formatRs(pay.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-8 border-t border-line pt-3 text-center text-lead">Internal record -- not a document for the supplier.</footer>
      </article>
    </div>
  );
}
