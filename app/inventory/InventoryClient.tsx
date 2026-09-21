"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Toast from "@/components/Toast";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { Category, InventoryItem } from "@/lib/types";
import { CATEGORIES, categoryLabel, isLow, isOut, itemSpecs } from "@/lib/inventory";
import { formatRs } from "@/lib/format";
import ItemForm from "./ItemForm";
import StockGauge from "./StockGauge";

type CategoryFilter = "all" | Category;

const CHIP: Record<Category, { icon: "battery" | "sun" | "plug"; tone: string }> = {
  battery: { icon: "battery", tone: "bg-sun/25 text-amber-800" },
  panel: { icon: "sun", tone: "bg-focus/10 text-focus" },
  accessory: { icon: "plug", tone: "bg-cell/10 text-cell" },
};

function ItemChip({ category }: { category: Category }) {
  const c = CHIP[category];
  return (
    <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.tone}`}>
      <Icon name={c.icon} className="h-[22px] w-[22px]" />
    </span>
  );
}

function StockCell({ item }: { item: InventoryItem }) {
  const low = isLow(item);
  return (
    <div className="flex items-center gap-3">
      <StockGauge quantity={item.quantity} reorderLevel={item.reorder_level} />
      <span className="font-display text-2xl font-semibold tabular-nums leading-none">{item.quantity}</span>
      {low && (
        <span className="whitespace-nowrap rounded-full bg-terminal/10 px-2.5 py-0.5 text-sm font-medium text-terminal-deep">
          {isOut(item) ? "Out of stock" : "Low"}
        </span>
      )}
    </div>
  );
}

const delay = (i: number) => ({ "--i": Math.min(i, 8) }) as React.CSSProperties;

export default function InventoryClient({
  items,
  initialQuery = "",
  initialLow = false,
}: {
  items: InventoryItem[];
  initialQuery?: string;
  initialLow?: boolean;
}) {
  const router = useRouter();
  const wantsAdd = useSearchParams().get("add") === "1";
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [lowOnly, setLowOnly] = useState(initialLow);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Links to /inventory?add=1 (top bar, Home, search box) open the Add panel, then tidy the address bar.
  useEffect(() => {
    if (!wantsAdd) return;
    setEditing(null);
    setFormOpen(true);
    window.history.replaceState(null, "", "/inventory");
  }, [wantsAdd]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  const counts = useMemo(() => {
    const c = { all: items.length, battery: 0, panel: 0, accessory: 0 };
    for (const i of items) c[i.category] += 1;
    return c;
  }, [items]);

  const lowCount = useMemo(() => items.filter(isLow).length, [items]);
  const totalUnits = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (lowOnly && !isLow(i)) return false;
      if (!q) return true;
      const haystack = [i.brand, i.model, i.type ?? "", categoryLabel(i.category), i.hs_code ?? ""]
        .join(" ")
        .toLowerCase();
      return q.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [items, query, category, lowOnly]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditing(item);
    setFormOpen(true);
  }

  function onSaved(message: string) {
    closeForm();
    setToast(message);
    router.refresh();
  }

  function askDelete(item: InventoryItem) {
    setDeleteError(null);
    setDeleting(item);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const { error } = await (await getBrowserClient()).from("inventory").delete().eq("id", deleting.id);
    setDeleteBusy(false);
    if (error) {
      setDeleteError(`Could not delete. ${error.message}`);
      return;
    }
    setDeleting(null);
    setToast("Item deleted.");
    router.refresh();
  }

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setLowOnly(false);
  }

  const filtersActive = query.trim() !== "" || category !== "all" || lowOnly;

  const tabs: { value: CategoryFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    ...CATEGORIES.map((c) => ({ value: c.value, label: c.plural, count: counts[c.value] })),
  ];

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={
          items.length === 0
            ? "No items yet."
            : `${items.length} ${items.length === 1 ? "item" : "items"}, ${totalUnits} units in stock.`
        }
        action={
          <button type="button" onClick={openAdd} className="btn btn-primary">
            <Icon name="plus" className="h-5 w-5" /> Add item
          </button>
        }
      />

      {items.length > 0 && (
        <div className="anim-rise mt-6 space-y-3" style={delay(1)}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-md">
              <label htmlFor="search" className="sr-only">
                Search stock
              </label>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
              <input
                id="search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search brand, model or type"
                className="input pl-11"
              />
            </div>
            <button
              type="button"
              onClick={() => setLowOnly((v) => !v)}
              aria-pressed={lowOnly}
              className={`btn ${lowOnly ? "btn-danger" : "btn-quiet"}`}
            >
              <Icon name="alert" className="h-[18px] w-[18px]" />
              {lowOnly ? "Showing low stock" : "Low stock"}
              <span className="tabular-nums">({lowCount})</span>
            </button>
          </div>

          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {tabs.map((tab) => {
              const active = category === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setCategory(tab.value)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                    active
                      ? "border-casing bg-casing text-white shadow-sm"
                      : "border-line bg-white text-lead hover:border-lead/40 hover:text-casing"
                  }`}
                >
                  {tab.label} <span className={`tabular-nums ${active ? "text-white/70" : "text-lead/80"}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        {items.length === 0 ? (
          <div className="card anim-rise border-dashed border-lead/40 px-6 py-14 text-center" style={delay(1)}>
            <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-sun/25 text-amber-800">
              <Icon name="battery" className="h-8 w-8" />
            </span>
            <p className="mt-4 font-display text-3xl font-semibold">Your stock list is empty</p>
            <p className="mx-auto mt-2 max-w-sm text-lead">
              Add your first battery, solar panel or accessory to start tracking stock.
            </p>
            <button type="button" onClick={openAdd} className="btn btn-primary mt-6">
              <Icon name="plus" className="h-5 w-5" /> Add first item
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="font-display text-2xl font-semibold">Nothing matches</p>
            <p className="mt-2 text-lead">Try a different word, or clear the filters.</p>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="btn btn-quiet mt-5">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Tablet and desktop: table */}
            <div className="card anim-rise hidden overflow-hidden md:block" style={delay(2)}>
              <table className="w-full text-left text-[15px]">
                <thead className="border-b border-line bg-plate/60 text-xs uppercase tracking-[0.1em] text-lead">
                  <tr>
                    <th scope="col" className="px-5 py-3.5 font-medium">Item</th>
                    <th scope="col" className="px-4 py-3.5 text-right font-medium">Cost</th>
                    <th scope="col" className="px-4 py-3.5 text-right font-medium">Price</th>
                    <th scope="col" className="px-4 py-3.5 font-medium">In stock</th>
                    <th scope="col" className="px-4 py-3.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {visible.map((item) => (
                    <tr key={item.id} className="align-middle transition-colors hover:bg-plate/50">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3.5">
                          <ItemChip category={item.category} />
                          <div className="min-w-0">
                            <div className="font-semibold">
                              {item.brand} {item.model}
                            </div>
                            <div className="text-sm text-lead">
                              {categoryLabel(item.category)}
                              {itemSpecs(item) ? `, ${itemSpecs(item)}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-lead">{formatRs(item.cost_price)}</td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{formatRs(item.sale_price)}</td>
                      <td className="px-4 py-3.5">
                        <StockCell item={item} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            aria-label={`Edit ${item.brand} ${item.model}`}
                            title="Edit"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-casing transition-colors hover:bg-plate"
                          >
                            <Icon name="edit" className="h-[18px] w-[18px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => askDelete(item)}
                            aria-label={`Delete ${item.brand} ${item.model}`}
                            title="Delete"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-terminal-deep transition-colors hover:bg-terminal/10"
                          >
                            <Icon name="trash" className="h-[18px] w-[18px]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone: cards */}
            <ul className="space-y-3 md:hidden">
              {visible.map((item, idx) => (
                <li key={item.id} className="card anim-rise space-y-3.5 p-4" style={delay(idx + 2)}>
                  <div className="flex items-start gap-3">
                    <ItemChip category={item.category} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-snug">
                        {item.brand} {item.model}
                      </div>
                      <div className="text-sm text-lead">
                        {categoryLabel(item.category)}
                        {itemSpecs(item) ? `: ${itemSpecs(item)}` : ""}
                      </div>
                    </div>
                  </div>
                  <StockCell item={item} />
                  <div className="flex items-center justify-between gap-3 border-t border-line/70 pt-3">
                    <div className="text-sm">
                      <span className="block font-display text-2xl font-semibold leading-none tabular-nums">
                        {formatRs(item.sale_price)}
                      </span>
                      <span className="text-lead">cost {formatRs(item.cost_price)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        aria-label={`Edit ${item.brand} ${item.model}`}
                        className="btn btn-quiet btn-sm"
                      >
                        <Icon name="edit" className="h-4 w-4" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => askDelete(item)}
                        aria-label={`Delete ${item.brand} ${item.model}`}
                        className="btn btn-quiet btn-sm text-terminal-deep"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {formOpen && <ItemForm item={editing} onClose={closeForm} onSaved={onSaved} />}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.brand} ${deleting.model}?`}
          body={`This removes the item and its ${deleting.quantity} units from your stock list. It cannot be undone.`}
          confirmLabel="Delete item"
          cancelLabel="Keep item"
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
