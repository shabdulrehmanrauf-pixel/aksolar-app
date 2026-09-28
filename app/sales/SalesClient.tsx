"use client";

import { useEffect, useMemo, useState } from "react";
import { useRoleInfo } from "@/components/RoleProvider";
import { can } from "@/lib/roles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { formatRs } from "@/lib/format";
import { formatDay, friendlyInvoiceError, invoiceMatches } from "@/lib/invoices";
import { chargingStatusLabel } from "@/lib/chargingJobs";
import { claimStatusLabel } from "@/lib/batteryClaims";
import { getBrowserClient } from "@/lib/supabase/lazy";
import { offlineDb, type LocalInvoice } from "@/lib/offline/db";
import { useLiveQuery } from "@/lib/offline/useLiveQuery";
import { checkRealConnectivity, isBrowserOnline } from "@/lib/offline/net";
import { notifySyncListeners } from "@/lib/offline/sync";
import type { BatteryClaimStatus, ChargingJobStatus, Invoice } from "@/lib/types";
import Toast from "@/components/Toast";
import PayBadge from "./PayBadge";
import FbrBadge from "./FbrBadge";
import { showFbrBadge, type FbrInfo } from "@/lib/fbrStatus";

type Filter = "all" | "due" | "paid";

const TABS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "due", label: "Udhaar due" },
  { value: "paid", label: "Paid" },
];

/** A charging slip, shaped for the merged Sales list. Every slip is a sale -- the price is
 * quoted the moment it's created, whatever happens to the battery afterwards. */
export type ChargingSaleRow = {
  id: string;
  slip_number: string;
  customer_name: string;
  customer_phone: string | null;
  price: number;
  received_date: string;
  status: ChargingJobStatus;
};

/** A battery claim, shaped for the merged Sales list. Only claims with a real extra_charges
 * amount are passed in here -- a plain warranty exchange is never a "sale". */
export type ClaimSaleRow = {
  id: string;
  claim_number: string;
  customer_name: string;
  customer_phone: string | null;
  extra_charges: number;
  received_date: string;
  status: BatteryClaimStatus;
};

/** One merged row for a charging slip or a claim with charges, normalised so the same table
 * markup can render either one next to the invoice rows. */
type OtherSaleRow =
  | { kind: "charging"; id: string; number: string; date: string; customer: string; total: number; href: string; statusLabel: string }
  | { kind: "claim"; id: string; number: string; date: string; customer: string; total: number; href: string; statusLabel: string };

function chargingToRow(c: ChargingSaleRow): OtherSaleRow {
  return {
    kind: "charging",
    id: c.id,
    number: c.slip_number,
    date: c.received_date,
    customer: c.customer_name,
    total: c.price,
    href: `/print/charging/${c.id}`,
    statusLabel: chargingStatusLabel(c.status),
  };
}

function claimToRow(c: ClaimSaleRow): OtherSaleRow {
  return {
    kind: "claim",
    id: c.id,
    number: c.claim_number,
    date: c.received_date,
    customer: c.customer_name,
    total: c.extra_charges,
    href: `/print/claim/${c.id}`,
    statusLabel: claimStatusLabel(c.status),
  };
}

/** Same idea as invoiceMatches, for the non-invoice rows merged into the "All" view. */
function saleRowMatches(row: { number: string; customer: string; date: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.number, row.customer, row.date, formatDay(row.date)].join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export default function SalesClient({
  invoices: serverInvoices,
  chargingJobs = [],
  batteryClaims = [],
  fbrByInvoice = {},
  initialFilter,
}: {
  invoices: Invoice[];
  chargingJobs?: ChargingSaleRow[];
  batteryClaims?: ClaimSaleRow[];
  /** FBR status per bill id (D5a). A bill with no entry is not an FBR bill and shows no FBR badge. */
  fbrByInvoice?: Record<string, FbrInfo>;
  initialFilter: Filter;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  // Charging slips and battery-claim charges only show up under "All" -- "Udhaar due" and "Paid"
  // are bill-specific ideas that don't apply to them, so mixing them in there would be confusing.
  const includeOthers = filter === "all";
  const router = useRouter();
  const roleInfo = useRoleInfo();
  const canDeleteBills = can(roleInfo, "sales.delete");
  const canCreateBill = can(roleInfo, "sales.create");
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  // Ids currently playing the "just deleted" fade -- still rendered (greyed out and
  // unclickable) for DELETE_FADE_MS, then handed off to deletedIds so they vanish for good.
  const [fadingIds, setFadingIds] = useState<string[]>([]);
  const [target, setTarget] = useState<LocalInvoice | null>(null);
  const [restock, setRestock] = useState(true);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Mirror fresh server data into the offline cache -- but only when we're
  // actually online, since a page served from the service worker's offline
  // cache carries stale props that must not overwrite newer local edits.
  useEffect(() => {
    if (!isBrowserOnline() || serverInvoices.length === 0) return;
    const rows: LocalInvoice[] = serverInvoices.map((r) => ({ ...r, pending: false, local_id: r.id }));
    offlineDb.invoices.bulkPut(rows).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverInvoices]);

  // Newest first, same order the server query used -- but this also includes
  // bills created offline that haven't synced yet (they carry pending: true).
  const invoices = useLiveQuery(
    () =>
      offlineDb.invoices
        .toArray()
        .then((rows) =>
          rows.sort(
            (a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.created_at.localeCompare(a.created_at)
          )
        ),
    [],
    serverInvoices.map((r) => ({ ...r, pending: false, local_id: r.id }) as LocalInvoice)
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // How long a deleted row sits there greyed-out before it actually disappears.
  const DELETE_FADE_MS = 650;

  // Marks a row as "deleted" right away (it turns grey and stops responding to clicks),
  // then -- once the fade has had time to play -- runs `cleanup` (the actual offline-cache
  // removal) and drops the id into deletedIds so the row is gone from the list for good.
  function fadeOutThenRemove(id: string, cleanup: () => Promise<void> | void) {
    setFadingIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    window.setTimeout(() => {
      Promise.resolve(cleanup())
        .catch(() => {})
        .finally(() => {
          setDeletedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
          setFadingIds((ids) => ids.filter((x) => x !== id));
        });
    }, DELETE_FADE_MS);
  }

  function askDelete(inv: LocalInvoice) {
    setRestock(true);
    setDelError(null);
    setTarget(inv);
  }

  // ---------- Delete for a charging slip or a battery claim (the "otherRows" merged in above) ----------
  // These aren't bills -- no restock checkbox, no offline draft state -- so they get their
  // own, simpler confirm dialog rather than being squeezed into the invoice one.
  const [otherTarget, setOtherTarget] = useState<OtherSaleRow | null>(null);
  const [otherDelBusy, setOtherDelBusy] = useState(false);
  const [otherDelError, setOtherDelError] = useState<string | null>(null);
  const [removedOtherIds, setRemovedOtherIds] = useState<string[]>([]);

  function askDeleteOther(row: OtherSaleRow) {
    setOtherDelError(null);
    setOtherTarget(row);
  }

  async function confirmDeleteOther() {
    if (!otherTarget || otherDelBusy) return;
    setOtherDelBusy(true);
    setOtherDelError(null);

    const online = await checkRealConnectivity();
    if (!online) {
      setOtherDelError("Deleting needs a connection. Try again once you're back online.");
      setOtherDelBusy(false);
      return;
    }

    const row = otherTarget;
    try {
      const supabase = await getBrowserClient();
      const fn = row.kind === "charging" ? "delete_charging_job" : "delete_battery_claim";
      const { error: dbError } = await supabase.rpc(fn, { p_id: row.id });
      if (dbError) {
        const alreadyGone = /could not be found/i.test(dbError.message);
        if (alreadyGone) {
          setRemovedOtherIds((ids) => [...ids, row.id]);
          setToast(`${row.number} was already deleted.`);
          setOtherTarget(null);
          setOtherDelBusy(false);
          router.refresh();
          return;
        }
        setOtherDelError(
          dbError.code === "42883" || dbError.code === "PGRST202"
            ? "The delete setup is missing. Run 13_delete_charging_claims.sql in Supabase, then try again."
            : dbError.message
        );
        setOtherDelBusy(false);
        return;
      }
      setRemovedOtherIds((ids) => [...ids, row.id]);
      setToast(`${row.number} deleted.`);
      setOtherTarget(null);
      setOtherDelBusy(false);
      router.refresh();
    } catch {
      setOtherDelError("The connection dropped. Refresh this page to see if it was deleted before you try again.");
      setOtherDelBusy(false);
    }
  }

  async function confirmDelete() {
    if (!target || delBusy) return;
    setDelBusy(true);
    setDelError(null);

    // A bill made offline and not yet synced only exists on this device --
    // there's nothing to tell Supabase, so discarding it is a purely local
    // action: drop the cached rows and cancel whatever is still queued for it.
    if (target.pending) {
      const id = target.id;
      try {
        const items = await offlineDb.invoice_items.where("invoice_id").equals(id).toArray();
        await offlineDb.invoice_items.bulkDelete(items.map((i) => i.id));
        const queued = await offlineDb.pending_sync.toArray();
        const toDrop = queued.filter((a) => a.group_id === target.local_id).map((a) => a.id!);
        if (toDrop.length > 0) await offlineDb.pending_sync.bulkDelete(toDrop);
        // Put the stock this draft had reserved back, since it never really left.
        for (const item of items) {
          const cached = await offlineDb.inventory.get(item.inventory_id);
          if (cached) await offlineDb.inventory.put({ ...cached, quantity: cached.quantity + item.quantity });
        }
        notifySyncListeners();
        setToast("Draft bill discarded.");
        setTarget(null);
        setDelBusy(false);
        // Leave the row itself in offlineDb until the fade plays, so it greys out first.
        fadeOutThenRemove(id, () => offlineDb.invoices.delete(id));
      } catch {
        setDelError("Could not discard this draft. Please try again.");
        setDelBusy(false);
      }
      return;
    }

    const online = await checkRealConnectivity();
    if (!online) {
      setDelError("Deleting a saved bill needs a connection, so its stock and payment records can be reversed correctly. Try again once you're back online.");
      setDelBusy(false);
      return;
    }

    try {
      const supabase = await getBrowserClient();
      const { error: dbError } = await supabase.rpc("delete_invoice", { p_invoice_id: target.id, p_restock: restock });
      if (dbError) {
        // A stale offline copy can bring an already-deleted bill back into the list
        // (e.g. a page reload served from the offline cache). Clicking delete on it then
        // gets rejected because it's genuinely gone server-side already. Rather than
        // scaring the user with an error for a bill that's gone either way, treat this
        // as success: fade the row out and clean up the local copy so it stops coming back.
        const alreadyGone = /could not be found/i.test(dbError.message);
        if (alreadyGone) {
          const id = target.id;
          setToast(`${target.invoice_number} was already deleted.`);
          setTarget(null);
          setDelBusy(false);
          fadeOutThenRemove(id, () => offlineDb.invoices.delete(id));
          router.refresh();
          return;
        }
        setDelError(
          dbError.code === "42883" || dbError.code === "PGRST202"
            ? "The delete setup is missing. Run 06_delete_invoice.sql in Supabase, then try again."
            : friendlyInvoiceError(dbError)
        );
        setDelBusy(false);
        return;
      }
      const id = target.id;
      setToast(`${target.invoice_number} deleted.`);
      setTarget(null);
      setDelBusy(false);
      // Keep the row in offlineDb until the fade plays, so it visibly greys out first
      // instead of just vanishing from the list.
      fadeOutThenRemove(id, () => offlineDb.invoices.delete(id));
      router.refresh();
    } catch {
      setDelError("The connection dropped. Refresh this page to see if the bill was deleted before you try again.");
      setDelBusy(false);
    }
  }

  const visible = useMemo(() => invoices.filter((i) => !deletedIds.includes(i.id)), [invoices, deletedIds]);

  const shown = useMemo(
    () =>
      visible.filter((inv) => {
        if (!invoiceMatches(inv, query)) return false;
        if (filter === "due") return inv.status !== "Cancelled" && inv.due_total > 0;
        if (filter === "paid") return inv.status !== "Cancelled" && inv.due_total <= 0;
        return true;
      }),
    [visible, query, filter]
  );

  const totalShown = shown.filter((i) => i.status !== "Cancelled").reduce((s, i) => s + i.total_value, 0);
  const dueShown = shown.filter((i) => i.status !== "Cancelled").reduce((s, i) => s + i.due_total, 0);

  // Charging slips + battery-claim charges, merged in only for the "All" tab.
  const otherRows = useMemo(() => {
    if (!includeOthers) return [];
    const rows = [
      ...chargingJobs.filter((c) => saleRowMatches({ number: c.slip_number, customer: c.customer_name, date: c.received_date }, query)).map(chargingToRow),
      ...batteryClaims.filter((c) => saleRowMatches({ number: c.claim_number, customer: c.customer_name, date: c.received_date }, query)).map(claimToRow),
    ];
    return rows.filter((r) => !removedOtherIds.includes(r.id)).sort((a, b) => b.date.localeCompare(a.date));
  }, [includeOthers, chargingJobs, batteryClaims, query, removedOtherIds]);

  const otherTotal = otherRows.reduce((s, r) => s + r.total, 0);
  const mergedCount = shown.length + otherRows.length;
  const mergedTotal = totalShown + otherTotal;

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={
          visible.length === 0 && chargingJobs.length === 0 && batteryClaims.length === 0
            ? "Your bills will appear here."
            : `${visible.length + chargingJobs.length + batteryClaims.length} sale entries saved`
        }
        action={
          canCreateBill && (
<Link href="/sales/new" className="btn btn-primary">
            <Icon name="plus" className="h-5 w-5" /> New bill
          </Link>
)
        }
      />

      {visible.length === 0 && chargingJobs.length === 0 && batteryClaims.length === 0 ? (
        <section className="card anim-rise mt-6 px-6 py-12 text-center">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-sun/25 text-amber-800">
            <Icon name="receipt" className="h-7 w-7" />
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold">No bills yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-lead">
            Make your first bill. Stock goes down and udhaar is tracked for you.
          </p>
          {canCreateBill && (
<Link href="/sales/new" className="btn btn-primary mt-5">
            Make first bill
          </Link>
)}
        </section>
      ) : (
        <>
          <div className="anim-rise mt-5 flex flex-col gap-3 sm:flex-row sm:items-center" style={{ "--i": 1 } as React.CSSProperties}>
            <label className="relative block w-full sm:max-w-md">
              <span className="sr-only">Search sale entries</span>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customer, bill/slip number or date"
                className="input pl-11"
                autoComplete="off"
              />
            </label>
            <div role="group" aria-label="Filter sale entries" className="flex gap-2">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={filter === t.value}
                  onClick={() => setFilter(t.value)}
                  className={`min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors ${
                    filter === t.value ? "bg-casing text-white" : "border border-line bg-white text-casing hover:bg-plate"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-3 text-sm text-lead" aria-live="polite">
            {mergedCount} {mergedCount === 1 ? "entry" : "entries"} · {formatRs(mergedTotal)}
            {dueShown > 0 && <span className="font-semibold text-terminal-deep"> · {formatRs(dueShown)} still due</span>}
            {includeOthers && otherRows.length > 0 && (
              <span className="text-lead"> · includes {otherRows.length} charging/claim {otherRows.length === 1 ? "entry" : "entries"}</span>
            )}
          </p>

          {mergedCount === 0 ? (
            <div className="card mt-4 px-6 py-10 text-center">
              <p className="font-display text-2xl font-semibold">No sale entries match</p>
              <p className="mt-1 text-lead">Check the spelling, or clear the search.</p>
              <button
                type="button"
                className="btn btn-quiet mt-4"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="card mt-4 hidden overflow-hidden md:block">
                <table className="w-full text-left">
                  <thead className="bg-plate/70 text-sm text-lead">
                    <tr>
                      <th className="px-5 py-3 font-medium">Bill</th>
                      <th className="px-3 py-3 font-medium">Type</th>
                      <th className="px-3 py-3 font-medium">Date</th>
                      <th className="px-3 py-3 font-medium">Customer</th>
                      <th className="px-3 py-3 text-right font-medium">Total</th>
                      <th className="px-3 py-3 text-right font-medium">Due</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 text-right font-medium">
                        <span className="sr-only">Delete</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {shown.map((inv) => {
                      const fading = fadingIds.includes(inv.id);
                      return (
                        <tr
                          key={inv.id}
                          aria-hidden={fading || undefined}
                          className={`transition-all duration-500 ease-out ${
                            fading ? "pointer-events-none grayscale opacity-35" : "hover:bg-plate/50"
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            {inv.pending ? (
                              <span className="inline-flex items-center gap-1.5 font-semibold text-lead">
                                Pending sync
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              </span>
                            ) : fading ? (
                              <span className="font-semibold text-lead line-through">{inv.invoice_number}</span>
                            ) : (
                              <Link href={`/sales/${inv.id}`} className="font-semibold text-focus hover:underline">
                                {inv.invoice_number}
                              </Link>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-lead">Invoice</td>
                          <td className="px-3 py-3.5 tabular-nums text-lead">{formatDay(inv.invoice_date)}</td>
                          <td className="max-w-[16rem] truncate px-3 py-3.5 font-medium">{inv.buyer_name}</td>
                          <td className="px-3 py-3.5 text-right font-semibold tabular-nums">{formatRs(inv.total_value)}</td>
                          <td
                            className={`px-3 py-3.5 text-right tabular-nums ${
                              inv.status !== "Cancelled" && inv.due_total > 0 ? "font-semibold text-terminal-deep" : "text-lead"
                            }`}
                          >
                            {inv.status !== "Cancelled" && inv.due_total > 0 ? formatRs(inv.due_total) : "-"}
                          </td>
                          <td className="px-5 py-3.5">
                            {fading ? (
                              <span className="inline-flex rounded-full bg-plate px-2.5 py-1 text-xs font-semibold text-lead">
                                Deleted
                              </span>
                            ) : (
                              <span className="flex flex-wrap items-center gap-1.5">
                                <PayBadge status={inv.payment_status} bill={inv.status} />
                                {showFbrBadge(fbrByInvoice[inv.id], inv.status === "Cancelled") && (
                                  <FbrBadge info={fbrByInvoice[inv.id]} />
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            {(canDeleteBills || inv.pending) && (
<button
                              type="button"
                              onClick={() => askDelete(inv)}
                              disabled={fading}
                              aria-label={inv.pending ? `Discard draft bill for ${inv.buyer_name}` : `Delete bill ${inv.invoice_number}`}
                              title={inv.pending ? "Discard draft" : "Delete bill"}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-terminal/10 hover:text-terminal-deep disabled:cursor-default"
                            >
                              <Icon name="trash" className="h-5 w-5" />
                            </button>
)}
                          </td>
                        </tr>
                      );
                    })}
                    {otherRows.map((row) => (
                      <tr key={`${row.kind}-${row.id}`} className="transition-colors hover:bg-plate/50">
                        <td className="px-5 py-3.5">
                          <Link href={row.href} target="_blank" className="font-semibold text-focus hover:underline">
                            {row.number}
                          </Link>
                        </td>
                        <td className="px-3 py-3.5 text-lead">{row.kind === "charging" ? "Charging" : "Claim charge"}</td>
                        <td className="px-3 py-3.5 tabular-nums text-lead">{formatDay(row.date)}</td>
                        <td className="max-w-[16rem] truncate px-3 py-3.5 font-medium">{row.customer}</td>
                        <td className="px-3 py-3.5 text-right font-semibold tabular-nums">{formatRs(row.total)}</td>
                        <td className="px-3 py-3.5 text-right text-lead">-</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex rounded-full bg-plate px-2.5 py-1 text-xs font-semibold text-lead">
                            {row.statusLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Link
                              href={row.href}
                              target="_blank"
                              aria-label={`Open ${row.kind === "charging" ? "charging slip" : "claim slip"} ${row.number}`}
                              title="Open slip"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-plate"
                            >
                              <Icon name="chevron" className="h-4 w-4" />
                            </Link>
                            {canDeleteBills && (
<button
                              type="button"
                              onClick={() => askDeleteOther(row)}
                              aria-label={`Delete ${row.kind === "charging" ? "charging slip" : "claim"} ${row.number}`}
                              title="Delete"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-terminal/10 hover:text-terminal-deep"
                            >
                              <Icon name="trash" className="h-5 w-5" />
                            </button>
)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone cards */}
              <ul className="mt-4 space-y-2.5 md:hidden">
                {shown.map((inv) => {
                  const fading = fadingIds.includes(inv.id);
                  const body = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate font-semibold ${fading ? "line-through" : ""}`}>{inv.buyer_name}</span>
                        </span>
                        <span className="mt-0.5 block text-sm text-lead">
                          {inv.pending ? (
                            <span className="inline-flex items-center gap-1.5">
                              Pending sync <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            </span>
                          ) : (
                            <>
                              {inv.invoice_number} · {formatDay(inv.invoice_date)}
                            </>
                          )}
                        </span>
                        <span className="mt-1.5 block">
                          {fading ? (
                            <span className="inline-flex rounded-full bg-plate px-2.5 py-1 text-xs font-semibold text-lead">
                              Deleted
                            </span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <PayBadge status={inv.payment_status} bill={inv.status} />
                              {showFbrBadge(fbrByInvoice[inv.id], inv.status === "Cancelled") && (
                                <FbrBadge info={fbrByInvoice[inv.id]} />
                              )}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display text-2xl font-semibold leading-none tabular-nums">
                          {formatRs(inv.total_value)}
                        </span>
                        {inv.status !== "Cancelled" && inv.due_total > 0 && (
                          <span className="mt-1 block text-sm font-semibold tabular-nums text-terminal-deep">
                            {formatRs(inv.due_total)} due
                          </span>
                        )}
                      </span>
                      {!inv.pending && <Icon name="chevron" className="h-4 w-4 text-lead/60" />}
                    </>
                  );
                  return (
                    <li
                      key={inv.id}
                      aria-hidden={fading || undefined}
                      className={`flex items-stretch gap-2 transition-all duration-500 ease-out ${
                        fading ? "pointer-events-none grayscale opacity-35" : ""
                      }`}
                    >
                      {inv.pending ? (
                        <div className="card flex min-w-0 flex-1 items-center gap-3 p-4 opacity-80">{body}</div>
                      ) : (
                        <Link href={`/sales/${inv.id}`} className="card card-hover flex min-w-0 flex-1 items-center gap-3 p-4">
                          {body}
                        </Link>
                      )}
                      {(canDeleteBills || inv.pending) && (
<button
                        type="button"
                        onClick={() => askDelete(inv)}
                        disabled={fading}
                        aria-label={inv.pending ? `Discard draft bill for ${inv.buyer_name}` : `Delete bill ${inv.invoice_number}`}
                        className="card inline-flex w-12 shrink-0 items-center justify-center text-lead hover:bg-terminal/10 hover:text-terminal-deep disabled:cursor-default"
                      >
                        <Icon name="trash" className="h-5 w-5" />
                      </button>
)}
                    </li>
                  );
                })}
                {otherRows.map((row) => (
                  <li key={`${row.kind}-${row.id}`} className="flex items-stretch gap-2">
                    <Link href={row.href} target="_blank" className="card card-hover flex min-w-0 flex-1 items-center gap-3 p-4">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold">{row.customer}</span>
                        </span>
                        <span className="mt-0.5 block text-sm text-lead">
                          {row.kind === "charging" ? "Charging" : "Claim charge"} · {row.number} · {formatDay(row.date)}
                        </span>
                        <span className="mt-1.5 block">
                          <span className="inline-flex rounded-full bg-plate px-2.5 py-1 text-xs font-semibold text-lead">
                            {row.statusLabel}
                          </span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display text-2xl font-semibold leading-none tabular-nums">
                          {formatRs(row.total)}
                        </span>
                      </span>
                      <Icon name="chevron" className="h-4 w-4 text-lead/60" />
                    </Link>
                    {canDeleteBills && (
<button
                      type="button"
                      onClick={() => askDeleteOther(row)}
                      aria-label={`Delete ${row.kind === "charging" ? "charging slip" : "claim"} ${row.number}`}
                      className="card inline-flex w-12 shrink-0 items-center justify-center text-lead hover:bg-terminal/10 hover:text-terminal-deep"
                    >
                      <Icon name="trash" className="h-5 w-5" />
                    </button>
)}
                  </li>
                ))}
              </ul>
              {visible.length >= 1000 && (
                <p className="mt-3 text-sm text-lead">Showing the latest 1,000 bills.</p>
              )}
            </>
          )}
        </>
      )}

      {target && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-title"
            aria-describedby="del-text"
            className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <h2 id="del-title" className="font-display text-2xl font-bold">
              {target.pending ? "Discard this draft bill?" : `Delete ${target.invoice_number}?`}
            </h2>
            <p id="del-text" className="mt-2 text-lead">
              {target.pending
                ? `This bill for ${target.buyer_name} (${formatRs(target.total_value)}) hasn't synced yet -- discarding it removes it from this device and puts its items back in stock. It cannot be undone.`
                : `This permanently deletes the bill for ${target.buyer_name} (${formatRs(target.total_value)}) with all its items and payments. It cannot be undone.`}
            </p>
            {!target.pending && (
              <label className="mt-4 flex items-start gap-3 rounded-xl bg-plate/70 px-3 py-3 text-[15px]">
                <input
                  type="checkbox"
                  checked={restock}
                  onChange={(e) => setRestock(e.target.checked)}
                  disabled={delBusy}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  <span className="block font-semibold">Put the items back in stock</span>
                  <span className="block text-lead">Turn this off only if the goods really left the shop.</span>
                </span>
              </label>
            )}
            {delError && (
              <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
                {delError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setTarget(null)} disabled={delBusy} autoFocus className="btn btn-quiet">
                Keep it
              </button>
              <button type="button" onClick={confirmDelete} disabled={delBusy} className="btn btn-danger">
                {delBusy ? "Deleting" : target.pending ? "Discard draft" : "Delete bill"}
              </button>
            </div>
          </div>
        </div>
      )}

      {otherTarget && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-other-title"
            aria-describedby="del-other-text"
            className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <h2 id="del-other-title" className="font-display text-2xl font-bold">
              Delete {otherTarget.number}?
            </h2>
            <p id="del-other-text" className="mt-2 text-lead">
              This permanently deletes the {otherTarget.kind === "charging" ? "charging slip" : "battery claim"} for{" "}
              {otherTarget.customer} ({formatRs(otherTarget.total)}). It cannot be undone.
            </p>
            {otherDelError && (
              <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
                {otherDelError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setOtherTarget(null)} disabled={otherDelBusy} autoFocus className="btn btn-quiet">
                Keep it
              </button>
              <button type="button" onClick={confirmDeleteOther} disabled={otherDelBusy} className="btn btn-danger">
                {otherDelBusy ? "Deleting" : otherTarget.kind === "charging" ? "Delete slip" : "Delete claim"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
