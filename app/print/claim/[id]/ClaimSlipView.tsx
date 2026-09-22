"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icons";
import { formatPhone } from "@/lib/customers";
import { formatRs } from "@/lib/format";
import { formatDay } from "@/lib/invoices";
import { claimStatusLabel } from "@/lib/batteryClaims";
import type { ClaimSlipDocument } from "@/lib/batteryClaimsDoc";

export default function ClaimSlipView({ doc }: { doc: ClaimSlipDocument }) {
  const { claim, distributor, originalInvoice, seller } = doc;
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("auto") !== "1") return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [params]);

  return (
    <div className="px-3 pb-10 pt-4 sm:px-6 print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[148mm] flex-wrap items-center gap-2">
        <Link href="/battery-services" className="btn btn-quiet">
          <Icon name="back" className="h-5 w-5" /> Back
        </Link>
        <button type="button" onClick={() => window.print()} className="btn btn-primary">
          <Icon name="printer" className="h-5 w-5" /> Print
        </button>
        <p className="w-full text-sm text-lead">To save a PDF from the print box, choose Save as PDF as the printer.</p>
      </div>

      <article className="mx-auto max-w-[148mm] rounded-lg border border-line bg-white p-5 text-[13px] leading-snug shadow-card sm:p-[10mm] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-casing pb-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold leading-none">{seller.business_name}</h1>
            {seller.address && <p className="mt-1.5">{seller.address}</p>}
            {seller.phone && <p className="mt-0.5 text-lead">{formatPhone(seller.phone)}</p>}
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-bold leading-none">Battery Claim Slip</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-terminal-deep">Not a tax invoice</p>
            <p className="mt-1.5 text-base font-semibold tabular-nums">{claim.claim_number}</p>
            <p className="tabular-nums text-lead">{formatDay(claim.received_date)}</p>
          </div>
        </header>

        <section className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-lead">Customer</p>
          <p className="mt-1 text-base font-bold">{claim.customer_name}</p>
          {claim.customer_phone && <p>{formatPhone(claim.customer_phone)}</p>}
        </section>

        <table className="mt-5 w-full text-left">
          <tbody>
            <tr className="border-b border-line/80">
              <td className="py-2 pr-3 font-bold">Battery</td>
              <td className="py-2">
                {claim.battery_brand} {claim.battery_model}
              </td>
            </tr>
            {claim.battery_number && (
              <tr className="border-b border-line/80">
                <td className="py-2 pr-3 font-bold">Battery number</td>
                <td className="py-2 tabular-nums">{claim.battery_number}</td>
              </tr>
            )}
            {originalInvoice && (
              <tr className="border-b border-line/80">
                <td className="py-2 pr-3 font-bold">Original bill</td>
                <td className="py-2 tabular-nums">
                  {originalInvoice.invoice_number} · {formatDay(originalInvoice.invoice_date)}
                </td>
              </tr>
            )}
            <tr className="border-b border-line/80">
              <td className="py-2 pr-3 font-bold">Received</td>
              <td className="py-2 tabular-nums">{formatDay(claim.received_date)}</td>
            </tr>
            {distributor && (
              <tr className="border-b border-line/80">
                <td className="py-2 pr-3 font-bold">Distributor</td>
                <td className="py-2">{distributor.name}</td>
              </tr>
            )}
            <tr className="border-b border-line/80">
              <td className="py-2 pr-3 font-bold">Status</td>
              <td className="py-2">{claimStatusLabel(claim.status)}</td>
            </tr>
            {claim.note && (
              <tr className="border-b border-line/80">
                <td className="py-2 pr-3 font-bold">Note</td>
                <td className="py-2">{claim.note}</td>
              </tr>
            )}
          </tbody>
        </table>

        {(claim.claim_amount != null || claim.extra_charges != null) && (
          <div className="mt-4 flex justify-end">
            <dl className="w-64 space-y-1 break-inside-avoid">
              {claim.claim_amount != null && (
                <div className="flex justify-between">
                  <dt className="text-lead">Claim amount</dt>
                  <dd className="tabular-nums">{formatRs(claim.claim_amount)}</dd>
                </div>
              )}
              {claim.extra_charges != null && (
                <div className="flex justify-between">
                  <dt className="text-lead">Extra charges</dt>
                  <dd className="tabular-nums">{formatRs(claim.extra_charges)}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <footer className="mt-6 break-inside-avoid rounded-lg bg-plate px-3 py-2.5 text-[12px]">
          Keep this slip. When the replacement battery is ready, bring this slip back to collect it.
        </footer>

        <p className="mt-6 text-center text-lead">Thank you for your business.</p>
      </article>
    </div>
  );
}
