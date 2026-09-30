"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icons";
import Sheet from "@/components/Sheet";
import { getBrowserClient } from "@/lib/supabase/lazy";
import { checkRealConnectivity } from "@/lib/offline/net";
import { todayKarachi } from "@/lib/invoices";
import { formatPhone, isValidPhone, normalizePhone } from "@/lib/customers";

export type CustomerPick = { id: string; name: string; phone: string | null };

/** Sheet to write down money a customer already owes. Saves a bill with no items (see 20_udhaar_entry.sql). */
export default function AddUdhaarForm({
  customers,
  onClose,
  onSaved,
}: {
  customers: CustomerPick[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const today = todayKarachi();
  const [customer, setCustomer] = useState<CustomerPick | null>(null);
  const [search, setSearch] = useState("");
  // "New customer" mode: the customer is not in the list, so it is created together with the udhaar.
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  // Set once the new customer is really saved, so pressing Save again after an error never makes a second one.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ customer?: string; phone?: string; amount?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const list = q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) || (digits.length >= 3 && (c.phone ?? "").includes(digits))
        )
      : customers;
    return list.slice(0, 6);
  }, [customers, search]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const value = Number(amount.replace(/,/g, ""));
    const next: typeof errors = {};
    const phone = normalizePhone(newPhone);
    if (isNew) {
      if (!newName.trim()) next.customer = "Enter the customer's name.";
      else if (newName.trim().length > 120) next.customer = "Name is too long. Use 120 characters or fewer.";
      if (phone && !isValidPhone(phone)) next.phone = "Enter a phone number with 10 to 15 digits, for example 0300 1234567.";
      const same = phone && !createdId ? customers.find((c) => c.phone === phone) : undefined;
      if (same) next.phone = `This phone is already saved for ${same.name}. Search for that customer instead.`;
    } else if (!customer) next.customer = "Choose a customer.";
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) next.amount = "Enter the amount, more than 0.";
    if (!date) next.date = "Choose the date.";
    else if (date > today) next.date = "The date cannot be in the future.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setSaveError(null);
    if (!(await checkRealConnectivity())) {
      setSaveError("Saving udhaar needs internet. Try again when you are online.");
      setSaving(false);
      return;
    }
    try {
      const supabase = await getBrowserClient();
      let customerId = customer?.id ?? createdId;
      let customerName = customer?.name ?? newName.trim();
      if (isNew && !customerId) {
        const { data: created, error: cErr } = await supabase
          .from("customers")
          .insert({ name: newName.trim(), phone: phone || null, registration_type: "Unregistered" })
          .select("id,name")
          .single();
        if (cErr || !created) {
          setSaveError(cErr ? `Could not save the customer. ${cErr.message}` : "Could not save the customer.");
          setSaving(false);
          return;
        }
        customerId = created.id as string;
        customerName = created.name as string;
        setCreatedId(customerId);
      }
      const { error } = await supabase.rpc("add_udhaar_entry", {
        p_customer_id: customerId,
        p_invoice_number: number.trim() || null,
        p_invoice_date: date,
        p_amount: value,
        p_note: note.trim() || null,
      });
      if (error) {
        setSaveError(
          error.code === "42883" || error.code === "PGRST202"
            ? "The setup is missing. Run 20_udhaar_entry.sql in Supabase, then try again."
            : error.message
        );
        setSaving(false);
        return;
      }
      onSaved(`Udhaar of Rs ${value.toLocaleString("en-US")} added for ${customerName}.`);
    } catch {
      setSaveError("The connection dropped. Check the Udhaar list before you try again.");
      setSaving(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy="udhaar-form-title" dismissable={!saving}>
      <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 id="udhaar-form-title" className="font-display text-2xl font-semibold">
            Add udhaar
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-lead hover:bg-plate"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
          <p className="text-[15px] text-lead">
            Money a customer already owes you. It is saved as a bill with no items, so you can take payment on it later.
          </p>

          {/* Customer */}
          <div>
            <label htmlFor={isNew ? "ud-newname" : "ud-customer"} className="mb-1.5 block text-sm font-medium">
              Customer
            </label>
            {isNew ? (
              <div className="space-y-3 rounded-xl border border-line bg-plate/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-cell-deep">New customer</span>
                  {!createdId && (
                    <button
                      type="button"
                      className="text-sm font-semibold text-focus hover:underline"
                      onClick={() => {
                        setIsNew(false);
                        setErrors((p) => ({ ...p, customer: undefined, phone: undefined }));
                      }}
                    >
                      Choose from list
                    </button>
                  )}
                </div>
                <input
                  id="ud-newname"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setErrors((p) => ({ ...p, customer: undefined }));
                  }}
                  placeholder="Customer name"
                  autoComplete="off"
                  disabled={!!createdId}
                  aria-invalid={errors.customer ? true : undefined}
                  className="input"
                />
                <div>
                  <input
                    id="ud-newphone"
                    inputMode="tel"
                    value={newPhone}
                    onChange={(e) => {
                      setNewPhone(e.target.value);
                      setErrors((p) => ({ ...p, phone: undefined }));
                    }}
                    placeholder="Phone (optional), e.g. 0300 1234567"
                    autoComplete="off"
                    disabled={!!createdId}
                    aria-invalid={errors.phone ? true : undefined}
                    className="input"
                  />
                  {errors.phone && <p className="mt-1 text-sm text-terminal-deep">{errors.phone}</p>}
                </div>
                {createdId && (
                  <p className="text-sm text-lead">The customer is saved. Press Save udhaar again to finish.</p>
                )}
              </div>
            ) : customer ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-plate/60 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{customer.name}</span>
                  {customer.phone && <span className="block text-sm text-lead">{formatPhone(customer.phone)}</span>}
                </span>
                <button type="button" className="text-sm font-semibold text-focus hover:underline" onClick={() => setCustomer(null)}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  id="ud-customer"
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setErrors((p) => ({ ...p, customer: undefined }));
                  }}
                  placeholder="Type a name or phone"
                  autoComplete="off"
                  aria-invalid={errors.customer ? true : undefined}
                  className="input"
                />
                <ul className="mt-2 divide-y divide-line/60 overflow-hidden rounded-xl border border-line">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomer(c);
                          setErrors((p) => ({ ...p, customer: undefined }));
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-plate/70"
                      >
                        <span className="truncate font-semibold">{c.name}</span>
                        {c.phone && <span className="shrink-0 text-sm text-lead">{formatPhone(c.phone)}</span>}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNew(true);
                        setNewName(search.trim());
                        setErrors((p) => ({ ...p, customer: undefined }));
                      }}
                      className="flex w-full items-center gap-2 px-3.5 py-3 text-left font-semibold text-focus hover:bg-plate/70"
                    >
                      <Icon name="userplus" className="h-5 w-5" />
                      {search.trim() ? `Add "${search.trim()}" as a new customer` : "Add a new customer"}
                    </button>
                  </li>
                </ul>
              </>
            )}
            {errors.customer && <p className="mt-1.5 text-sm text-terminal-deep">{errors.customer}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ud-amount" className="mb-1.5 block text-sm font-medium">
                Amount (Rs)
              </label>
              <input
                id="ud-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setErrors((p) => ({ ...p, amount: undefined }));
                }}
                placeholder="0"
                aria-invalid={errors.amount ? true : undefined}
                className="input tabular-nums"
              />
              {errors.amount && <p className="mt-1 text-sm text-terminal-deep">{errors.amount}</p>}
            </div>
            <div>
              <label htmlFor="ud-date" className="mb-1.5 block text-sm font-medium">
                Date
              </label>
              <input
                id="ud-date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => {
                  setDate(e.target.value);
                  setErrors((p) => ({ ...p, date: undefined }));
                }}
                aria-invalid={errors.date ? true : undefined}
                className="input"
              />
              {errors.date && <p className="mt-1 text-sm text-terminal-deep">{errors.date}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="ud-number" className="mb-1.5 block text-sm font-medium">
              Invoice number <span className="font-normal text-lead">(optional)</span>
            </label>
            <input
              id="ud-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Leave empty to get the next number"
              autoComplete="off"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="ud-note" className="mb-1.5 block text-sm font-medium">
              Note <span className="font-normal text-lead">(optional)</span>
            </label>
            <textarea
              id="ud-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. old battery bill from the paper book"
              className="input"
            />
          </div>

          {saveError && (
            <p role="alert" className="rounded-xl border border-terminal/30 bg-terminal/10 px-3.5 py-3 text-[15px] text-terminal-deep">
              {saveError}
            </p>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-line px-5 py-4 pb-safe">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-quiet flex-1">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary flex-1">
            {saving ? "Saving..." : "Save udhaar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
