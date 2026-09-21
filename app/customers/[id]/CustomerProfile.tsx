"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon, { type IconName } from "@/components/Icons";
import Toast from "@/components/Toast";
import { formatPhone, formatRegNo, regNoKind, whatsappLink } from "@/lib/customers";
import { formatDate } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { Customer } from "@/lib/types";
import CustomerForm, { type CustomerLite } from "../CustomerForm";
import RegistrationBadge from "../RegistrationBadge";

const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

function InfoCard({
  icon,
  label,
  value,
  muted,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  muted?: boolean;
  tone: string;
}) {
  return (
    <div className="card flex items-start gap-3.5 p-4">
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-sm text-lead">{label}</dt>
        <dd className={`mt-0.5 break-words font-semibold tabular-nums ${muted ? "font-normal text-lead" : ""}`}>{value}</dd>
      </div>
    </div>
  );
}

export default function CustomerProfile({
  customer,
  others,
}: {
  customer: Customer;
  others: CustomerLite[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const closeForm = useCallback(() => setEditing(false), []);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    const { error } = await (await getBrowserClient()).from("customers").delete().eq("id", customer.id);
    if (error) {
      setBusy(false);
      setError(`Could not delete. ${error.message}`);
      return;
    }
    router.replace("/customers");
    router.refresh();
  }

  const kind = customer.cnic_or_ntn ? regNoKind(customer.cnic_or_ntn) : null;

  return (
    <div>
      <Link href="/customers" className="anim-rise inline-flex items-center gap-1 text-[15px] font-medium text-lead hover:text-casing">
        <Icon name="back" className="h-4 w-4" /> Customers
      </Link>

      <section className="hero-card anim-slide relative mt-3 overflow-hidden rounded-3xl p-5 text-white shadow-lift sm:p-7">
        <div className="relative flex flex-wrap items-center gap-4 sm:gap-5">
          <Avatar name={customer.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-display text-4xl font-bold leading-none sm:text-5xl">{customer.name}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <RegistrationBadge type={customer.registration_type} onDark />
              <span className="text-sm text-white/65">Customer since {formatDate(customer.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap gap-2.5">
          {customer.phone && (
            <>
              <a href={`tel:${customer.phone}`} className="on-dark btn btn-primary">
                <Icon name="phone" className="h-5 w-5" /> Call
              </a>
              <a
                href={whatsappLink(customer.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="on-dark btn bg-[#25a35a] text-white hover:bg-[#1f8f4e]"
              >
                <Icon name="chat" className="h-5 w-5" /> WhatsApp
              </a>
            </>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="on-dark btn border border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            <Icon name="edit" className="h-5 w-5" /> Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setDeleting(true);
            }}
            className="on-dark btn border border-white/15 text-red-200 hover:bg-terminal/30"
            aria-label={`Delete ${customer.name}`}
          >
            <Icon name="trash" className="h-5 w-5" />
            <span className="sm:inline">Delete</span>
          </button>
        </div>
      </section>

      <dl className="anim-rise mt-4 grid gap-3 sm:grid-cols-2" style={delay(2)}>
        <InfoCard
          icon="phone"
          label="Phone"
          value={customer.phone ? formatPhone(customer.phone) : "Not saved"}
          muted={!customer.phone}
          tone="bg-cell/10 text-cell"
        />
        <InfoCard
          icon="idcard"
          label={kind ? `${kind} (for FBR)` : "CNIC or NTN"}
          value={customer.cnic_or_ntn ? formatRegNo(customer.cnic_or_ntn) : "Not saved"}
          muted={!customer.cnic_or_ntn}
          tone="bg-focus/10 text-focus"
        />
        <InfoCard
          icon="pin"
          label="Address"
          value={customer.address || "Not saved"}
          muted={!customer.address}
          tone="bg-sun/25 text-amber-800"
        />
        <InfoCard
          icon="calendar"
          label="Last updated"
          value={formatDate(customer.updated_at)}
          tone="bg-violet-500/10 text-violet-700"
        />
      </dl>

      {/* Bills arrive in the next phase (invoicing). No made-up numbers here. */}
      <section className="card anim-rise mt-4 border-dashed border-lead/40 px-6 py-10 text-center" style={delay(3)}>
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-sun/25 text-amber-800">
          <Icon name="tag" className="h-7 w-7" />
        </span>
        <h2 className="mt-3 font-display text-2xl font-semibold">No bills yet</h2>
        <p className="mx-auto mt-1 max-w-md text-lead">
          Bills made for {customer.name} will appear here, with what they bought, what they paid and what is still due.
        </p>
      </section>

      {editing && <CustomerForm customer={customer} others={others} onClose={closeForm} onSaved={(m) => {
        setEditing(false);
        setToast(m);
        router.refresh();
      }} />}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${customer.name}?`}
          body="This removes the customer from your list. It cannot be undone."
          confirmLabel="Delete customer"
          cancelLabel="Keep customer"
          busy={busy}
          error={error}
          onCancel={() => setDeleting(false)}
          onConfirm={confirmDelete}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
