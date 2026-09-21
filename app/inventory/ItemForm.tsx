"use client";

import { useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { focusFirstError } from "@/lib/formFocus";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { Category, InventoryItem } from "@/lib/types";
import {
  ACCESSORY_TYPES,
  BATTERY_TYPES,
  CATEGORIES,
  DEFAULT_UOM,
  PANEL_TYPES,
} from "@/lib/inventory";

type FormState = {
  category: Category;
  brand: string;
  model: string;
  type: string;
  voltage: string;
  plates: string;
  ah_rating: string;
  wattage: string;
  warranty_months: string;
  cost_price: string;
  sale_price: string;
  quantity: string;
  reorder_level: string;
  hs_code: string;
  uom: string;
};

type Errors = Partial<Record<keyof FormState, string>>;

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

const MONEY = /^\d+(\.\d{1,2})?$/;
const WHOLE = /^\d+$/;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.brand.trim()) e.brand = "Enter the brand.";
  if (!f.model.trim()) e.model = "Enter the model.";
  if (f.category === "battery" && !f.type) e.type = "Choose the battery type.";

  const optionalDecimal = (key: keyof FormState, label: string) => {
    const v = f[key].trim();
    if (v && (!MONEY.test(v) || Number(v) <= 0)) e[key] = `${label} must be a number above 0.`;
  };
  const optionalWhole = (key: keyof FormState, label: string) => {
    const v = f[key].trim();
    if (v && (!WHOLE.test(v) || Number(v) <= 0)) e[key] = `${label} must be a whole number above 0.`;
  };

  if (f.category === "battery") {
    optionalDecimal("voltage", "Voltage");
    optionalWhole("plates", "Plates");
    optionalDecimal("ah_rating", "Ah rating");
  }
  if (f.category === "panel") optionalWhole("wattage", "Wattage");
  optionalWhole("warranty_months", "Warranty");

  if (!MONEY.test(f.cost_price.trim())) e.cost_price = "Enter the cost price, for example 42000. Up to 2 decimals.";
  if (!MONEY.test(f.sale_price.trim())) e.sale_price = "Enter the sale price, for example 45000. Up to 2 decimals.";
  if (!WHOLE.test(f.quantity.trim())) e.quantity = "Enter a whole number, 0 or more.";
  if (!WHOLE.test(f.reorder_level.trim())) e.reorder_level = "Enter a whole number, 0 or more.";

  const hs = f.hs_code.trim();
  if (hs && !/^\d{4}\.\d{4}$/.test(hs)) e.hs_code = "Use 4 digits, a dot, then 4 digits. Example: 8507.2000";
  if (!f.uom.trim()) e.uom = "Enter the unit of measure.";

  return e;
}

function toPayload(f: FormState) {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const isBattery = f.category === "battery";
  const isPanel = f.category === "panel";
  return {
    category: f.category,
    brand: f.brand.trim(),
    model: f.model.trim(),
    type: f.type.trim() || null,
    voltage: isBattery ? num(f.voltage) : null,
    plates: isBattery ? num(f.plates) : null,
    ah_rating: isBattery ? num(f.ah_rating) : null,
    wattage: isPanel ? num(f.wattage) : null,
    warranty_months: num(f.warranty_months),
    cost_price: Number(f.cost_price),
    sale_price: Number(f.sale_price),
    quantity: Number(f.quantity),
    reorder_level: Number(f.reorder_level),
    hs_code: f.hs_code.trim() || null,
    uom: f.uom.trim(),
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
    const supabase = await getBrowserClient();
    const payload = toPayload(form);
    const { error } = item
      ? await supabase.from("inventory").update(payload).eq("id", item.id)
      : await supabase.from("inventory").insert(payload);

    if (error) {
      setSaveError(`Could not save. ${error.message}`);
      setSaving(false);
      return;
    }
    onSaved(item ? "Changes saved." : "Item added to stock.");
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
          </fieldset>

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
