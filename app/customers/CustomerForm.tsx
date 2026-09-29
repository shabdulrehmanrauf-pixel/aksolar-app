"use client";

import { useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import ContactPickButton from "@/components/ContactPickButton";
import {
  cleanRegNo,
  customerPayload,
  customerToForm,
  formatPhone,
  formatRegNo,
  isValidPhone,
  normalizePhone,
  REGISTRATION_TYPES,
  regNoKind,
  validateCustomer,
  type CustomerErrors,
  type CustomerFormValues,
} from "@/lib/customers";
import { focusFirstError } from "@/lib/formFocus";
import { offlineSave } from "@/lib/offline/dataLayer";
import type { Customer } from "@/lib/types";
import { FALLBACK_PROVINCES } from "@/lib/fbr";
import { useFbrRef } from "@/lib/fbrRef";

export type CustomerLite = Pick<Customer, "id" | "name" | "phone">;

export default function CustomerForm({
  customer,
  others,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  /** Other customers, used only to warn about a phone number that is already saved. */
  others: CustomerLite[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<CustomerFormValues>(() => customerToForm(customer));
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Editing a field removes its red error straight away (no need to press Save to find out it is fixed).
  const set = <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const provinceRows = useFbrRef("province");
  const provinceOptions = provinceRows.length > 0 ? provinceRows.map((r) => r.label ?? r.code) : FALLBACK_PROVINCES;

  const phoneNormalized = normalizePhone(form.phone);
  const duplicate =
    phoneNormalized && isValidPhone(phoneNormalized)
      ? others.find((o) => o.id !== customer?.id && o.phone === phoneNormalized)
      : undefined;

  const reg = cleanRegNo(form.cnic_or_ntn);
  const kind = regNoKind(reg);
  const registered = form.registration_type === "Registered";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validateCustomer(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSaveError("Some fields need attention. They are marked in red.");
      focusFirstError();
      return;
    }

    setSaving(true);
    setSaveError(null);
    const payload = customerPayload(form);
    const { error, code, offline } = await offlineSave("customers", customer?.id ?? null, payload);

    if (error) {
      setSaveError(
        code === "42P01"
          ? "The customers table is missing. Run 02_customers.sql in Supabase, then try again."
          : `Could not save. ${error}`
      );
      setSaving(false);
      return;
    }
    const base = customer ? "Changes saved." : "Customer added.";
    onSaved(offline ? `${base} Saved on this device -- will sync when you're back online.` : base);
  }

  return (
    <Sheet onClose={onClose} labelledBy="customer-form-title" dismissable={!saving}>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="customer-form-title" className="font-display text-2xl font-bold">
            {customer ? "Edit customer" : "Add customer"}
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
            <legend className="mb-3 font-display text-xl font-semibold">Who is it</legend>

            <ContactPickButton
              className="mb-1"
              onPick={(c) => {
                if (c.name) set("name", c.name);
                if (c.phone) set("phone", c.phone);
              }}
            />

            <div>
              <label htmlFor="c-name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="c-name"
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="Ali Khan"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "c-name-error" : undefined}
                className="input"
              />
              {errors.name && (
                <p id="c-name-error" className="mt-1 text-sm text-terminal-deep">
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="c-phone" className="mb-1.5 block text-sm font-medium">
                Phone
              </label>
              <input
                id="c-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="0300 1234567"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? "c-phone-error" : "c-phone-hint"}
                className="input"
              />
              {errors.phone ? (
                <p id="c-phone-error" className="mt-1 text-sm text-terminal-deep">
                  {errors.phone}
                </p>
              ) : duplicate ? (
                <p id="c-phone-hint" className="mt-1 rounded-lg bg-sun/20 px-3 py-2 text-sm">
                  {duplicate.name} already uses {formatPhone(phoneNormalized)}. You can still save this customer.
                </p>
              ) : (
                <p id="c-phone-hint" className="mt-1 text-sm text-lead">
                  Optional. Used for the Call and WhatsApp buttons.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="c-address" className="mb-1.5 block text-sm font-medium">
                Address
              </label>
              <textarea
                id="c-address"
                rows={2}
                autoComplete="off"
                placeholder="Shop or house number, area, city"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className="input resize-none"
              />
            </div>

            <div>
              <label htmlFor="c-province" className="mb-1.5 block text-sm font-medium">
                Province
              </label>
              <select
                id="c-province"
                value={form.province ?? ""}
                onChange={(e) => set("province", e.target.value)}
                className="input"
              >
                <option value="">Not chosen</option>
                {provinceOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                {form.province && !provinceOptions.includes(form.province) && <option value={form.province}>{form.province}</option>}
              </select>
              <p className="mt-1 text-sm text-lead">FBR bills need the buyer&apos;s province.</p>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 font-display text-xl font-semibold">Tax details for FBR</legend>

            <div role="radiogroup" aria-label="Registration type" className="grid grid-cols-2 gap-2 rounded-2xl bg-plate p-1.5">
              {REGISTRATION_TYPES.map((r) => {
                const on = form.registration_type === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      set("registration_type", r.value);
                      setErrors((prev) => ({ ...prev, cnic_or_ntn: undefined }));
                    }}
                    className={`min-h-11 rounded-xl px-3 text-[15px] font-semibold transition-all ${
                      on ? "bg-white text-casing shadow-card" : "text-lead hover:text-casing"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <p className="-mt-1 text-sm text-lead">
              {REGISTRATION_TYPES.find((r) => r.value === form.registration_type)?.hint}
            </p>

            <div>
              <label htmlFor="c-reg" className="mb-1.5 block text-sm font-medium">
                CNIC or NTN {registered ? "" : "(optional)"}
              </label>
              <input
                id="c-reg"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="42101-1234567-1 or 1234567"
                value={form.cnic_or_ntn}
                onChange={(e) => set("cnic_or_ntn", e.target.value)}
                aria-invalid={errors.cnic_or_ntn ? true : undefined}
                aria-describedby={errors.cnic_or_ntn ? "c-reg-error" : "c-reg-hint"}
                className="input tabular-nums"
              />
              {errors.cnic_or_ntn ? (
                <p id="c-reg-error" className="mt-1 text-sm text-terminal-deep">
                  {errors.cnic_or_ntn}
                </p>
              ) : kind ? (
                <p id="c-reg-hint" className="mt-1 flex items-center gap-1.5 text-sm font-medium text-cell">
                  <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
                  {kind}: {formatRegNo(reg)}
                </p>
              ) : (
                <p id="c-reg-hint" className="mt-1 text-sm text-lead">
                  13 digits for a CNIC, 7 digits for an NTN. Dashes are fine.
                </p>
              )}
            </div>
          </fieldset>
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
              {saving ? "Saving" : customer ? "Save changes" : "Save customer"}
            </button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
