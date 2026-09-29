"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icons";
import { formatPhone, formatRegNo, regNoKind } from "@/lib/customers";
import { formatDate, formatRs } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import FbrQr from "@/components/FbrQr";
import FbrLogo from "@/components/FbrLogo";
import {
  FBR_PRINT_HEADER_COLUMNS,
  FBR_VERIFY_TEXT,
  computeFbrPrint,
  fbrHasNumber,
  fbrPrintHeaderFromRow,
  type FbrPrintData,
} from "@/lib/fbrPrint";
import { formatDay, formatTime, methodLabel } from "@/lib/invoices";
import type { InvoiceDocument } from "@/lib/invoiceDoc";

/** The bill as it looks on paper (A4). "Print" also offers Save as PDF on every phone and computer. */
export default function PrintView({ doc, fbr: fbrInitial = null }: { doc: InvoiceDocument; fbr?: FbrPrintData | null }) {
  const { invoice: inv, items, payments, seller } = doc;
  const params = useSearchParams();
  const [pdfNote, setPdfNote] = useState<string | null>(null);

  // FBR bill: the FBR number arrives from the shop PC a few seconds after the bill is saved.
  const [fbrHead, setFbrHead] = useState(fbrInitial ? { status: fbrInitial.status, number: fbrInitial.number, environment: fbrInitial.environment, submittedAt: fbrInitial.submittedAt } : null);
  const [gaveUp, setGaveUp] = useState(false);
  const isFbr = !!fbrInitial && !!fbrHead;
  const cancelled = inv.status === "Cancelled";
  const hasNumber = !!fbrHead && fbrHasNumber(fbrHead);
  // Printing has to wait for the FBR number (the paper must carry it). A cancelled bill that never reached FBR does not wait.
  const needsNumber = isFbr && !hasNumber && !cancelled;
  const waiting = needsNumber && !gaveUp && (fbrHead!.status === "pending" || fbrHead!.status === "sending");

  // While waiting, look for the number every 3 seconds, for up to 90 seconds.
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let tries = 0;
    const supabase = createClient();
    const timer = setInterval(async () => {
      tries += 1;
      if (tries > 30) {
        setGaveUp(true);
        clearInterval(timer);
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const { data, error } = await supabase
          .from("fbr_invoices")
          .select(FBR_PRINT_HEADER_COLUMNS)
          .eq("invoice_id", inv.id)
          .maybeSingle();
        if (stopped || error || !data) return;
        const h = fbrPrintHeaderFromRow(data);
        if (h) setFbrHead(h);
      } catch {
        /* keep trying until the time is up */
      }
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waiting, inv.id]);

  // Opened from "Save and print" or "Print": open the print box once the page has drawn.
  // For an FBR bill, only once the FBR number is on the page.
  const printedRef = useRef(false);
  useEffect(() => {
    if (params.get("auto") !== "1" || printedRef.current) return;
    if (needsNumber) return;
    printedRef.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [params, needsNumber]);

  const fbrCalc = useMemo(
    () => (fbrInitial ? computeFbrPrint(inv.total_value, items, fbrInitial.lines) : null),
    [fbrInitial, inv.total_value, items],
  );
  const sentAt = fbrHead?.submittedAt ? `${formatDate(fbrHead.submittedAt)}, ${formatTime(fbrHead.submittedAt)}` : null;

  async function downloadPdf() {
    setPdfNote(null);
    try {
      const { invoicePdfFile } = await import("@/lib/pdf");
      // Use the freshest FBR status (fbrHead can be newer than the page's first load, from the wait-for-number poll).
      const fbrForPdf = fbrInitial && fbrHead ? { ...fbrInitial, ...fbrHead } : fbrInitial;
      const file = invoicePdfFile({ ...doc, fbr: fbrForPdf });
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
        {isFbr && waiting && (
          <p className="w-full rounded-lg bg-sun/25 px-3 py-2 text-sm font-semibold text-amber-900" role="status">
            Waiting for the FBR invoice number before the PDF and print carry it. It normally takes about 15 seconds.
          </p>
        )}
        {isFbr && needsNumber && !waiting && (
          <p className="w-full rounded-lg bg-sun/25 px-3 py-2 text-sm font-semibold text-amber-900" role="status">
            {fbrHead!.status === "failed" || fbrHead!.status === "unknown"
              ? "FBR has not accepted this bill. Please tell the Owner. You can still print, but the paper will have no FBR number."
              : "The FBR number has not come yet. Check that the shop PC sender is running. You can print now, or open this page again later."}
          </p>
        )}
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
            <p className="font-display text-3xl font-bold leading-none">{isFbr ? "Sales Tax Invoice" : "Sale Invoice"}</p>
            <p className="mt-1.5 text-base font-semibold tabular-nums">{inv.invoice_number}</p>
            <p className="tabular-nums text-lead">{formatDay(inv.invoice_date)}</p>
            {inv.status === "Cancelled" && <p className="mt-1 font-bold text-terminal">CANCELLED</p>}
          </div>
        </header>

        {fbrHead?.environment === "sandbox" && (
          <p className="mt-3 rounded border-2 border-dashed border-terminal px-3 py-1.5 text-center font-bold text-terminal">
            TEST INVOICE (FBR sandbox). Not a real FBR invoice.
          </p>
        )}

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

        {fbrCalc ? (
          <div className="mt-5 overflow-x-auto print:overflow-visible">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="bg-plate">
                  <th className="w-6 px-1.5 py-2 font-bold">#</th>
                  <th className="px-1.5 py-2 font-bold">Item</th>
                  <th className="px-1.5 py-2 text-right font-bold">Qty</th>
                  <th className="px-1.5 py-2 text-right font-bold">Rate</th>
                  <th className="px-1.5 py-2 text-right font-bold">Value excl. tax</th>
                  <th className="px-1.5 py-2 text-right font-bold">GST %</th>
                  <th className="px-1.5 py-2 text-right font-bold">GST</th>
                  <th className="px-1.5 py-2 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const r = fbrCalc.rows[i];
                  return (
                    <tr key={it.id} className="break-inside-avoid border-b border-line/80">
                      <td className="px-1.5 py-2 align-top tabular-nums">{i + 1}</td>
                      <td className="px-1.5 py-2 align-top">
                        {it.description}
                        {it.hs_code && <span className="block text-[11px] text-lead">HS code {it.hs_code}</span>}
                      </td>
                      <td className="px-1.5 py-2 text-right align-top tabular-nums">{it.quantity}</td>
                      <td className="px-1.5 py-2 text-right align-top tabular-nums">{formatRs(it.rate)}</td>
                      <td className="px-1.5 py-2 text-right align-top tabular-nums">{r.known ? formatRs(r.valueExclTax) : "-"}</td>
                      <td className="px-1.5 py-2 text-right align-top tabular-nums">{r.known ? r.rateDesc || "-" : "-"}</td>
                      <td className="px-1.5 py-2 text-right align-top tabular-nums">
                        {r.known ? formatRs(r.taxAmount) : "-"}
                        {r.known && r.taxInside && r.taxAmount > 0 && <span aria-label="included in price"> *</span>}
                      </td>
                      <td className="px-1.5 py-2 text-right align-top font-bold tabular-nums">{formatRs(r.payable)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
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
        )}

        <div className="mt-4 flex justify-end">
          <dl className="w-64 space-y-1 break-inside-avoid">
            {fbrCalc && fbrCalc.taxAdded > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-lead">Items total</dt>
                  <dd className="tabular-nums">{formatRs(fbrCalc.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-lead">GST added</dt>
                  <dd className="tabular-nums">{formatRs(fbrCalc.taxAdded)}</dd>
                </div>
              </>
            )}
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

        {fbrCalc && fbrCalc.taxIncluded > 0 && (
          <p className="mt-2 text-right text-[11px] text-lead">
            * Sales tax of {formatRs(fbrCalc.taxIncluded)} is already included in the price of the marked items.
          </p>
        )}

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

        {isFbr && fbrHead && (
          <section className="mt-6 break-inside-avoid border-t border-line pt-4" aria-label="FBR digital invoice">
            {hasNumber ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <FbrQr value={fbrHead.number!} />
                <div className="min-w-0">
                  <FbrLogo />
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-lead">FBR invoice number</p>
                  <p className="break-all text-base font-bold tabular-nums">{fbrHead.number}</p>
                  {sentAt && <p className="text-[11px] text-lead">Reported to FBR: {sentAt}</p>}
                  <p className="mt-1 max-w-xs text-[11px] text-lead">{FBR_VERIFY_TEXT}</p>
                </div>
              </div>
            ) : (
              <p className="text-[12px] font-bold text-lead">
                {cancelled ? "This bill is cancelled and was not sent to FBR." : "FBR invoice number: not received yet."}
              </p>
            )}
          </section>
        )}

        <footer className="mt-8 border-t border-line pt-3 text-center text-lead">Thank you for your business.</footer>
      </article>
    </div>
  );
}
