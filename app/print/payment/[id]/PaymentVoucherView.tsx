"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icons";
import { formatRs } from "@/lib/format";
import { formatDay, formatTime } from "@/lib/invoices";
import { supplierMethodLabel } from "@/lib/purchases";
import type { PaymentDocument } from "@/lib/paymentDoc";

/** The payment voucher as it looks on paper (A4) -- an internal record for the shop's own files.
 * "Print" also offers Save as PDF on every phone and computer. */
export default function PaymentVoucherView({ doc }: { doc: PaymentDocument }) {
  const { payment: p, supplier, purchase, seller } = doc;
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("auto") !== "1") return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [params]);

  return (
    <div className="px-3 pb-10 pt-4 sm:px-6 print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2">
        <Link href="/payments" className="btn btn-quiet">
          <Icon name="back" className="h-5 w-5" /> Back to payments
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
            <p className="font-display text-3xl font-bold leading-none">Payment Voucher</p>
            <p className="mt-1.5 text-base font-semibold tabular-nums">{p.payment_number}</p>
            <p className="tabular-nums text-lead">
              {formatDay(p.paid_at)}, {formatTime(p.created_at)}
            </p>
            {p.status === "Cancelled" && <p className="mt-1 font-bold text-terminal">CANCELLED</p>}
          </div>
        </header>

        <section className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-lead">Paid to</p>
          <p className="mt-1 text-base font-bold">{supplier.name}</p>
          {supplier.phone && <p>{supplier.phone}</p>}
          {supplier.address && <p>{supplier.address}</p>}
          {supplier.ntn_or_cnic && <p className="tabular-nums">NTN/CNIC {supplier.ntn_or_cnic}</p>}
        </section>

        <section className="mt-5 rounded-lg bg-plate p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-base font-bold">Amount paid</p>
            <p className="text-2xl font-bold tabular-nums">{formatRs(p.amount)}</p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-lead">Method</dt>
              <dd className="font-semibold">{supplierMethodLabel(p.method)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-lead">Against</dt>
              <dd className="font-semibold">
                {purchase ? (
                  <>
                    {purchase.purchase_number} <span className="font-normal text-lead">({formatDay(purchase.invoice_date)})</span>
                  </>
                ) : (
                  "On account"
                )}
              </dd>
            </div>
            {p.method === "cheque" && (
              <>
                <div>
                  <dt className="text-[11px] uppercase tracking-widest text-lead">Cheque number</dt>
                  <dd className="font-semibold tabular-nums">{p.cheque_number}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-widest text-lead">Cheque date / bank</dt>
                  <dd className="font-semibold">
                    {p.cheque_date ? formatDay(p.cheque_date) : "-"}
                    {p.bank_name ? `, ${p.bank_name}` : ""}
                  </dd>
                </div>
              </>
            )}
            {p.reference && (
              <div className="col-span-2">
                <dt className="text-[11px] uppercase tracking-widest text-lead">Reference</dt>
                <dd className="font-semibold">{p.reference}</dd>
              </div>
            )}
          </dl>
        </section>

        {purchase && (
          <section className="mt-5 break-inside-avoid">
            <p className="text-[11px] font-bold uppercase tracking-widest text-lead">Bill it was paid against</p>
            <div className="mt-1 flex justify-between tabular-nums">
              <span>
                {purchase.purchase_number}, total {formatRs(purchase.total_value)}
              </span>
              <span>{purchase.due_total > 0 ? `${formatRs(purchase.due_total)} still due` : "Now paid in full"}</span>
            </div>
          </section>
        )}

        {p.status === "Cancelled" && p.cancel_reason && (
          <p className="mt-5 rounded bg-plate px-3 py-2 text-lead">Cancelled: {p.cancel_reason}</p>
        )}

        <footer className="mt-8 border-t border-line pt-3 text-center text-lead">Internal record -- not a document for the supplier.</footer>
      </article>
    </div>
  );
}
