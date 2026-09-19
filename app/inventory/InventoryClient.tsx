"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Category, InventoryItem } from "@/lib/types";
import { CATEGORIES, categoryLabel, isLow, isOut, itemSpecs } from "@/lib/inventory";
import { formatRs } from "@/lib/format";
import ItemForm from "./ItemForm";
import StockGauge from "./StockGauge";

type CategoryFilter = "all" | Category;

function StockCell({ item }: { item: InventoryItem }) {
  const low = isLow(item);
  return (
    <div className="flex items-center gap-3">
      <StockGauge quantity={item.quantity} reorderLevel={item.reorder_level} />
      <span className="font-display text-2xl font-semibold tabular-nums leading-none">
        {item.quantity}
      </span>
      {low && (
        <span className="rounded bg-terminal/10 px-1.5 py-0.5 text-sm font-medium text-terminal-deep">
          {isOut(item) ? "Out of stock" : "Low"}
        </span>
      )}
    </div>
  );
}

export default function InventoryClient({ items }: { items: InventoryItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const { error } = await createClient().from("inventory").delete().eq("id", deleting.id);
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold leading-none md:text-5xl">Inventory</h1>
          <p className="mt-2 text-lead">
            {items.length === 0
              ? "No items yet."
              : `${items.length} ${items.length === 1 ? "item" : "items"}, ${totalUnits} units in stock.`}
          </p>
        </div>
        <button type="button" onClick={openAdd} className="btn btn-primary">
          Add item
        </button>
      </div>

      {items.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-56 flex-1 md:max-w-sm">
              <label htmlFor="search" className="sr-only">
                Search stock
              </label>
              <input
                id="search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search brand, model or type"
                className="input"
              />
            </div>
            <button
              type="button"
              onClick={() => setLowOnly((v) => !v)}
              aria-pressed={lowOnly}
              className={`btn ${lowOnly ? "btn-danger" : "btn-quiet"}`}
            >
              {lowOnly ? "Showing low stock" : "Low stock"}
              <span className="tabular-nums">({lowCount})</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-x-1 border-b border-line">
            {tabs.map((tab) => {
              const active = category === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setCategory(tab.value)}
                  aria-pressed={active}
                  className={`-mb-px border-b-[3px] px-3 py-2 text-[15px] font-medium ${
                    active
                      ? "border-sun text-casing"
                      : "border-transparent text-lead hover:text-casing"
                  }`}
                >
                  {tab.label} <span className="tabular-nums text-lead">{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-lead/40 bg-white px-6 py-14 text-center">
            <p className="font-display text-2xl font-semibold">Your stock list is empty</p>
            <p className="mx-auto mt-2 max-w-sm text-lead">
              Add your first battery, solar panel or accessory to start tracking stock.
            </p>
            <button type="button" onClick={openAdd} className="btn btn-primary mt-5">
              Add first item
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-line bg-white px-6 py-12 text-center">
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
            {/* Desktop and tablet: table */}
            <div className="hidden overflow-hidden rounded-lg border border-line bg-white md:block">
              <table className="w-full text-left text-[15px]">
                <thead className="border-b border-line bg-plate/70 text-sm text-lead">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Item</th>
                    <th scope="col" className="px-4 py-3 font-medium">Details</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Cost</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Price</th>
                    <th scope="col" className="px-4 py-3 font-medium">In stock</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((item) => (
                    <tr key={item.id} className="align-middle">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold">
                          {item.brand} {item.model}
                        </div>
                        <div className="text-sm text-lead">{categoryLabel(item.category)}</div>
                      </td>
                      <td className="max-w-[16rem] px-4 py-3.5 text-lead">{itemSpecs(item) || "None"}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{formatRs(item.cost_price)}</td>
                      <td className="px-4 py-3.5 text-right font-medium tabular-nums">{formatRs(item.sale_price)}</td>
                      <td className="px-4 py-3.5">
                        <StockCell item={item} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => openEdit(item)} className="btn btn-quiet btn-sm">
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(item);
                            }}
                            className="btn btn-quiet btn-sm text-terminal-deep"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone: stacked list */}
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-white md:hidden">
              {visible.map((item) => (
                <li key={item.id} className="space-y-3 p-4">
                  <div>
                    <div className="font-semibold">
                      {item.brand} {item.model}
                    </div>
                    <div className="text-sm text-lead">
                      {categoryLabel(item.category)}
                      {itemSpecs(item) ? `: ${itemSpecs(item)}` : ""}
                    </div>
                  </div>
                  <StockCell item={item} />
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="text-lead">Price </span>
                      <span className="font-medium tabular-nums">{formatRs(item.sale_price)}</span>
                      <span className="text-lead">, cost </span>
                      <span className="tabular-nums">{formatRs(item.cost_price)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openEdit(item)} className="btn btn-quiet btn-sm">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(item);
                        }}
                        className="btn btn-quiet btn-sm text-terminal-deep"
                      >
                        Delete
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
        <DeleteDialog
          item={deleting}
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
        {toast && (
          <p className="rounded-md bg-casing px-4 py-2.5 text-[15px] font-medium text-white shadow-lg">
            {toast}
          </p>
        )}
      </div>
    </div>
  );
}

function DeleteDialog({
  item,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  item: InventoryItem;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-text"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id="delete-title" className="font-display text-2xl font-bold">
          Delete {item.brand} {item.model}?
        </h2>
        <p id="delete-text" className="mt-2 text-lead">
          This removes the item and its {item.quantity} units from your stock list. It cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-md bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} autoFocus className="btn btn-quiet">
            Keep item
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn btn-danger">
            {busy ? "Deleting" : "Delete item"}
          </button>
        </div>
      </div>
    </div>
  );
}
