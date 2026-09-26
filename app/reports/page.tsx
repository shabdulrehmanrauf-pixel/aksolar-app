import type { Metadata } from "next";
import Link from "next/link";
import Icon, { type IconName } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { formatRs, formatRsCompact } from "@/lib/format";
import { addDays, todayKarachi } from "@/lib/invoices";
import { isLow } from "@/lib/inventory";
import { netProfit, parseRange, periodFor, RANGES, type CashBookSummary, type FinancialSummary, type ReportSummary } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";
import CashBookCard from "./CashBookCard";
import SalesChart from "./SalesChart";

export const metadata: Metadata = { title: "Reports" };

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className={strong ? "font-semibold" : "text-lead"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-display text-2xl font-semibold" : "font-semibold"} ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const today = todayKarachi();
  const period = periodFor(parseRange(range), today);
  const supabase = await createClient();

  // For a single day the chart shows the 14 days up to it, so it is not one lonely bar.
  const chartFrom = period.singleDay ? addDays(period.to, -13) : period.from;
  const [summaryRes, chartRes, stockRes, moneyRes, cashBookRes, financeRes] = await Promise.all([
    supabase.rpc("report_summary", { p_from: period.from, p_to: period.to, p_bucket: period.bucket }),
    period.singleDay
      ? supabase.rpc("report_summary", { p_from: chartFrom, p_to: period.to, p_bucket: "day" })
      : Promise.resolve(null),
    supabase.from("inventory").select("quantity,reorder_level,cost_price,sale_price"),
    supabase.rpc("money_summary", { p_day: today }),
    supabase.rpc("cash_book_summary", { p_from: period.from, p_to: period.to }),
    supabase.rpc("financial_summary", { p_from: period.from, p_to: period.to }),
  ]);

  if (summaryRes.error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Reports could not be loaded</h1>
        <p className="mt-3 text-lead">
          The report functions are missing. In Supabase, open SQL Editor and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">03_invoices.sql</code> and then{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">05_reports.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {summaryRes.error.message}</p>
      </div>
    );
  }

  const s = summaryRes.data as ReportSummary;
  const chart = (chartRes?.data as ReportSummary | null)?.daily ?? s.daily;
  const chartBucket = period.singleDay ? "day" : period.bucket;
  const stock = (stockRes.data ?? []) as Pick<InventoryItem, "quantity" | "reorder_level" | "cost_price" | "sale_price">[];
  const stockCost = stock.reduce((sum, i) => sum + i.cost_price * i.quantity, 0);
  const stockSale = stock.reduce((sum, i) => sum + i.sale_price * i.quantity, 0);
  const lowCount = stock.filter(isLow).length;
  const owedTotal = (moneyRes.data as { udhaar_total: number; udhaar_count: number } | null)?.udhaar_total ?? 0;
  const owedCount = (moneyRes.data as { udhaar_total: number; udhaar_count: number } | null)?.udhaar_count ?? 0;
  const maxRevenue = Math.max(...s.top_items.map((t) => t.revenue), 1);
  const avgBill = s.invoice_count > 0 ? s.sales_total / s.invoice_count : 0;

  const cashBook = (cashBookRes.error ? null : cashBookRes.data) as CashBookSummary | null;
  const finance = (financeRes.error ? null : financeRes.data) as FinancialSummary | null;
  const profit = finance ? netProfit(s.gross_profit, finance) : null;

  const hero: { label: string; value: string; icon: IconName; chip: string }[] = [
    { label: "Total sales", value: formatRsCompact(s.sales_total), icon: "receipt", chip: "bg-sun/25 text-sun" },
    { label: "Bills", value: String(s.invoice_count), icon: "tag", chip: "bg-sky-400/25 text-sky-200" },
    { label: "Money received", value: formatRsCompact(s.cash_received), icon: "banknote", chip: "bg-cell/35 text-emerald-200" },
    { label: "Gross profit", value: formatRsCompact(s.gross_profit), icon: "arrowup", chip: "bg-violet-400/25 text-violet-200" },
  ];

  return (
    <div>
      <PageHeader title="Reports" subtitle={period.label} />

      <nav aria-label="Report period" className="no-scrollbar anim-rise -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0" style={{ "--i": 1 } as React.CSSProperties}>
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/reports?range=${r.key}`}
            aria-current={period.key === r.key ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-semibold transition-colors ${
              period.key === r.key ? "bg-casing text-white" : "border border-line bg-white text-casing hover:bg-plate"
            }`}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <section className="hero-card anim-slide relative mt-4 overflow-hidden rounded-3xl p-5 text-white shadow-lift sm:p-6">
        <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-4">
          {hero.map((h) => (
            <div key={h.label} className="rounded-2xl border border-white/10 bg-white/[0.08] p-3.5 sm:p-4">
              <span className={`mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-xl ${h.chip}`}>
                <Icon name={h.icon} className="h-[18px] w-[18px]" />
              </span>
              <p className="text-sm leading-tight text-white/70">{h.label}</p>
              <p className="mt-1 whitespace-nowrap font-display text-[26px] font-semibold leading-none tabular-nums xl:text-3xl">{h.value}</p>
            </div>
          ))}
        </div>
        {s.invoice_count > 0 && (
          <p className="relative mt-3 text-sm text-white/70">Average bill {formatRs(avgBill)}. Gross profit is sales minus what the items cost you.</p>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Cash closing */}
        <section className="card anim-rise p-5" style={{ "--i": 2 } as React.CSSProperties}>
          <h2 className="font-display text-2xl font-semibold">{period.singleDay ? "Daily cash closing" : "Cash and credit"}</h2>
          <p className="text-sm text-lead">{period.singleDay ? "Count the drawer against these numbers." : "Money in, and what is still owed."}</p>
          <dl className="mt-2 divide-y divide-line/60">
            <Row label="Billed" value={formatRs(s.sales_total)} />
            <Row label="Received in cash" value={formatRs(s.by_method.cash)} />
            <Row label="Received by bank transfer" value={formatRs(s.by_method.bank)} />
            {s.by_method.other > 0 && <Row label="Received, other" value={formatRs(s.by_method.other)} />}
            <Row label="Total money received" value={formatRs(s.cash_received)} strong />
            <Row label="Of which from older bills (udhaar)" value={formatRs(s.received_on_older_bills)} />
            <Row
              label="Still unpaid on these bills"
              value={formatRs(s.credit_given)}
              tone={s.credit_given > 0 ? "text-terminal-deep" : "text-cell-deep"}
            />
          </dl>
          <p className="mt-2 text-sm text-lead">
            This is money received on bills, not cash in hand -- see the cash book below for that.
          </p>
        </section>

        {/* Cash book (F4) */}
        <CashBookCard cashBook={cashBook} singleDay={period.singleDay} />

        {/* Financials (F4) */}
        <section className="card anim-rise p-5" style={{ "--i": 4 } as React.CSSProperties}>
          <h2 className="font-display text-2xl font-semibold">Expenses &amp; profit</h2>
          <p className="text-sm text-lead">Every payment method, for this period.</p>
          {finance ? (
            <dl className="mt-2 divide-y divide-line/60">
              <Row label="Purchases (stock received)" value={formatRs(finance.purchases_total)} />
              <Row label="Paid to suppliers" value={formatRs(finance.paid_to_suppliers_total)} />
              <Row label="Expenses" value={formatRs(finance.expenses_total)} />
              {finance.expenses_excluded_total > 0 && (
                <p className="py-1 pl-1 text-sm text-lead">
                  Of which {formatRs(finance.expenses_excluded_total)} is owner withdrawal (left out of net profit).
                </p>
              )}
              <Row
                label="Net profit"
                value={formatRs(profit ?? 0)}
                strong
                tone={(profit ?? 0) < 0 ? "text-terminal-deep" : "text-cell-deep"}
              />
            </dl>
          ) : (
            <p className="mt-2 text-lead">
              This needs one more file. In Supabase, open SQL Editor and run{" "}
              <code className="rounded bg-plate px-1.5 py-0.5 text-casing">14_expenses.sql</code> and then{" "}
              <code className="rounded bg-plate px-1.5 py-0.5 text-casing">15_cash_book.sql</code>.
            </p>
          )}
          <p className="mt-2 text-sm text-lead">Net profit is gross profit minus expenses (owner withdrawal excluded).</p>
        </section>

        {/* Chart */}
        <section className="card anim-rise p-5" style={{ "--i": 5 } as React.CSSProperties}>
          <h2 className="font-display text-2xl font-semibold">
            {period.singleDay ? "Sales, last 14 days" : chartBucket === "month" ? "Sales by month" : "Sales by day"}
          </h2>
          <div className="mt-3">
            <SalesChart data={chart} bucket={chartBucket} />
          </div>
        </section>

        {/* Best sellers */}
        <section className="card anim-rise p-5" style={{ "--i": 6 } as React.CSSProperties}>
          <h2 className="font-display text-2xl font-semibold">Best sellers</h2>
          {s.top_items.length === 0 ? (
            <p className="mt-2 text-lead">Items sold in this period will be ranked here.</p>
          ) : (
            <ol className="mt-3 space-y-3.5">
              {s.top_items.map((t, i) => (
                <li key={t.description}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold">
                      <span className="mr-2 text-lead tabular-nums">{i + 1}.</span>
                      {t.description}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatRs(t.revenue)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-plate" aria-hidden="true">
                      <div className="h-full rounded-full bg-sun" style={{ width: `${Math.max(4, (t.revenue / maxRevenue) * 100)}%` }} />
                    </div>
                    <span className="w-16 text-right text-sm text-lead tabular-nums">{t.quantity} sold</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Shop snapshot */}
        <section className="card anim-rise p-5" style={{ "--i": 7 } as React.CSSProperties}>
          <h2 className="font-display text-2xl font-semibold">Shop right now</h2>
          <dl className="mt-2 divide-y divide-line/60">
            <Row label="Stock value (at cost)" value={formatRs(stockCost)} />
            <Row label="Stock worth (at sale price)" value={formatRs(stockSale)} />
            <Row
              label={`Udhaar to collect (${owedCount} ${owedCount === 1 ? "bill" : "bills"})`}
              value={formatRs(owedTotal)}
              tone={owedTotal > 0 ? "text-terminal-deep" : undefined}
            />
            <Row label="Items running low" value={String(lowCount)} tone={lowCount > 0 ? "text-terminal-deep" : "text-cell-deep"} />
            {finance && (
              <Row
                label={`We owe suppliers (${finance.we_owe_count} ${finance.we_owe_count === 1 ? "supplier" : "suppliers"})`}
                value={formatRs(finance.we_owe_total)}
                tone={finance.we_owe_total > 0 ? "text-terminal-deep" : undefined}
              />
            )}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/sales?filter=due" className="btn btn-quiet btn-sm">
              See udhaar bills
            </Link>
            <Link href="/inventory?filter=low" className="btn btn-quiet btn-sm">
              See low stock
            </Link>
            {finance && finance.we_owe_total > 0 && (
              <Link href="/suppliers" className="btn btn-quiet btn-sm">
                See suppliers
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
