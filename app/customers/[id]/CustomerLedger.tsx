"use client";

import { useMemo } from "react";
import { formatDate, formatRs } from "@/lib/format";
import { formatDay } from "@/lib/invoices";
import type { CustomerBill } from "./CustomerProfile";

export type CustomerPayment = {
  id: string;
  invoice_id: string;
  amount: number;
  method: string | null;
  paid_at: string;
  note: string | null;
};

type Row = {
  key: string;
  sortAt: number;
  order: number; // bills come before payments made at the same moment
  dateLabel: string;
  text: string;
  sub: string | null;
  debit: number; // customer owes more
  credit: number; // customer paid
};

const METHOD_LABEL: Record<string, string> = { cash: "Cash", bank: "Bank", other: "Other" };

/** Khata for one customer: every bill (they owe) and every payment (they paid), with a running balance. */
export default function CustomerLedger({
  bills,
  payments,
  ready,
}: {
  bills: CustomerBill[];
  payments: CustomerPayment[];
  ready: boolean;
}) {
  const { rows, totalDebit, totalCredit } = useMemo(() => {
    const valid = bills.filter((b) => b.status !== "Cancelled");
    const byId = new Map(valid.map((b) => [b.id, b]));
    const out: Row[] = [];

    for (const b of valid) {
      out.push({
        key: `b-${b.id}`,
        // Pakistan has no daylight saving, so +05:00 is always right.
        sortAt: Date.parse(`${b.invoice_date}T00:00:00+05:00`),
        order: 0,
        dateLabel: formatDay(b.invoice_date),
        text: `Bill ${b.invoice_number}`,
        sub: null,
        debit: b.total_value,
        credit: 0,
      });
    }
    for (const p of payments) {
      const bill = byId.get(p.invoice_id);
      if (!bill) continue; // payment on a cancelled bill is not part of the balance
      const method = p.method ? METHOD_LABEL[p.method] ?? p.method : null;
      out.push({
        key: `p-${p.id}`,
        sortAt: Date.parse(p.paid_at),
        order: 1,
        dateLabel: formatDate(p.paid_at),
        text: `Payment received for ${bill.invoice_number}`,
        sub: [method, p.note].filter(Boolean).join(" · ") || null,
        debit: 0,
        credit: p.amount,
      });
    }
    out.sort((a, b) => a.sortAt - b.sortAt || a.order - b.order);
    return {
      rows: out,
      totalDebit: out.reduce((s, r) => s + r.debit, 0),
      totalCredit: out.reduce((s, r) => s + r.credit, 0),
    };
  }, [bills, payments]);

  let running = 0;
  const balance = Math.round((totalDebit - totalCredit) * 100) / 100;

  return (
    <section className="card anim-rise mt-4 overflow-hidden">
      <div className="px-5 pb-2 pt-5">
        <h2 className="font-display text-2xl font-semibold">Ledger</h2>
        <p className="text-sm text-lead">Every bill and every payment, oldest first.</p>
      </div>

      {!ready ? (
        <p className="px-5 pb-6 text-lead">The ledger could not be loaded. Refresh the page to try again.</p>
      ) : rows.length === 0 ? (
        <p className="px-5 pb-6 text-lead">Nothing yet. Bills and payments will appear here.</p>
      ) : (
        <div className="overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[34rem] text-left text-[15px]">
            <thead>
              <tr className="border-b border-line text-sm text-lead">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Details</th>
                <th className="px-3 py-2 text-right font-medium">Bill</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((r) => {
                running = Math.round((running + r.debit - r.credit) * 100) / 100;
                return (
                  <tr key={r.key}>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top">{r.dateLabel}</td>
                    <td className="px-3 py-2.5 align-top">
                      <span className="block font-medium">{r.text}</span>
                      {r.sub && <span className="block text-sm text-lead">{r.sub}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">{r.debit > 0 ? formatRs(r.debit) : ""}</td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums text-cell-deep">
                      {r.credit > 0 ? formatRs(r.credit) : ""}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top font-semibold tabular-nums">{formatRs(running)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-semibold">
                <td className="px-3 py-3" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatRs(totalDebit)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-cell-deep">{formatRs(totalCredit)}</td>
                <td className={`px-3 py-3 text-right tabular-nums ${balance > 0 ? "text-terminal-deep" : ""}`}>
                  {balance > 0 ? `${formatRs(balance)} due` : "Nothing due"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
