"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Toast from "@/components/Toast";
import { formatRs } from "@/lib/format";
import { formatDay } from "@/lib/invoices";
import { scrapIntakeMatches, scrapSaleMatches } from "@/lib/scrapBattery";
import type { ScrapBatteryInventory, ScrapBatterySale } from "@/lib/types";
import SellScrapForm from "./SellScrapForm";
import AddScrapForm from "./AddScrapForm";

type Tab = "stock" | "sales";

const delay = (i: number) => ({ "--i": Math.min(i, 8) }) as React.CSSProperties;

export default function ScrapClient({
  stock,
  sales,
  soldBatteries,
  setupIncomplete,
}: {
  stock: ScrapBatteryInventory[];
  sales: ScrapBatterySale[];
  soldBatteries: ScrapBatteryInventory[];
  setupIncomplete: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("stock");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sellFormOpen, setSellFormOpen] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Which batteries were in each sold lot, keyed by sale id (scrap_battery_inventory.sold_in_sale_id).
  const batteriesBySale = useMemo(() => {
    const map = new Map<string, ScrapBatteryInventory[]>();
    for (const row of soldBatteries) {
      if (!row.sold_in_sale_id) continue;
      const list = map.get(row.sold_in_sale_id);
      if (list) list.push(row);
      else map.set(row.sold_in_sale_id, [row]);
    }
    return map;
  }, [soldBatteries]);

  const visibleStock = useMemo(
    () => (query.trim() ? stock.filter((r) => scrapIntakeMatches(r, query)) : stock),
    [stock, query]
  );
  const visibleSales = useMemo(
    () => (query.trim() ? sales.filter((s) => scrapSaleMatches(s, query)) : sales),
    [sales, query]
  );

  const summary = useMemo(() => {
    const batches = stock.length;
    const batteries = stock.reduce((sum, r) => sum + r.quantity, 0);
    const weighed = stock.filter((r) => r.estimated_weight_kg != null);
    const weightKg = weighed.length > 0 ? weighed.reduce((sum, r) => sum + (r.estimated_weight_kg ?? 0), 0) : null;
    return { batches, batteries, weightKg };
  }, [stock]);

  const selectedRows = useMemo(() => stock.filter((r) => selected.has(r.id)), [stock, selected]);
  const selectedQty = selectedRows.reduce((sum, r) => sum + r.quantity, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSold(message: string) {
    setSellFormOpen(false);
    setSelected(new Set());
    setToast(message);
    router.refresh();
  }

  function onAdded(message: string) {
    setAddFormOpen(false);
    setToast(message);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Scrap"
        subtitle="Old batteries taken in exchange, held until sold in bulk by weight."
        action={
          <div className="flex flex-wrap gap-2">
            {selectedRows.length > 0 && (
              <button type="button" onClick={() => setSellFormOpen(true)} className="btn btn-primary">
                <Icon name="box" className="h-5 w-5" /> Sell {selectedRows.length} selected
              </button>
            )}
            <button type="button" onClick={() => setAddFormOpen(true)} className="btn btn-quiet">
              <Icon name="plus" className="h-5 w-5" /> Add scrap battery
            </button>
          </div>
        }
      />

      {setupIncomplete && (
        <p className="anim-rise mt-4 rounded-xl bg-sun/20 px-4 py-3 text-sm" style={delay(1)}>
          Some scrap battery data could not be loaded. Make sure{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">07_scrap_battery.sql</code> has been run in
          Supabase.
        </p>
      )}

      <div className="anim-rise mt-6 grid gap-3 sm:grid-cols-3" style={delay(1)}>
        <div className="card p-4">
          <p className="text-sm text-lead">Batches in stock</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{summary.batches}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-lead">Batteries in stock</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{summary.batteries}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-lead">Estimated weight</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
            {summary.weightKg != null ? `${summary.weightKg.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg` : "-"}
          </p>
          <p className="mt-1 text-sm text-lead">
            {summary.weightKg != null ? "Only counts batches with a weight on file." : "Batteries are usually weighed together at sale time."}
          </p>
        </div>
      </div>

      <div className="anim-rise mt-4 space-y-3" style={delay(2)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Scrap" className="inline-flex rounded-2xl bg-plate p-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "stock"}
              onClick={() => setTab("stock")}
              className={`min-h-10 rounded-xl px-4 text-[15px] font-semibold transition-all ${
                tab === "stock" ? "bg-white text-casing shadow-card" : "text-lead hover:text-casing"
              }`}
            >
              In stock <span className="tabular-nums">({stock.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "sales"}
              onClick={() => setTab("sales")}
              className={`min-h-10 rounded-xl px-4 text-[15px] font-semibold transition-all ${
                tab === "sales" ? "bg-white text-casing shadow-card" : "text-lead hover:text-casing"
              }`}
            >
              Sold <span className="tabular-nums">({sales.length})</span>
            </button>
          </div>

          <div className="relative sm:max-w-xs sm:flex-1">
            <label htmlFor="scrap-search" className="sr-only">
              Search
            </label>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
            <input
              id="scrap-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "stock" ? "Search brand, model or bill" : "Search buyer or sale number"}
              className="input pl-11"
            />
          </div>
        </div>

        {tab === "stock" && selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-focus/20 bg-focus/10 px-4 py-3 text-focus">
            <span className="text-[15px] font-medium">
              {selectedRows.length} {selectedRows.length === 1 ? "batch" : "batches"} selected · {selectedQty}{" "}
              {selectedQty === 1 ? "battery" : "batteries"}
            </span>
            <button type="button" onClick={() => setSelected(new Set())} className="text-sm font-semibold hover:underline">
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        {tab === "stock" ? (
          visibleStock.length === 0 ? (
            <EmptyState
              title={stock.length === 0 ? "No scrap batteries yet" : "Nothing matches"}
              hint={
                stock.length === 0
                  ? "Old batteries taken in exchange on the New bill screen show up here."
                  : "Try a different word."
              }
            />
          ) : (
            <ul className="space-y-3">
              {visibleStock.map((row, idx) => {
                const checked = selected.has(row.id);
                return (
                  <li
                    key={row.id}
                    className={`card anim-rise flex items-start gap-3 p-4 ${checked ? "ring-2 ring-focus/50" : ""}`}
                    style={delay(idx + 3)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(row.id)}
                      aria-label={`Select ${row.brand} ${row.model}`}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-line text-focus focus:ring-focus"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg font-semibold tabular-nums">{row.intake_number}</span>
                        <span className="rounded-full bg-plate px-2.5 py-0.5 text-sm font-medium text-lead">
                          Qty {row.quantity}
                        </span>
                        {row.battery_type && (
                          <span className="rounded-full bg-plate px-2.5 py-0.5 text-sm font-medium text-lead">
                            {row.battery_type}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-semibold">
                        {row.brand} {row.model}
                        {row.battery_number ? ` · ${row.battery_number}` : ""}
                      </p>
                      {row.customer_name && <p className="text-sm text-lead">From {row.customer_name}</p>}
                      <p className="mt-1 text-sm text-lead">Received {formatDay(row.received_date)}</p>
                      {row.note && <p className="mt-1 text-sm text-lead">Note: {row.note}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : visibleSales.length === 0 ? (
          <EmptyState
            title={sales.length === 0 ? "No scrap sales yet" : "Nothing matches"}
            hint={
              sales.length === 0
                ? "Select in-stock batteries and sell them together as one weighed lot."
                : "Try a different word."
            }
          />
        ) : (
          <ul className="space-y-3">
            {visibleSales.map((sale, idx) => {
              const lot = batteriesBySale.get(sale.id) ?? [];
              const expanded = expandedSaleId === sale.id;
              return (
                <li key={sale.id} className="card anim-rise p-4" style={delay(idx + 3)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-display text-lg font-semibold tabular-nums">{sale.sale_number}</span>
                      <p className="mt-1 font-semibold">{sale.buyer_name}</p>
                      {sale.buyer_phone && <p className="text-sm text-lead">{sale.buyer_phone}</p>}
                      <p className="mt-1 text-sm text-lead">
                        {formatDay(sale.sale_date)} · {sale.total_weight_kg.toLocaleString("en-US", { maximumFractionDigits: 2 })} kg
                        {" @ "}
                        {formatRs(sale.rate_per_kg)}/kg
                      </p>
                      {sale.note && <p className="mt-1 text-sm text-lead">Note: {sale.note}</p>}
                    </div>
                    <p className="font-display text-2xl font-semibold tabular-nums leading-none">
                      {formatRs(sale.total_amount)}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedSaleId(expanded ? null : sale.id)}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-focus hover:underline"
                    >
                      <Icon name="chevron" className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                      {lot.length > 0
                        ? `${lot.length} ${lot.length === 1 ? "battery record" : "battery records"} in this lot`
                        : "No battery records linked"}
                    </button>
                    <Link
                      href={`/print/scrap/${sale.id}?auto=1`}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-lead hover:text-casing"
                    >
                      <Icon name="printer" className="h-4 w-4" /> Print slip
                    </Link>
                  </div>

                  {expanded && lot.length > 0 && (
                    <ul className="mt-2 space-y-1.5 rounded-xl bg-plate/60 px-3.5 py-2.5 text-sm">
                      {lot.map((b) => (
                        <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 truncate">
                            <span className="tabular-nums text-lead">{b.intake_number}</span> · {b.brand} {b.model}
                            {b.battery_number ? ` · ${b.battery_number}` : ""}
                          </span>
                          <span className="shrink-0 text-lead">Qty {b.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {sellFormOpen && <SellScrapForm rows={selectedRows} onClose={() => setSellFormOpen(false)} onSold={onSold} />}

      {addFormOpen && <AddScrapForm onClose={() => setAddFormOpen(false)} onAdded={onAdded} />}

      <Toast message={toast} />
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card anim-rise border-dashed border-lead/40 px-6 py-14 text-center">
      <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-plate text-lead">
        <Icon name="box" className="h-8 w-8" />
      </span>
      <p className="mt-4 font-display text-3xl font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-lead">{hint}</p>
    </div>
  );
}
