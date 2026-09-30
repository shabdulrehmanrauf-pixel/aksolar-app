"use client";

import { useCallback, useEffect, useState } from "react";
import { useRoleInfo } from "@/components/RoleProvider";
import { can } from "@/lib/roles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon, { type IconName } from "@/components/Icons";
import Toast from "@/components/Toast";
import { formatPhone, formatRegNo, regNoKind, whatsappLink } from "@/lib/customers";
import { formatDate, formatRs } from "@/lib/format";
import { formatDay } from "@/lib/invoices";
import { deleteCustomerWithBills } from "@/lib/customerDelete";
import type { Customer, Invoice } from "@/lib/types";
import PayBadge from "@/app/sales/PayBadge";
import CustomerForm, { type CustomerLite } from "../CustomerForm";
import CustomerLedger, { type CustomerPayment } from "./CustomerLedger";
import RegistrationBadge from "../RegistrationBadge";

export type CustomerBill = Pick<
  Invoice,
  "id" | "invoice_number" | "invoice_date" | "total_value" | "paid_total" | "due_total" | "payment_status" | "status"
>;

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
  bills,
  billsReady,
  payments,
  paymentsReady,
}: {
  customer: Customer;
  others: CustomerLite[];
  bills: CustomerBill[];
  billsReady: boolean;
  payments: CustomerPayment[];
  paymentsReady: boolean;
}) {
  const router = useRouter();
  const roleInfo = useRoleInfo();
  const canEditCust = can(roleInfo, "customers.edit");
  const canDeleteCust = can(roleInfo, "customers.delete");
  const canBill = can(roleInfo, "sales.create");
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
    const { error } = await deleteCustomerWithBills(customer.id);
    if (error) {
      setBusy(false);
      setError(error);
      return;
    }
    router.replace("/customers");
    router.refresh();
  }

  const kind = customer.cnic_or_ntn ? regNoKind(customer.cnic_or_ntn) : null;
  const validBills = bills.filter((b) => b.status !== "Cancelled");
  const billed = validBills.reduce((sum, b) => sum + b.total_value, 0);
  const paid = validBills.reduce((sum, b) => sum + b.paid_total, 0);
  const owed = validBills.reduce((sum, b) => sum + b.due_total, 0);

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
          {canBill && (
<Link href={`/sales/new?customer=${customer.id}`} className="on-dark btn btn-primary">
            <Icon name="receipt" className="h-5 w-5" /> New bill
          </Link>
)}
          {customer.phone && (
            <>
              <a href={`tel:${customer.phone}`} className="on-dark btn border border-white/20 bg-white/10 text-white hover:bg-white/20">
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
          {canEditCust && (
<button
            type="button"
            onClick={() => setEditing(true)}
            className="on-dark btn border border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            <Icon name="edit" className="h-5 w-5" /> Edit
          </button>
)}
          {canDeleteCust && (
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
)}
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

      {/* Bills */}
      <section className="card anim-rise mt-4 overflow-hidden" style={delay(3)}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
          <h2 className="font-display text-2xl font-semibold">Bills</h2>
          {billsReady && bills.length > 0 && canBill && (
            <Link href={`/sales/new?customer=${customer.id}`} className="btn btn-quiet btn-sm">
              <Icon name="plus" className="h-4 w-4" /> New bill
            </Link>
          )}
        </div>

        {!billsReady ? (
          <p className="px-5 pb-6 text-lead">
            Bills could not be loaded. In Supabase, open SQL Editor and run{" "}
            <code className="rounded bg-plate px-1.5 py-0.5 text-casing">03_invoices.sql</code>.
          </p>
        ) : bills.length === 0 ? (
          <div className="px-6 pb-10 pt-4 text-center">
            <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-sun/25 text-amber-800">
              <Icon name="tag" className="h-7 w-7" />
            </span>
            <h3 className="mt-3 font-display text-2xl font-semibold">No bills yet</h3>
            <p className="mx-auto mt-1 max-w-md text-lead">
              Bills made for {customer.name} will appear here, with what they paid and what is still due.
            </p>
            {canBill && (
<Link href={`/sales/new?customer=${customer.id}`} className="btn btn-primary mt-4">
              Make first bill
            </Link>
)}
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-2 px-5 pb-3 pt-1">
              <div className="rounded-xl bg-plate/70 p-3">
                <dt className="text-xs text-lead sm:text-sm">Billed</dt>
                <dd className="font-display text-xl font-semibold tabular-nums sm:text-2xl">{formatRs(billed)}</dd>
              </div>
              <div className="rounded-xl bg-plate/70 p-3">
                <dt className="text-xs text-lead sm:text-sm">Paid</dt>
                <dd className="font-display text-xl font-semibold tabular-nums text-cell-deep sm:text-2xl">{formatRs(paid)}</dd>
              </div>
              <div className={`rounded-xl p-3 ${owed > 0 ? "bg-terminal/10" : "bg-plate/70"}`}>
                <dt className="text-xs text-lead sm:text-sm">Balance due</dt>
                <dd className={`font-display text-xl font-semibold tabular-nums sm:text-2xl ${owed > 0 ? "text-terminal-deep" : ""}`}>
                  {formatRs(owed)}
                </dd>
              </div>
            </dl>
            <ul className="divide-y divide-line/60 px-2 pb-3">
              {bills.map((b) => (
                <li key={b.id}>
                  <Link href={`/sales/${b.id}`} className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-plate/70">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{b.invoice_number}</span>
                      <span className="block text-sm text-lead">{formatDay(b.invoice_date)}</span>
                    </span>
                    <PayBadge status={b.payment_status} bill={b.status} />
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{formatRs(b.total_value)}</span>
                      {b.status !== "Cancelled" && b.due_total > 0 && (
                        <span className="block text-sm font-semibold tabular-nums text-terminal-deep">{formatRs(b.due_total)} due</span>
                      )}
                    </span>
                    <Icon name="chevron" className="h-4 w-4 text-lead/60 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {billsReady && bills.length > 0 && <CustomerLedger bills={bills} payments={payments} ready={paymentsReady} />}

      {editing && <CustomerForm customer={customer} others={others} onClose={closeForm} onSaved={(m) => {
        setEditing(false);
        setToast(m);
        router.refresh();
      }} />}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${customer.name}?`}
          body="This deletes the customer AND all their bills, payments and udhaar. Items on those bills go back into stock. It cannot be undone. A customer who has a bill reported to FBR cannot be deleted."
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
