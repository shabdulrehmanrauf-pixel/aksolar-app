"use client";

import { useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { ACCESSORY_TYPES, BATTERY_TYPES, CATEGORIES, DEFAULT_UOM, PANEL_TYPES } from "@/lib/inventory";
import { focusFirstError } from "@/lib/formFocus";
import { offlineSave } from "@/lib/offline/dataLayer";
import type { Category } from "@/lib/types";
import type { BillItem } from "./NewBill";

/**
 * Quick "not in stock" form used from the bill screen. It is a trimmed version of the
 * Inventory item form: just enough to bill the item today. It always creates a real
 * inventory row (quantity = the amount being sold now), so the item is searchable from
 * Inventory afterwards and its stock can be corrected there any time.
 */
type FormState = {
  category: Category;
  brand: string;
  model: string;
  type: string;
  quantity: string;
  rate: string;
  cost_price: string;
};

type Errors = Partial<Record<keyof FormState, string>>;

const MONEY = /^\d+(\.\d{1,2})?$/;
const WHOLE = /^\d{1,6}$/;

function initialState(): FormState {
  return { category: "battery", brand: "", model: "", type: "", quantity: "1", rate: "", cost_price: "" };
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.brand.trim()) e.brand = "Enter the brand or product name.";
  if (!f.model.trim()) e.model = "Enter the model, size or a short description.";
  if (!WHOLE.test(f.quantity.trim()) || Number(f.quantity) < 1) {
    e.quantity = "Enter a whole number, 1 or more.";
  }
  if (!MONEY.test(f.rate.trim()) || Number(f.rate) < 0) {
    e.rate = "Enter the sale price, for example 15500. Up to 2 decimals.";
  }
  const cost = f.cost_price.trim();
  if (cost && (!MONEY.test(cost) || Number(cost) < 0)) {
    e.cost_price = "Enter a valid cost price, or leave it empty.";
  }
  return e;
}

export default function ManualItemForm({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (item: BillItem) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState());
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const typeOptions = form.category === "battery" ? BATTERY_TYPES : form.category === "panel" ? PANEL_TYPES : ACCESSORY_TYPES;

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
    const quantity = Number(form.quantity);
    const rate = Number(form.rate);
    const cost = form.cost_price.trim() ? Number(form.cost_price) : 0;

    const payload = {
      category: form.category,
      brand: form.brand.trim(),
      model: form.model.trim(),
      type: form.type.trim() || null,
      cost_price: cost,
      sale_price: rate,
      // The whole quantity typed here is being billed right now, so stock starts (and,
      // once this bill saves, stays) at exactly that amount unless it is topped up later.
      quantity,
      reorder_level: 0,
      uom: DEFAULT_UOM,
    };

    // offlineSave writes to the local cache immediately (working even with no
    // connection) and either saves to Supabase now or queues it for when the
    // connection returns. Either way we already know the row's id.
    const { error, id } = await offlineSave("inventory", null, payload);

    if (error) {
      setSaveError(`Could not add this item. ${error}`);
      setSaving(false);
      return;
    }

    onAdded({
      id,
      category: payload.category,
      brand: payload.brand,
      model: payload.model,
      type: payload.type,
      voltage: null,
      plates: null,
      ah_rating: null,
      wattage: null,
      warranty_months: null,
      cost_price: payload.cost_price,
      sale_price: payload.sale_price,
      quantity: payload.quantity,
    } as BillItem);
  }

  return (
    <Sheet onClose={onClose} labelledBy="manual-item-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="manual-item-title" className="font-display text-2xl font-bold">
              Item not in stock
            </h2>
            <p className="mt-0.5 text-sm text-lead">It will be added to Inventory and to this bill.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lead transition-colors hover:bg-plate disabled:opacity-60"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
          <p className="rounded-xl bg-sun/20 px-3 py-2.5 text-sm">
            This product is not in your inventory yet. Fill this in and it will be created automatically, with the
            quantity below as its stock.
          </p>

          <div>
            <label htmlFor="mi-category" className="mb-1.5 block text-sm font-medium">
              Category
            </label>
            <select
              id="mi-category"
              value={form.category}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, category: e.target.value as Category, type: "" }));
                setErrors({});
              }}
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
            <div>
              <label htmlFor="mi-brand" className="mb-1.5 block text-sm font-medium">
                Brand
              </label>
              <input
                id="mi-brand"
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="Osaka"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
                aria-invalid={errors.brand ? true : undefined}
                className="input"
              />
              {errors.brand && <p className="mt-1 text-sm text-terminal-deep">{errors.brand}</p>}
            </div>
            <div>
              <label htmlFor="mi-model" className="mb-1.5 block text-sm font-medium">
                Model
              </label>
              <input
                id="mi-model"
                type="text"
                autoComplete="off"
                placeholder="200Ah Tubular"
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                aria-invalid={errors.model ? true : undefined}
                className="input"
              />
              {errors.model && <p className="mt-1 text-sm text-terminal-deep">{errors.model}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="mi-type" className="mb-1.5 block text-sm font-medium">
              Type or spec (optional)
            </label>
            <input
              id="mi-type"
              type="text"
              list="mi-type-options"
              autoComplete="off"
              placeholder="Pick a suggestion or type your own"
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              className="input"
            />
            <datalist id="mi-type-options">
              {typeOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="mi-quantity" className="mb-1.5 block text-sm font-medium">
                Quantity
              </label>
              <input
                id="mi-quantity"
                type="text"
                inputMode="numeric"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value.replace(/\D/g, ""))}
                aria-invalid={errors.quantity ? true : undefined}
                className="input tabular-nums"
              />
              {errors.quantity && <p className="mt-1 text-sm text-terminal-deep">{errors.quantity}</p>}
            </div>
            <div>
              <label htmlFor="mi-rate" className="mb-1.5 block text-sm font-medium">
                Sale price (Rs)
              </label>
              <input
                id="mi-rate"
                type="text"
                inputMode="decimal"
                value={form.rate}
                onChange={(e) => set("rate", e.target.value.replace(/[^\d.]/g, ""))}
                aria-invalid={errors.rate ? true : undefined}
                className="input tabular-nums"
              />
              {errors.rate && <p className="mt-1 text-sm text-terminal-deep">{errors.rate}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="mi-cost" className="mb-1.5 block text-sm font-medium">
              Cost price (Rs, optional)
            </label>
            <input
              id="mi-cost"
              type="text"
              inputMode="decimal"
              value={form.cost_price}
              onChange={(e) => set("cost_price", e.target.value.replace(/[^\d.]/g, ""))}
              aria-invalid={errors.cost_price ? true : undefined}
              placeholder="Leave empty if unknown"
              className="input tabular-nums"
            />
            {errors.cost_price && <p className="mt-1 text-sm text-terminal-deep">{errors.cost_price}</p>}
          </div>
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
            <button type="submit" disabled={saving} className="btn btn-primary min-w-40">
              {saving ? "Adding" : "Add to bill"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
