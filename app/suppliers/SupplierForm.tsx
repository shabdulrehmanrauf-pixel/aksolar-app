"use client";

import { useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { focusFirstError } from "@/lib/formFocus";
import {
  friendlySupplierError,
  supplierPayload,
  supplierToForm,
  validateSupplier,
  type SupplierErrors,
  type SupplierFormValues,
} from "@/lib/suppliers";
import { checkRealConnectivity } from "@/lib/offline/net";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { Supplier, SupplierBalance } from "@/lib/types";

export default function SupplierForm({
  supplier,
  others,
  onClose,
  onSaved,
}: {
  supplier: Supplier | SupplierBalance | null;
  /** Other suppliers, used only to warn about a name that is already saved. */
  others: Pick<Supplier, "id" | "name">[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<SupplierFormValues>(() => supplierToForm(supplier));
  const [errors, setErrors] = useState<SupplierErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isActive = "is_active" in (supplier ?? {}) ? (supplier as SupplierBalance).is_active : true;
  const [active, setActive] = useState(isActive);
  const [activeBusy, setActiveBusy] = useState(false);

  const set = <K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const nameTaken = others.some(
    (o) => o.id !== supplier?.id && o.name.trim().toLowerCase() === form.name.trim().toLowerCase()
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validateSupplier(form);
    if (nameTaken) found.name = "A supplier with this name already exists.";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSaveError("Some fields need attention. They are marked in red.");
      focusFirstError();
      return;
    }

    setSaving(true);
    setSaveError(null);

    const online = await checkRealConnectivity();
    if (!online) {
      setSaveError("Saving a supplier needs a connection. Try again once you're back online.");
      setSaving(false);
      return;
    }

    try {
      const supabase = await getBrowserClient();
      const payload = supplierPayload(form);
      const { error } = await supabase.rpc("save_supplier", {
        p_id: supplier?.id ?? null,
        p_name: payload.name,
        p_phone: payload.phone,
        p_address: payload.address,
        p_note: payload.note,
        p_ntn_or_cnic: payload.ntn_or_cnic,
        p_opening_balance: payload.opening_balance,
        p_opening_balance_date: payload.opening_balance_date,
      });
      if (error) {
        setSaveError(
          error.code === "42883" || error.code === "PGRST202"
            ? "The suppliers setup is missing. Run 12b_supplier_save.sql in Supabase, then try again."
            : friendlySupplierError(error)
        );
        setSaving(false);
        return;
      }
      onSaved(supplier ? "Changes saved." : "Supplier added.");
    } catch {
      setSaveError("The connection dropped. Refresh this page to see if it saved before you try again.");
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!supplier || activeBusy) return;
    setActiveBusy(true);
    setSaveError(null);
    try {
      const supabase = await getBrowserClient();
      const next = !active;
      const { error } = await supabase.rpc("set_supplier_active", { p_id: supplier.id, p_is_active: next });
      if (error) {
        setSaveError(friendlySupplierError(error));
        setActiveBusy(false);
        return;
      }
      setActive(next);
      setActiveBusy(false);
      onSaved(next ? "Supplier marked active again." : "Supplier marked inactive. Their history stays intact.");
    } catch {
      setSaveError("The connection dropped. Try again.");
      setActiveBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy="supplier-form-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="supplier-form-title" className="font-display text-2xl font-bold">
            {supplier ? "Edit supplier" : "Add supplier"}
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

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6">
          <fieldset className="space-y-4">
            <legend className="mb-3 font-display text-xl font-semibold">Who they are</legend>

            <div>
              <label htmlFor="s-name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="s-name"
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="Osaka Distributors"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "s-name-error" : undefined}
                className="input"
              />
              {errors.name && (
                <p id="s-name-error" className="mt-1 text-sm text-terminal-deep">
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="s-phone" className="mb-1.5 block text-sm font-medium">
                Phone
              </label>
              <input
                id="s-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="0300 1234567"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label htmlFor="s-address" className="mb-1.5 block text-sm font-medium">
                Address
              </label>
              <textarea
                id="s-address"
                rows={2}
                autoComplete="off"
                placeholder="Shop or warehouse address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className="input resize-none"
              />
            </div>

            <div>
              <label htmlFor="s-ntn" className="mb-1.5 block text-sm font-medium">
                NTN or CNIC (optional)
              </label>
              <input
                id="s-ntn"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="42101-1234567-1 or 1234567"
                value={form.ntn_or_cnic}
                onChange={(e) => set("ntn_or_cnic", e.target.value)}
                aria-invalid={errors.ntn_or_cnic ? true : undefined}
                aria-describedby={errors.ntn_or_cnic ? "s-ntn-error" : undefined}
                className="input tabular-nums"
              />
              {errors.ntn_or_cnic && (
                <p id="s-ntn-error" className="mt-1 text-sm text-terminal-deep">
                  {errors.ntn_or_cnic}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="s-note" className="mb-1.5 block text-sm font-medium">
                Note
              </label>
              <input
                id="s-note"
                type="text"
                autoComplete="off"
                placeholder="Optional"
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                className="input"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 font-display text-xl font-semibold">
              {supplier ? "Opening balance" : "Opening balance (if any)"}
            </legend>
            <p className="-mt-1 text-sm text-lead">
              What this supplier was owed, or owed you, on the day you started using this app. Leave at 0 if
              they're a brand-new supplier. This is a one-time starting figure -- decision D12: only the owner
              can supply the real numbers.
            </p>

            <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-2 rounded-2xl bg-plate p-1.5">
              {(
                [
                  { value: "we_owe", label: "We owe them" },
                  { value: "they_owe", label: "They owe us" },
                ] as const
              ).map((d) => {
                const on = form.opening_balance_direction === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("opening_balance_direction", d.value)}
                    className={`min-h-11 rounded-xl px-3 text-[15px] font-semibold transition-all ${
                      on ? "bg-white text-casing shadow-card" : "text-lead hover:text-casing"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="s-ob" className="mb-1.5 block text-sm font-medium">
                  Amount (Rs)
                </label>
                <input
                  id="s-ob"
                  value={form.opening_balance}
                  onChange={(e) => set("opening_balance", e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="0"
                  aria-invalid={errors.opening_balance ? true : undefined}
                  className="input tabular-nums"
                />
                {errors.opening_balance && <p className="mt-1 text-sm text-terminal-deep">{errors.opening_balance}</p>}
              </div>
              <div>
                <label htmlFor="s-obd" className="mb-1.5 block text-sm font-medium">
                  As of
                </label>
                <input
                  id="s-obd"
                  type="date"
                  value={form.opening_balance_date}
                  onChange={(e) => set("opening_balance_date", e.target.value)}
                  aria-invalid={errors.opening_balance_date ? true : undefined}
                  className="input"
                />
                {errors.opening_balance_date && (
                  <p className="mt-1 text-sm text-terminal-deep">{errors.opening_balance_date}</p>
                )}
              </div>
            </div>
          </fieldset>

          {supplier && (
            <fieldset className="space-y-2">
              <legend className="mb-1 font-display text-xl font-semibold">Status</legend>
              <p className="text-sm text-lead">
                {active
                  ? "Active suppliers appear when choosing who to buy from on a new purchase bill."
                  : "Inactive suppliers keep their full history but no longer appear when starting a new purchase bill."}
              </p>
              <button type="button" onClick={toggleActive} disabled={activeBusy} className={`btn ${active ? "btn-quiet" : "btn-primary"} btn-sm mt-1`}>
                {activeBusy ? "Saving" : active ? "Mark inactive" : "Mark active"}
              </button>
            </fieldset>
          )}
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
            <button type="submit" disabled={saving} className="btn btn-primary min-w-36">
              {saving ? "Saving" : supplier ? "Save changes" : "Save supplier"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
