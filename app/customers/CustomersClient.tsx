"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRoleInfo } from "@/components/RoleProvider";
import { can } from "@/lib/roles";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Toast from "@/components/Toast";
import { offlineDb } from "@/lib/offline/db";
import { useLiveQuery } from "@/lib/offline/useLiveQuery";
import { isBrowserOnline } from "@/lib/offline/net";
import { deleteCustomerWithBills } from "@/lib/customerDelete";
import { customerMatches, formatPhone, formatRegNo, whatsappLink } from "@/lib/customers";
import type { Customer, RegistrationType } from "@/lib/types";
import CustomerForm from "./CustomerForm";
import RegistrationBadge from "./RegistrationBadge";

type TypeFilter = "all" | RegistrationType;

const delay = (i: number) => ({ "--i": Math.min(i, 8) }) as React.CSSProperties;

function ContactButtons({ phone, name }: { phone: string | null; name: string }) {
  if (!phone) return null;
  const base =
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white transition-colors";
  return (
    <>
      <a href={`tel:${phone}`} aria-label={`Call ${name}`} title="Call" className={`${base} text-casing hover:bg-plate`}>
        <Icon name="phone" className="h-[18px] w-[18px]" />
      </a>
      <a
        href={whatsappLink(phone)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`WhatsApp ${name}`}
        title="WhatsApp"
        className={`${base} text-cell hover:bg-cell/10`}
      >
        <Icon name="chat" className="h-[18px] w-[18px]" />
      </a>
    </>
  );
}

export default function CustomersClient({ customers: serverCustomers }: { customers: Customer[] }) {
  const router = useRouter();
  const wantsAdd = useSearchParams().get("add") === "1";
  const roleInfo = useRoleInfo();
  const canEditCust = can(roleInfo, "customers.edit");
  const canDeleteCust = can(roleInfo, "customers.delete");

  // Same rule as InventoryClient: only mirror server props into the offline
  // cache when they are actually fresh (i.e. we're online right now).
  useEffect(() => {
    if (!isBrowserOnline() || serverCustomers.length === 0) return;
    offlineDb.customers.bulkPut(serverCustomers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverCustomers]);

  const customers = useLiveQuery(
    () => offlineDb.customers.toArray().then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name))),
    [],
    serverCustomers
  );

  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  // Links to /customers?add=1 (top bar, Home, search box) open the Add panel, then tidy the address bar.
  useEffect(() => {
    if (!wantsAdd || !canEditCust) return;
    setEditing(null);
    setFormOpen(true);
    window.history.replaceState(null, "", "/customers");
  }, [wantsAdd, canEditCust]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  const counts = useMemo(() => {
    const c = { all: customers.length, Registered: 0, Unregistered: 0 };
    for (const x of customers) c[x.registration_type] += 1;
    return c;
  }, [customers]);

  const visible = useMemo(
    () =>
      customers.filter(
        (c) => (type === "all" || c.registration_type === type) && customerMatches(c, query)
      ),
    [customers, query, type]
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setFormOpen(true);
  }

  function openDelete(c: Customer) {
    setDelError(null);
    setDeleting(c);
  }

  async function confirmDelete() {
    if (!deleting || delBusy) return;
    if (!isBrowserOnline()) {
      setDelError("Deleting needs an internet connection. Connect and try again.");
      return;
    }
    setDelBusy(true);
    setDelError(null);
    const { error } = await deleteCustomerWithBills(deleting.id);
    setDelBusy(false);
    if (error) {
      setDelError(error);
      return;
    }
    await offlineDb.customers.delete(deleting.id).catch(() => {});
    setToast(`${deleting.name} deleted.`);
    setDeleting(null);
    router.refresh();
  }

  function onSaved(message: string) {
    // The live IndexedDB query already reflects the save; no network round trip needed.
    closeForm();
    setToast(message);
  }

  const tabs: { value: TypeFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "Registered", label: "Registered", count: counts.Registered },
    { value: "Unregistered", label: "Unregistered", count: counts.Unregistered },
  ];
  const filtersActive = query.trim() !== "" || type !== "all";

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={
          customers.length === 0
            ? "No customers yet."
            : `${customers.length} ${customers.length === 1 ? "customer" : "customers"} saved.`
        }
        action={
          canEditCust && (
<button type="button" onClick={openAdd} className="btn btn-primary">
            <Icon name="userplus" className="h-5 w-5" /> Add customer
          </button>
)
        }
      />

      {customers.length > 0 && (
        <div className="anim-rise mt-6 space-y-3" style={delay(1)}>
          <div className="relative sm:max-w-md">
            <label htmlFor="customer-search" className="sr-only">
              Search customers
            </label>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
            <input
              id="customer-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone or CNIC"
              className="input pl-11"
            />
          </div>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {tabs.map((tab) => {
              const active = type === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setType(tab.value)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
                    active
                      ? "border-casing bg-casing text-white shadow-sm"
                      : "border-line bg-white text-lead hover:border-lead/40 hover:text-casing"
                  }`}
                >
                  {tab.label} <span className={`tabular-nums ${active ? "text-white/70" : "text-lead/80"}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        {customers.length === 0 ? (
          <div className="card anim-rise border-dashed border-lead/40 px-6 py-14 text-center" style={delay(1)}>
            <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/10 text-blue-700">
              <Icon name="users" className="h-8 w-8" />
            </span>
            <p className="mt-4 font-display text-3xl font-semibold">No customers yet</p>
            <p className="mx-auto mt-2 max-w-sm text-lead">
              Save a customer once. Later you can find their name, number and full history in one search.
            </p>
            {canEditCust && (
<button type="button" onClick={openAdd} className="btn btn-primary mt-6">
              <Icon name="userplus" className="h-5 w-5" /> Add first customer
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
                  setType("all");
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
                    <th scope="col" className="px-5 py-3.5 font-medium">Customer</th>
                    <th scope="col" className="px-4 py-3.5 font-medium">Phone</th>
                    <th scope="col" className="px-4 py-3.5 font-medium">FBR</th>
                    <th scope="col" className="px-4 py-3.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {visible.map((c) => (
                    <tr
                      key={c.id}
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest("a,button")) router.push(`/customers/${c.id}`);
                      }}
                      className="cursor-pointer align-middle transition-colors hover:bg-plate/50"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3.5">
                          <Avatar name={c.name} />
                          <div className="min-w-0">
                            <Link href={`/customers/${c.id}`} className="font-semibold hover:underline">
                              {c.name}
                            </Link>
                            {c.address && <div className="max-w-xs truncate text-sm text-lead">{c.address}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        {c.phone ? formatPhone(c.phone) : <span className="text-lead">No phone</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <RegistrationBadge type={c.registration_type} />
                        {c.cnic_or_ntn && (
                          <div className="mt-1 text-sm tabular-nums text-lead">{formatRegNo(c.cnic_or_ntn)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <ContactButtons phone={c.phone} name={c.name} />
                          {canEditCust && (
<button
                            type="button"
                            onClick={() => openEdit(c)}
                            aria-label={`Edit ${c.name}`}
                            title="Edit"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-casing transition-colors hover:bg-plate"
                          >
                            <Icon name="edit" className="h-[18px] w-[18px]" />
                          </button>
)}
                          {canDeleteCust && (
                            <button
                              type="button"
                              onClick={() => openDelete(c)}
                              aria-label={`Delete ${c.name}`}
                              title="Delete"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-terminal-deep transition-colors hover:bg-terminal/10"
                            >
                              <Icon name="trash" className="h-[18px] w-[18px]" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone: cards */}
            <ul className="space-y-3 md:hidden">
              {visible.map((c, idx) => (
                <li key={c.id} className="card anim-rise overflow-hidden" style={delay(idx + 2)}>
                  <Link href={`/customers/${c.id}`} className="flex items-center gap-3.5 p-4 active:bg-plate/60">
                    <Avatar name={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-sm tabular-nums text-lead">
                          {c.phone ? formatPhone(c.phone) : "No phone saved"}
                        </span>
                        <RegistrationBadge type={c.registration_type} />
                      </span>
                    </span>
                    <Icon name="chevron" className="h-4 w-4 shrink-0 text-lead/60" />
                  </Link>
                  {(canEditCust || canDeleteCust) && (
                    <div className="flex gap-2 border-t border-line/70 px-4 py-2.5">
                      {canEditCust && (
                        <button type="button" onClick={() => openEdit(c)} className="btn btn-quiet btn-sm flex-1">
                          <Icon name="edit" className="h-4 w-4" /> Edit
                        </button>
                      )}
                      {canDeleteCust && (
                        <button
                          type="button"
                          onClick={() => openDelete(c)}
                          className="btn btn-quiet btn-sm flex-1 text-terminal-deep"
                        >
                          <Icon name="trash" className="h-4 w-4" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex gap-2 border-t border-line/70 bg-plate/40 px-4 py-2.5">
                      <a href={`tel:${c.phone}`} className="btn btn-quiet btn-sm flex-1">
                        <Icon name="phone" className="h-4 w-4" /> Call
                      </a>
                      <a
                        href={whatsappLink(c.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-quiet btn-sm flex-1 text-cell"
                      >
                        <Icon name="chat" className="h-4 w-4" /> WhatsApp
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {formOpen && (
        <CustomerForm
          customer={editing}
          others={customers.map(({ id, name, phone }) => ({ id, name, phone }))}
          onClose={closeForm}
          onSaved={onSaved}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          body="This deletes the customer AND all their bills, payments and udhaar. Items on those bills go back into stock. It cannot be undone. A customer who has a bill reported to FBR cannot be deleted."
          confirmLabel="Delete customer"
          cancelLabel="Keep customer"
          busy={delBusy}
          error={delError}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
