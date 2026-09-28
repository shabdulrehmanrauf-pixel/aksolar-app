"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRoleInfo } from "@/components/RoleProvider";
import { can } from "@/lib/roles";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Toast from "@/components/Toast";
import { formatRs } from "@/lib/format";
import { balanceLabel, supplierMatches, supplierTab } from "@/lib/suppliers";
import type { SupplierBalance } from "@/lib/types";
import SupplierForm from "./SupplierForm";

type Tab = "all" | "we_owe" | "advance" | "inactive";

const delay = (i: number) => ({ "--i": Math.min(i, 8) }) as React.CSSProperties;

function Balance({ balance }: { balance: number }) {
  const { text, tone } = balanceLabel(balance);
  const cls =
    tone === "owe" ? "text-terminal-deep" : tone === "advance" ? "text-cell-deep" : "text-lead";
  return <span className={`font-semibold tabular-nums ${cls}`}>{text}</span>;
}

export default function SuppliersClient({ suppliers: serverSuppliers }: { suppliers: SupplierBalance[] }) {
  const router = useRouter();
  const wantsAdd = useSearchParams().get("add") === "1";

  const [suppliers, setSuppliers] = useState(serverSuppliers);
  useEffect(() => setSuppliers(serverSuppliers), [serverSuppliers]);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const roleInfo = useRoleInfo();
  const canManageSuppliers = can(roleInfo, "suppliers.manage");
  const canReceiveStock = can(roleInfo, "purchases.manage");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierBalance | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!wantsAdd) return;
    setEditing(null);
    setFormOpen(true);
    window.history.replaceState(null, "", "/suppliers");
  }, [wantsAdd]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  const active = useMemo(() => suppliers.filter((s) => s.is_active), [suppliers]);

  const counts = useMemo(() => {
    const c = { all: active.length, we_owe: 0, advance: 0, inactive: suppliers.length - active.length };
    for (const s of active) c[supplierTab(s)] += 1;
    return c;
  }, [active, suppliers]);

  const visible = useMemo(
    () =>
      suppliers.filter((s) => {
        if (tab === "inactive") return !s.is_active;
        if (!s.is_active) return false;
        if (tab !== "all" && supplierTab(s) !== tab) return false;
        return supplierMatches(s, query);
      }),
    [suppliers, query, tab]
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(s: SupplierBalance) {
    setEditing(s);
    setFormOpen(true);
  }
  function onSaved(message: string) {
    closeForm();
    setToast(message);
    router.refresh();
  }

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "we_owe", label: "We owe", count: counts.we_owe },
    { value: "advance", label: "Advance", count: counts.advance },
    { value: "inactive", label: "Inactive", count: counts.inactive },
  ];
  const filtersActive = query.trim() !== "" || tab !== "all";
  const totalOwed = active.filter((s) => s.balance > 0).reduce((sum, s) => sum + s.balance, 0);

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle={
          suppliers.length === 0
            ? "No suppliers yet."
            : `${active.length} active · ${formatRs(totalOwed)} owed in total`
        }
        action={
          <div className="flex gap-2.5">
            {canReceiveStock && (
<Link href="/purchases/new" className="btn btn-quiet">
              <Icon name="truck" className="h-5 w-5" /> Receive stock
            </Link>
)}
            {canManageSuppliers && (
<button type="button" onClick={openAdd} className="btn btn-primary">
              <Icon name="plus" className="h-5 w-5" /> Add supplier
            </button>
)}
          </div>
        }
      />

      {suppliers.length > 0 && (
        <div className="anim-rise mt-6 space-y-3" style={delay(1)}>
          <div className="relative sm:max-w-md">
            <label htmlFor="supplier-search" className="sr-only">
              Search suppliers
            </label>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
            <input
              id="supplier-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone or NTN/CNIC"
              className="input pl-11"
            />
          </div>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {tabs.map((t) => {
              const on = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  aria-pressed={on}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                    on
                      ? "border-casing bg-casing text-white shadow-sm"
                      : "border-line bg-white text-lead hover:border-lead/40 hover:text-casing"
                  }`}
                >
                  {t.label} <span className={`tabular-nums ${on ? "text-white/70" : "text-lead/80"}`}>{t.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        {suppliers.length === 0 ? (
          <div className="card anim-rise border-dashed border-lead/40 px-6 py-14 text-center" style={delay(1)}>
            <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-focus/10 text-focus">
              <Icon name="truck" className="h-8 w-8" />
            </span>
            <p className="mt-4 font-display text-3xl font-semibold">No suppliers yet</p>
            <p className="mx-auto mt-2 max-w-sm text-lead">
              Add a supplier, or just start a purchase bill -- a new supplier can be added right there too.
            </p>
            {canManageSuppliers && (
<button type="button" onClick={openAdd} className="btn btn-primary mt-6">
              <Icon name="plus" className="h-5 w-5" /> Add first supplier
            </button>
)}
          </div>
        ) : visible.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="font-display text-2xl font-semibold">Nothing matches</p>
            <p className="mt-2 text-lead">Try a different name or number, or clear the filters.</p>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setTab("all");
                }}
                className="btn btn-quiet mt-5"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Tablet and desktop: table */}
            <div className="card anim-rise hidden overflow-hidden md:block" style={delay(2)}>
              <table className="w-full text-left text-[15px]">
                <thead className="border-b border-line bg-plate/60 text-xs uppercase tracking-[0.1em] text-lead">
                  <tr>
                    <th scope="col" className="px-5 py-3.5 font-medium">Supplier</th>
                    <th scope="col" className="px-4 py-3.5 text-right font-medium">Bought</th>
                    <th scope="col" className="px-4 py-3.5 text-right font-medium">Paid</th>
                    <th scope="col" className="px-4 py-3.5 text-right font-medium">Balance</th>
                    <th scope="col" className="px-4 py-3.5"><span className="sr-only">Edit</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {visible.map((s) => (
                    <tr key={s.id} className={`align-middle transition-colors hover:bg-plate/50 ${!s.is_active ? "opacity-60" : ""}`}>
                      <td className="px-5 py-3.5">
                        <Link href={`/suppliers/${s.id}`} className="font-semibold hover:underline">
                          {s.name}
                        </Link>
                        {!s.is_active && <span className="ml-2 text-xs font-medium text-lead">Inactive</span>}
                        {s.phone && <div className="text-sm tabular-nums text-lead">{s.phone}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-lead">{formatRs(s.total_bought)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-lead">{formatRs(s.total_paid)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <Balance balance={s.balance} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {canManageSuppliers && (
<button
                          type="button"
                          onClick={() => openEdit(s)}
                          aria-label={`Edit ${s.name}`}
                          title="Edit"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-casing transition-colors hover:bg-plate"
                        >
                          <Icon name="edit" className="h-[18px] w-[18px]" />
                        </button>
)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone: cards */}
            <ul className="space-y-3 md:hidden">
              {visible.map((s, idx) => (
                <li key={s.id} className={`card anim-rise flex items-center gap-3 p-4 ${!s.is_active ? "opacity-60" : ""}`} style={delay(idx + 2)}>
                  <Link href={`/suppliers/${s.id}`} className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {s.name}
                      {!s.is_active && <span className="ml-2 text-xs font-medium text-lead">Inactive</span>}
                    </span>
                    <span className="mt-0.5 block text-sm text-lead">
                      {s.phone ?? "No phone saved"}
                    </span>
                    <span className="mt-1 block">
                      <Balance balance={s.balance} />
                    </span>
                  </Link>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-lead/60" />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {formOpen && <SupplierForm supplier={editing} others={suppliers} onClose={closeForm} onSaved={onSaved} />}

      <Toast message={toast} />
    </div>
  );
}
