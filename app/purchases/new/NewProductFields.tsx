"use client";

import { useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { ACCESSORY_TYPES, BATTERY_TYPES, CATEGORIES, DEFAULT_UOM, PANEL_TYPES, typeOptionsFor } from "@/lib/inventory";
import { focusFirstError } from "@/lib/formFocus";
import type { Category } from "@/lib/types";
import type { NewPurchaseItemDraft } from "@/lib/purchases";

type Errors = Partial<Record<keyof NewPurchaseItemDraft, string>>;
const NUM = /^\d+(\.\d{1,2})?$/;

function empty(): NewPurchaseItemDraft {
  return {
    category: "battery",
    brand: "",
    model: "",
    type: "",
    voltage: "",
    plates: "",
    ah_rating: "",
    wattage: "",
    warranty_months: "",
    sale_price: "",
    reorder_level: "",
    hs_code: "",
    uom: "",
  };
}

function validate(f: NewPurchaseItemDraft): Errors {
  const e: Errors = {};
  if (!f.brand.trim()) e.brand = "Enter the brand or product name.";
  if (!f.model.trim()) e.model = "Enter the model, size or a short description.";
  if (f.sale_price && (!NUM.test(f.sale_price) || Number(f.sale_price) < 0)) e.sale_price = "Enter a valid price, or leave it empty.";
  if (f.reorder_level && (!/^\d+$/.test(f.reorder_level) || Number(f.reorder_level) < 0)) e.reorder_level = "Enter a whole number, or leave it empty.";
  return e;
}

/** Sheet for the "not in stock yet" purchase-line product. Unlike Inventory's Add-item form, this
 * does NOT create anything in the database -- it just hands a validated draft back to the purchase
 * line, which is only created (atomically, along with the rest of the bill) once the whole
 * purchase is saved via create_purchase(). */
export default function NewProductFields({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (draft: NewPurchaseItemDraft, displayName: string) => void;
}) {
  const [form, setForm] = useState<NewPurchaseItemDraft>(empty());
  const [errors, setErrors] = useState<Errors>({});
  const [otherType, setOtherType] = useState(false);
  const typeOptions = typeOptionsFor(form.category);

  const set = <K extends keyof NewPurchaseItemDraft>(key: K, value: NewPurchaseItemDraft[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  function changeCategory(category: Category) {
    setForm((prev) => ({ ...empty(), category, brand: prev.brand, model: prev.model }));
    setOtherType(false);
    setErrors({});
  }

  const OTHER_TYPE = "__other__";
  function changeType(value: string) {
    if (value === OTHER_TYPE) {
      setOtherType(true);
      set("type", "");
    } else {
      setOtherType(false);
      set("type", value);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError();
      return;
    }
    const specs = [form.type, form.voltage && `${form.voltage}V`, form.ah_rating && `${form.ah_rating}Ah`, form.wattage && `${form.wattage}W`]
      .filter(Boolean)
      .join(" · ");
    const displayName = [form.brand.trim(), form.model.trim(), specs].filter(Boolean).join(" ");
    onAdd(form, displayName);
  }

  return (
    <Sheet onClose={onClose} labelledBy="new-product-title">
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="new-product-title" className="font-display text-2xl font-bold">
            New product
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-plate">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
          <p className="text-sm text-lead">
            Not in your inventory yet -- fill in the basics now. It's created for real once you save this
            purchase, with this quantity and cost.
          </p>

          <div>
            <label htmlFor="np-category" className="mb-1.5 block text-sm font-medium">
              Category
            </label>
            <select id="np-category" value={form.category} onChange={(e) => changeCategory(e.target.value as Category)} className="input">
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="np-brand" className="mb-1.5 block text-sm font-medium">
                Brand
              </label>
              <input id="np-brand" autoFocus value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Osaka" aria-invalid={!!errors.brand} className="input" />
              {errors.brand && <p className="mt-1 text-sm text-terminal-deep">{errors.brand}</p>}
            </div>
            <div>
              <label htmlFor="np-model" className="mb-1.5 block text-sm font-medium">
                Model
              </label>
              <input id="np-model" value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="200Ah Tubular" aria-invalid={!!errors.model} className="input" />
              {errors.model && <p className="mt-1 text-sm text-terminal-deep">{errors.model}</p>}
            </div>
          </div>

          {form.category === "battery" ? (
            <>
              <div>
                <label htmlFor="np-type" className="mb-1.5 block text-sm font-medium">
                  Battery type
                </label>
                <select id="np-type" value={form.type} onChange={(e) => set("type", e.target.value)} className="input">
                  <option value="">Choose a type</option>
                  {BATTERY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="np-voltage" className="mb-1.5 block text-sm font-medium">
                    Voltage (V)
                  </label>
                  <input id="np-voltage" inputMode="decimal" value={form.voltage} onChange={(e) => set("voltage", e.target.value)} className="input" />
                </div>
                <div>
                  <label htmlFor="np-plates" className="mb-1.5 block text-sm font-medium">
                    Plates
                  </label>
                  <input id="np-plates" inputMode="numeric" value={form.plates} onChange={(e) => set("plates", e.target.value)} className="input" />
                </div>
                <div>
                  <label htmlFor="np-ah" className="mb-1.5 block text-sm font-medium">
                    Ah rating
                  </label>
                  <input id="np-ah" inputMode="decimal" value={form.ah_rating} onChange={(e) => set("ah_rating", e.target.value)} className="input" />
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="np-type2" className="mb-1.5 block text-sm font-medium">
                  {form.category === "panel" ? "Panel type" : "Kind of accessory"}
                </label>
                <select id="np-type2" value={otherType ? OTHER_TYPE : form.type} onChange={(e) => changeType(e.target.value)} className="input">
                  <option value="">Choose a type</option>
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value={OTHER_TYPE}>Other (type your own)</option>
                </select>
                {otherType && (
                  <input
                    id="np-type2-other"
                    type="text"
                    autoFocus
                    autoComplete="off"
                    value={form.type}
                    onChange={(e) => set("type", e.target.value)}
                    placeholder="Type it in"
                    className="input mt-2"
                  />
                )}
              </div>
              {form.category === "panel" && (
                <div>
                  <label htmlFor="np-wattage" className="mb-1.5 block text-sm font-medium">
                    Wattage (W)
                  </label>
                  <input id="np-wattage" inputMode="numeric" value={form.wattage} onChange={(e) => set("wattage", e.target.value)} className="input" />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="np-warranty" className="mb-1.5 block text-sm font-medium">
                Warranty (months)
              </label>
              <input id="np-warranty" inputMode="numeric" value={form.warranty_months} onChange={(e) => set("warranty_months", e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="np-reorder" className="mb-1.5 block text-sm font-medium">
                Reorder level
              </label>
              <input id="np-reorder" inputMode="numeric" value={form.reorder_level} onChange={(e) => set("reorder_level", e.target.value)} placeholder="Optional" aria-invalid={!!errors.reorder_level} className="input" />
              {errors.reorder_level && <p className="mt-1 text-sm text-terminal-deep">{errors.reorder_level}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="np-sale-price" className="mb-1.5 block text-sm font-medium">
              Sale price (Rs)
            </label>
            <input id="np-sale-price" inputMode="decimal" value={form.sale_price} onChange={(e) => set("sale_price", e.target.value)} placeholder="What you'll charge customers -- optional for now" aria-invalid={!!errors.sale_price} className="input tabular-nums" />
            {errors.sale_price && <p className="mt-1 text-sm text-terminal-deep">{errors.sale_price}</p>}
          </div>

          <details className="rounded-2xl bg-plate/60 p-3.5">
            <summary className="cursor-pointer text-sm font-semibold text-lead">More (HS code, unit)</summary>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="np-hs" className="mb-1.5 block text-sm font-medium">
                  HS code
                </label>
                <input id="np-hs" value={form.hs_code} onChange={(e) => set("hs_code", e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="np-uom" className="mb-1.5 block text-sm font-medium">
                  Unit
                </label>
                <input id="np-uom" value={form.uom} onChange={(e) => set("uom", e.target.value)} placeholder={DEFAULT_UOM} className="input" />
              </div>
            </div>
          </details>
        </div>

        <div className="pb-safe border-t border-line bg-white px-5 py-4">
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-quiet">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add to bill
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
