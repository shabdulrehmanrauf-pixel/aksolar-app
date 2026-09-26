"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { focusFirstError } from "@/lib/formFocus";
import { offlineSave } from "@/lib/offline/dataLayer";
import { getBrowserClient } from "@/lib/supabase/lazy";
import { formatDay } from "@/lib/invoices";
import type { Category, InventoryItem, StockMovement } from "@/lib/types";
import {
  ACCESSORY_TYPES,
  BATTERY_TYPES,
  CATEGORIES,
  DEFAULT_UOM,
  itemPayload as toPayload,
  MONEY_RE as MONEY,
  PANEL_TYPES,
  validateItem as validate,
  type ItemErrors as Errors,
  type ItemFormValues as FormState,
} from "@/lib/inventory";

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

function initialState(item: InventoryItem | null): FormState {
  if (!item) {
    return {
      category: "battery",
      brand: "",
      model: "",
      type: "",
      voltage: "12",
      plates: "",
      ah_rating: "",
      wattage: "",
      warranty_months: "",
      cost_price: "",
      sale_price: "",
      quantity: "0",
      reorder_level: "2",
      hs_code: "",
      uom: DEFAULT_UOM,
    };
  }
  return {
    category: item.category,
    brand: item.brand,
    model: item.model,
    type: item.type ?? "",
    voltage: str(item.voltage),
    plates: str(item.plates),
    ah_rating: str(item.ah_rating),
    wattage: str(item.wattage),
    warranty_months: str(item.warranty_months),
    cost_price: str(item.cost_price),
    sale_price: str(item.sale_price),
    quantity: str(item.quantity),
    reorder_level: str(item.reorder_level),
    hs_code: item.hs_code ?? "",
    uom: item.uom,
  };
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  inputMode,
  placeholder,
  list,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  inputMode?: "text" | "numeric" | "decimal";
  placeholder?: string;
  list?: string;
  autoFocus?: boolean;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        placeholder={placeholder}
        list={list}
        autoFocus={autoFocus}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="input"
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-terminal-deep">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-lead">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const REASON_LABEL: Record<StockMovement["reason"], string> = {
  opening: "Opening stock",
  purchase: "Purchase received",
  purchase_cancel: "Purchase cancelled",
  adjustment: "Adjustment",
  sale: "Sold",
};

/** Recent quantity changes for this item, from `stock_movements` (decision D6). Loaded lazily,
 * only once the section is opened, since most edits never need it. */
function StockHistory({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StockMovement[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open || rows !== null || loading) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const supabase = await getBrowserClient();
        const { data, error } = await supabase
          .from("stock_movements")
          .select("*")
          .eq("inventory_id", itemId)
          .order("created_at", { ascending: false })
          .limit(30);
        if (cancelled) return;
        if (error) setLoadError(true);
        else setRows((data ?? []) as StockMovement[]);
      } catch {
        if (!cancelled) setLoadError(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rows, loading, itemId]);

  return (
    <details className="rounded-2xl bg-plate/60 p-3.5" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-lead">Stock history</summary>
      <div className="mt-3">
        {loading && <p className="text-sm text-lead">Loading</p>}
        {loadError && (
          <p className="text-sm text-lead">
            Could not be loaded. Run <code className="rounded bg-white px-1 py-0.5">12_suppliers_purchases.sql</code> in Supabase if you haven't yet.
          </p>
        )}
        {rows && rows.length === 0 && <p className="text-sm text-lead">No stock movements recorded yet.</p>}
        {rows && rows.length > 0 && (
          <ul className="space-y-1.5">
            {rows.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-lead">
                  {formatDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(m.created_at)))} ·{" "}
                  {REASON_LABEL[m.reason]}
                </span>
                <span className={`font-semibold tabular-nums ${m.change >= 0 ? "text-cell-deep" : "text-terminal-deep"}`}>
                  {m.change >= 0 ? "+" : ""}
                  {m.change}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export default function ItemForm({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(item));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function changeCategory(category: Category) {
    setForm((prev) => ({ ...prev, category, type: "" }));
    setErrors({});
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSaveError("Some fields need attention. They are marked in red.");
      focusFirstError();
      return;
    }

    setSaving(true);
    setSaveError(null);
    const payload = toPayload(form);
    const { error, offline } = await offlineSave("inventory", item?.id ?? null, payload);

    if (error) {
      setSaveError(`Could not save. ${error}`);
      setSaving(false);
      return;
    }
    const base = item ? "Changes saved." : "Item added to stock.";
    onSaved(offline ? `${base} Saved on this device -- will sync when you're back online.` : base);
  }

  const typeOptions =
    form.category === "panel" ? PANEL_TYPES : form.category === "accessory" ? ACCESSORY_TYPES : [];

  const saleBelowCost =
    MONEY.test(form.cost_price.trim()) &&
    MONEY.test(form.sale_price.trim()) &&
    Number(form.sale_price) < Number(form.cost_price);

  return (
    <Sheet onClose={onClose} labelledBy="item-form-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="item-form-title" className="font-display text-2xl font-bold">
            {item ? "Edit item" : "Add item"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead transition-colors hover:bg-plate disabled:opacity-60"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto px-5 py-6">
          <fieldset className="space-y-4">
            <legend className="mb-3 font-display text-xl font-semibold">What is it</legend>

            <div>
              <label htmlFor="category" className="mb-1.5 block text-sm font-medium">
                Category
              </label>
              <select
                id="category"
                value={form.category}
                onChange={(e) => changeCategory(e.target.value as Category)}
                className="input"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                id="brand"
                label="Brand"
                value={form.brand}
                onChange={(v) => set("brand", v)}
                error={errors.brand}
                placeholder="Osaka"
                autoFocus
              />
              <TextField
                id="model"
                label="Model"
                value={form.model}
                onChange={(v) => set("model", v)}
                error={errors.model}
                placeholder="200Ah Tubular"
              />
            </div>

            {form.category === "battery" ? (
              <>
                <div>
                  <label htmlFor="type" className="mb-1.5 block text-sm font-medium">
                    Battery type
                  </label>
                  <select
                    id="type"
                    value={form.type}
                    onChange={(e) => set("type", e.target.value)}
                    aria-invalid={errors.type ? true : undefined}
                    aria-describedby={errors.type ? "type-error" : undefined}
                    className="input"
                  >
                    <option value="">Choose a type</option>
                    {BATTERY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {errors.type && (
                    <p id="type-error" className="mt-1 text-sm text-terminal-deep">
                      {errors.type}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <TextField
                    id="voltage"
                    label="Voltage (V)"
                    value={form.voltage}
                    onChange={(v) => set("voltage", v)}
                    error={errors.voltage}
                    inputMode="decimal"
                  />
                  <TextField
                    id="plates"
                    label="Plates"
                    value={form.plates}
                    onChange={(v) => set("plates", v)}
                    error={errors.plates}
                    inputMode="numeric"
                  />
                  <TextField
                    id="ah_rating"
                    label="Ah rating"
                    value={form.ah_rating}
                    onChange={(v) => set("ah_rating", v)}
                    error={errors.ah_rating}
                    inputMode="decimal"
                  />
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  id="type"
                  label={form.category === "panel" ? "Panel type" : "Kind of accessory"}
                  value={form.type}
                  onChange={(v) => set("type", v)}
                  error={errors.type}
                  list="type-options"
                  hint="Pick a suggestion or type your own."
                />
                {form.category === "panel" && (
                  <TextField
                    id="wattage"
                    label="Wattage (W)"
                    value={form.wattage}
                    onChange={(v) => set("wattage", v)}
                    error={errors.wattage}
                    inputMode="numeric"
                  />
                )}
                <datalist id="type-options">
                  {typeOptions.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            )}

            <div className="max-w-[12rem]">
              <TextField
                id="warranty_months"
                label="Warranty (months)"
                value={form.warranty_months}
                onChange={(v) => set("warranty_months", v)}
                error={errors.warranty_months}
                inputMode="numeric"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 font-display text-xl font-semibold">Price and stock</legend>
            <div className="grid grid-cols-2 gap-4">
              <TextField
                id="cost_price"
                label="Cost price (Rs)"
                value={form.cost_price}
                onChange={(v) => set("cost_price", v)}
                error={errors.cost_price}
                inputMode="decimal"
                hint="What you pay per unit."
              />
              <TextField
                id="sale_price"
                label="Sale price (Rs)"
                value={form.sale_price}
                onChange={(v) => set("sale_price", v)}
                error={errors.sale_price}
                inputMode="decimal"
                hint="What the customer pays per unit."
              />
            </div>
            {saleBelowCost && (
              <p className="rounded-xl bg-sun/20 px-3 py-2 text-sm">
                The sale price is lower than the cost price. You can still save it.
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <TextField
                id="quantity"
                label="Quantity in stock"
                value={form.quantity}
                onChange={(v) => set("quantity", v)}
                error={errors.quantity}
                inputMode="numeric"
              />
              <TextField
                id="reorder_level"
                label="Reorder level"
                value={form.reorder_level}
                onChange={(v) => set("reorder_level", v)}
                error={errors.reorder_level}
                inputMode="numeric"
                hint="Item shows as low at or below this number."
              />
            </div>
            {item && (
              <Link href={`/purchases/new?item=${item.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-focus hover:underline">
                <Icon name="truck" className="h-4 w-4" /> Restock this item (new purchase bill)
              </Link>
            )}
          </fieldset>

          {item && <StockHistory itemId={item.id} />}

          <details className="rounded-xl border border-line">
            <summary className="cursor-pointer px-4 py-3 font-display text-xl font-semibold">
              Tax details for FBR (optional)
            </summary>
            <div className="space-y-4 border-t border-line px-4 py-4">
              <p className="text-sm text-lead">
                Not needed yet. Filling these in now saves time when invoices
                are connected to FBR later.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  id="hs_code"
                  label="HS code"
                  value={form.hs_code}
                  onChange={(v) => set("hs_code", v)}
                  error={errors.hs_code}
                  placeholder="0000.0000"
                  inputMode="decimal"
                />
                <TextField
                  id="uom"
                  label="Unit of measure"
                  value={form.uom}
                  onChange={(v) => set("uom", v)}
                  error={errors.uom}
                  hint="Must match FBR's list exactly, including capital letters."
                />
              </div>
            </div>
          </details>
        </div>

        <div className="pb-safe border-t border-line bg-white px-5 py-4">
          {saveError && (
            <p role="alert" className="mb-3 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="btn btn-quiet">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary min-w-28">
              {saving ? "Saving" : "Save item"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
