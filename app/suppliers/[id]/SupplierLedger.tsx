"use client";

import { useEffect, useState } from "react";
import { useRoleInfo } from "@/components/RoleProvider";
import { can } from "@/lib/roles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon, { type IconName } from "@/components/Icons";
import Toast from "@/components/Toast";
import { formatDate, formatRs } from "@/lib/format";
import { formatDay } from "@/lib/invoices";
import { balanceLabel } from "@/lib/suppliers";
import type { LedgerRow, PurchaseInvoice, Supplier, SupplierBalance } from "@/lib/types";
import SupplierForm from "../SupplierForm";

const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

function InfoCard({ icon, label, value, muted, tone }: { icon: IconName; label: string; value: string; muted?: boolean; tone: string }) {
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

const ENTRY_ICON: Record<LedgerRow["entry_type"], IconName> = {
  opening: "calendar",
  purchase: "truck",
  payment: "banknote",
};

function LedgerLine({ row }: { row: LedgerRow }) {
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          row.amount >= 0 ? "bg-terminal/10 text-terminal-deep" : "bg-cell/10 text-cell-deep"
        }`}
      >
        <Icon name={ENTRY_ICON[row.entry_type]} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{row.entry_label}</span>
        <span className="block text-sm text-lead">
          {formatDay(row.event_date)}
          {row.reference ? ` · ${row.reference}` : ""}
        </span>
      </span>
      <span className="text-right">
        <span className={`block font-semibold tabular-nums ${row.amount >= 0 ? "text-terminal-deep" : "text-cell-deep"}`}>
          {row.amount >= 0 ? "+" : "-"}
          {formatRs(Math.abs(row.amount))}
        </span>
        <span className="block text-xs text-lead">Bal {formatRs(row.running_balance)}</span>
      </span>
    </li>
  );
}

export default function SupplierLedger({
  supplier,
  others,
  ledger,
  ledgerReady,
  purchases,
  purchasesReady,
}: {
  supplier: SupplierBalance;
  others: Pick<Supplier, "id" | "name">[];
  ledger: LedgerRow[]; // newest first
  ledgerReady: boolean;
  purchases: PurchaseInvoice[];
  purchasesReady: boolean;
}) {
  const router = useRouter();
  const roleInfo = useRoleInfo();
  const canManageSuppliers = can(roleInfo, "suppliers.manage");
  const canReceiveStock = can(roleInfo, "purchases.manage");
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"ledger" | "purchases">("ledger");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const { text: balanceText, tone } = balanceLabel(supplier.balance);
  const balanceCls = tone === "owe" ? "text-red-200" : tone === "advance" ? "text-emerald-200" : "text-white/70";

  return (
    <div>
      <Link href="/suppliers" className="anim-rise inline-flex items-center gap-1 text-[15px] font-medium text-lead hover:text-casing">
        <Icon name="back" className="h-4 w-4" /> Suppliers
      </Link>

      <section className="hero-card anim-slide relative mt-3 overflow-hidden rounded-3xl p-5 text-white shadow-lift sm:p-7">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-display text-4xl font-bold leading-none sm:text-5xl">{supplier.name}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-white/65">
              {!supplier.is_active && <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-medium text-white">Inactive</span>}
              <span>Supplier since {formatDate(supplier.created_at)}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/70">Balance</p>
            <p className={`font-display text-3xl font-bold sm:text-4xl ${balanceCls}`}>{balanceText}</p>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap gap-2.5">
          {canReceiveStock && (
<Link href={`/purchases/new?supplier=${supplier.id}`} className="on-dark btn btn-primary">
            <Icon name="truck" className="h-5 w-5" /> Receive stock
          </Link>
)}
          {supplier.balance > 0 && (
            <Link href={`/payments/new?supplier=${supplier.id}`} className="on-dark btn border border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Icon name="banknote" className="h-5 w-5" /> Make payment
            </Link>
          )}
          {supplier.phone && (
            <a href={`tel:${supplier.phone}`} className="on-dark btn border border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Icon name="phone" className="h-5 w-5" /> Call
            </a>
          )}
          {canManageSuppliers && (
<button
            type="button"
            onClick={() => setEditing(true)}
            className="on-dark btn border border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            <Icon name="edit" className="h-5 w-5" /> Edit
          </button>
)}
        </div>
      </section>

      <dl className="anim-rise mt-4 grid gap-3 sm:grid-cols-2" style={delay(2)}>
        <InfoCard icon="phone" label="Phone" value={supplier.phone ?? "Not saved"} muted={!supplier.phone} tone="bg-cell/10 text-cell" />
        <InfoCard icon="idcard" label="NTN / CNIC" value={supplier.ntn_or_cnic ?? "Not saved"} muted={!supplier.ntn_or_cnic} tone="bg-focus/10 text-focus" />
        <InfoCard icon="pin" label="Address" value={supplier.address || "Not saved"} muted={!supplier.address} tone="bg-sun/25 text-amber-800" />
        <InfoCard icon="calendar" label="Last activity" value={supplier.last_purchase_date ? formatDay(supplier.last_purchase_date) : "No purchases yet"} tone="bg-violet-500/10 text-violet-700" />
      </dl>

      <dl className="anim-rise mt-4 grid grid-cols-3 gap-2 sm:gap-3" style={delay(3)}>
        <div className="card p-3.5">
          <dt className="text-xs text-lead sm:text-sm">Total bought</dt>
          <dd className="font-display text-xl font-semibold tabular-nums sm:text-2xl">{formatRs(supplier.total_bought)}</dd>
        </div>
        <div className="card p-3.5">
          <dt className="text-xs text-lead sm:text-sm">Total paid</dt>
          <dd className="font-display text-xl font-semibold tabular-nums text-cell-deep sm:text-2xl">{formatRs(supplier.total_paid)}</dd>
        </div>
        <div className={`card p-3.5 ${supplier.balance > 0 ? "border-terminal/30 bg-terminal/5" : ""}`}>
          <dt className="text-xs text-lead sm:text-sm">Balance</dt>
          <dd className={`font-display text-xl font-semibold tabular-nums sm:text-2xl ${supplier.balance > 0 ? "text-terminal-deep" : ""}`}>
            {formatRs(Math.abs(supplier.balance))}
          </dd>
        </div>
      </dl>

      <section className="card anim-rise mt-4 overflow-hidden" style={delay(4)}>
        <div className="flex items-center gap-2 border-b border-line px-3 pt-3">
          {(
            [
              { value: "ledger", label: "Ledger" },
              { value: "purchases", label: "Purchase bills" },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`rounded-t-xl px-4 py-2.5 text-[15px] font-semibold transition-colors ${
                tab === t.value ? "border-b-2 border-casing text-casing" : "text-lead hover:text-casing"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "ledger" ? (
          !ledgerReady ? (
            <p className="px-5 py-6 text-lead">
              The ledger could not be loaded. In Supabase, open SQL Editor and run{" "}
              <code className="rounded bg-plate px-1.5 py-0.5 text-casing">12_suppliers_purchases.sql</code>.
            </p>
          ) : ledger.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="font-display text-xl font-semibold">Nothing recorded yet</p>
              <p className="mt-1 text-lead">An opening balance, purchase bills and payments will all show up here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line/60 px-2 py-2">
              {ledger.map((row) => (
                <LedgerLine key={`${row.entry_type}-${row.ref_id ?? row.event_created_at}`} row={row} />
              ))}
            </ul>
          )
        ) : !purchasesReady ? (
          <p className="px-5 py-6 text-lead">Purchase bills could not be loaded.</p>
        ) : purchases.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-focus/10 text-focus">
              <Icon name="truck" className="h-7 w-7" />
            </span>
            <h3 className="mt-3 font-display text-2xl font-semibold">No purchase bills yet</h3>
            <p className="mx-auto mt-1 max-w-md text-lead">Stock received from {supplier.name} will appear here.</p>
            {canReceiveStock && (
<Link href={`/purchases/new?supplier=${supplier.id}`} className="btn btn-primary mt-4">
              Receive first stock
            </Link>
)}
          </div>
        ) : (
          <ul className="divide-y divide-line/60 px-2 py-2">
            {purchases.map((p) => (
              <li key={p.id}>
                <Link href={`/purchases/${p.id}`} className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-plate/70">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.purchase_number}</span>
                    <span className="block text-sm text-lead">
                      {formatDay(p.invoice_date)}
                      {p.status === "Cancelled" ? " · Cancelled" : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{formatRs(p.total_value)}</span>
                    {p.status !== "Cancelled" && p.due_total > 0 && (
                      <span className="block text-sm font-semibold tabular-nums text-terminal-deep">{formatRs(p.due_total)} due</span>
                    )}
                  </span>
                  <Icon name="chevron" className="h-4 w-4 text-lead/60 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <SupplierForm
          supplier={supplier}
          others={others}
          onClose={() => setEditing(false)}
          onSaved={(m) => {
            setEditing(false);
            setToast(m);
            router.refresh();
          }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
