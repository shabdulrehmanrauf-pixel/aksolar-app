"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icons";
import { formatPhone, formatRegNo, regNoKind } from "@/lib/customers";
import { formatRs } from "@/lib/format";
import { formatDay, formatTime, methodLabel } from "@/lib/invoices";
import type { InvoiceDocument } from "@/lib/invoiceDoc";

/** The bill as it looks on paper (A4). "Print" also offers Save as PDF on every phone and computer. */
export default function PrintView({ doc }: { doc: InvoiceDocument }) {
  const { invoice: inv, items, payments, seller } = doc;
  const params = useSearchParams();
  const [pdfNote, setPdfNote] = useState<string | null>(null);

  // Opened from "Save and print" or "Print": open the print box once the page has drawn.
  useEffect(() => {
    if (params.get("auto") !== "1") return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [params]);

  async function downloadPdf() {
    setPdfNote(null);
    try {
      const { invoicePdfFile } = await import("@/lib/pdf");
      const file = invoicePdfFile(doc);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setPdfNote("The PDF could not be made. Use Print and choose Save as PDF instead.");
    }
  }

  const kind = inv.buyer_cnic_or_ntn ? regNoKind(inv.buyer_cnic_or_ntn) : null;

  return (
    <div className="px-3 pb-10 pt-4 sm:px-6 print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2">
        <Link href={`/sales/${inv.id}`} className="btn btn-quiet">
          <Icon name="back" className="h-5 w-5" /> Back to bill
        </Link>
        <button type="button" onClick={() => window.print()} className="btn btn-primary">
          <Icon name="printer" className="h-5 w-5" /> Print
        </button>
        <button type="button" onClick={downloadPdf} className="btn btn-quiet">
          <Icon name="download" className="h-5 w-5" /> Download PDF
        </button>
        {pdfNote && <p className="w-full text-sm text-terminal-deep">{pdfNote}</p>}
        <p className="w-full text-sm text-lead">To save a PDF from the print box, choose Save as PDF as the printer.</p>
      </div>

      <article className="mx-auto max-w-[210mm] rounded-lg border border-line bg-white p-5 text-[13px] leading-snug shadow-card sm:p-[12mm] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-casing pb-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold leading-none">{seller.business_name}</h1>
            {seller.address && <p className="mt-1.5">{seller.address}</p>}
            <p className="mt-0.5 text-lead">
              {[seller.phone ? formatPhone(seller.phone) : null, seller.ntn ? `NTN ${seller.ntn}` : null].filter(Boolean).join("   ")}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-bold leading-none">Sale Invoice</p>
            <p className="mt-1.5 text-base font-semibold tabular-nums">{inv.invoice_number}</p>
            <p className="tabular-nums text-lead">{formatDay(inv.invoice_date)}</p>
            {inv.status === "Cancelled" && <p className="mt-1 font-bold text-terminal">CANCELLED</p>}
          </div>
        </header>

        <section className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-lead">Billed to</p>
          <p className="mt-1 text-base font-bold">{inv.buyer_name}</p>
          {inv.buyer_phone && <p>{formatPhone(inv.buyer_phone)}</p>}
          {inv.buyer_address && <p>{inv.buyer_address}</p>}
          {inv.buyer_cnic_or_ntn && (
            <p className="tabular-nums">
              {kind} {formatRegNo(inv.buyer_cnic_or_ntn)}
            </p>
          )}
          {inv.note && <p className="mt-1">Note: {inv.note}</p>}
        </section>

        <table className="mt-5 w-full text-left">
          <thead>
            <tr className="bg-plate text-[12px]">
              <th className="w-8 px-2 py-2 font-bold">#</th>
              <th className="px-2 py-2 font-bold">Item</th>
              <th className="px-2 py-2 text-right font-bold">Qty</th>
              <th className="px-2 py-2 text-right font-bold">Rate</th>
              <th className="px-2 py-2 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="break-inside-avoid border-b border-line/80">
                <td className="px-2 py-2 align-top tabular-nums">{i + 1}</td>
                <td className="px-2 py-2 align-top">
                  {it.description}
                  {it.hs_code && <span className="block text-[11px] text-lead">HS code {it.hs_code}</span>}
                </td>
                <td className="px-2 py-2 text-right align-top tabular-nums">{it.quantity}</td>
                <td className="px-2 py-2 text-right align-top tabular-nums">{formatRs(it.rate)}</td>
                <td className="px-2 py-2 text-right align-top font-bold tabular-nums">{formatRs(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="w-64 space-y-1 break-inside-avoid">
            <div className="flex items-baseline justify-between">
              <dt className="text-base font-bold">Total</dt>
              <dd className="text-xl font-bold tabular-nums">{formatRs(inv.total_value)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-lead">Paid</dt>
              <dd className="tabular-nums">{formatRs(inv.paid_total)}</dd>
            </div>
            {inv.due_total > 0 ? (
              <div className="flex justify-between rounded bg-plate px-2 py-1.5 font-bold">
                <dt>Balance due</dt>
                <dd className="tabular-nums">{formatRs(inv.due_total)}</dd>
              </div>
            ) : (
              <p className="pt-1 font-bold">Paid in full</p>
            )}
          </dl>
        </div>

        {payments.length > 0 && (
          <section className="mt-5 break-inside-avoid">
            <p className="text-[11px] font-bold uppercase tracking-widest text-lead">Payments received</p>
            <ul className="mt-1 space-y-0.5">
              {payments.map((p) => (
                <li key={p.id} className="flex max-w-xs justify-between tabular-nums">
                  <span>
                    {formatDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(p.paid_at)))},{" "}
                    {formatTime(p.paid_at)} · {methodLabel(p.method)}
                  </span>
                  <span>{formatRs(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-8 border-t border-line pt-3 text-center text-lead">Thank you for your business.</footer>
      </article>
    </div>
  );
}
