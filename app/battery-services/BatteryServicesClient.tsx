"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import Toast from "@/components/Toast";
import { getBrowserClient } from "@/lib/supabase/lazy";
import { formatPhone } from "@/lib/customers";
import { formatRs } from "@/lib/format";
import { formatDay, todayKarachi } from "@/lib/invoices";
import type {
  BatteryClaim,
  BatteryClaimStatus,
  ChargingJob,
  ChargingJobStatus,
  ChargingPriceListItem,
  Customer,
  Distributor,
} from "@/lib/types";
import { chargingStatusLabel, isChargingOverdue } from "@/lib/chargingJobs";
import { BATTERY_CLAIM_STATUSES, claimHoldsBattery, claimStatusLabel } from "@/lib/batteryClaims";
import ChargingJobForm from "./ChargingJobForm";
import BatteryClaimForm from "./BatteryClaimForm";
import ClaimStatusForm from "./ClaimStatusForm";
import ChargingHandoverForm from "./ChargingHandoverForm";

type Tab = "charging" | "claims";

const delay = (i: number) => ({ "--i": Math.min(i, 8) }) as React.CSSProperties;

const CHARGING_TONE: Record<ChargingJobStatus, string> = {
  in_shop: "bg-focus/10 text-focus",
  collected: "bg-cell/10 text-cell-deep",
  unclaimed: "bg-terminal/10 text-terminal-deep",
};

const CLAIM_TONE: Record<BatteryClaimStatus, string> = {
  received: "bg-focus/10 text-focus",
  sent_to_distributor: "bg-sun/25 text-amber-800",
  approved: "bg-cell/10 text-cell-deep",
  rejected: "bg-terminal/10 text-terminal-deep",
  given_to_customer: "bg-violet-500/10 text-violet-700",
  settled: "bg-lead/10 text-casing",
};

export default function BatteryServicesClient({
  jobs,
  claims,
  distributors,
  priceList,
  customers,
  setupIncomplete,
}: {
  jobs: ChargingJob[];
  claims: BatteryClaim[];
  distributors: Distributor[];
  priceList: ChargingPriceListItem[];
  customers: Pick<Customer, "id" | "name" | "phone">[];
  setupIncomplete: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Lets the Home screen's "Claim" and "Charging" buttons land directly on a
  // focused, single-purpose screen via /battery-services?tab=claims (or
  // tab=charging) -- just that one tab's summary, list and "New ..." button,
  // with no tab switcher and no clicking the other kind's card. Arriving
  // with no tab param at all (Sidebar / More / the Inventory card) keeps the
  // full combined view with both tabs, as before.
  const requestedTab = searchParams.get("tab");
  const soloMode = requestedTab === "claims" || requestedTab === "charging";
  const initialTab: Tab = requestedTab === "claims" ? "claims" : "charging";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [jobFormOpen, setJobFormOpen] = useState(false);
  const [claimFormOpen, setClaimFormOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<BatteryClaim | null>(null);
  const [handoverTarget, setHandoverTarget] = useState<ChargingJob | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ---------- Delete a charging job or a battery claim (a wrong/demo slip) ----------
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "charging"; job: ChargingJob } | { kind: "claim"; claim: BatteryClaim } | null
  >(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const id = deleteTarget.kind === "charging" ? deleteTarget.job.id : deleteTarget.claim.id;
    const label = deleteTarget.kind === "charging" ? deleteTarget.job.slip_number : deleteTarget.claim.claim_number;
    const fn = deleteTarget.kind === "charging" ? "delete_charging_job" : "delete_battery_claim";
    try {
      const supabase = await getBrowserClient();
      const { error } = await supabase.rpc(fn, { p_id: id });
      if (error) {
        const alreadyGone = /could not be found/i.test(error.message);
        if (alreadyGone) {
          setHiddenIds((ids) => [...ids, id]);
          setToast(`${label} was already deleted.`);
          setDeleteTarget(null);
          setDeleteBusy(false);
          router.refresh();
          return;
        }
        setDeleteError(
          error.code === "42883" || error.code === "PGRST202"
            ? "The delete setup is missing. Run 13_delete_charging_claims.sql in Supabase, then try again."
            : error.message
        );
        setDeleteBusy(false);
        return;
      }
      setHiddenIds((ids) => [...ids, id]);
      setToast(`${label} deleted.`);
      setDeleteTarget(null);
      setDeleteBusy(false);
      router.refresh();
    } catch {
      setDeleteError("The connection dropped. Refresh this page to see if it was deleted before you try again.");
      setDeleteBusy(false);
    }
  }

  const today = todayKarachi();

  const visibleJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs
      .filter((j) => !hiddenIds.includes(j.id))
      .filter((j) =>
        !q ||
        [j.slip_number, j.customer_name, j.customer_phone ?? "", j.battery_brand, j.battery_model, j.battery_number ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
  }, [jobs, query, hiddenIds]);

  const visibleClaims = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims
      .filter((c) => !hiddenIds.includes(c.id))
      .filter((c) =>
        !q ||
        [c.claim_number, c.customer_name, c.customer_phone ?? "", c.battery_brand, c.battery_model, c.battery_number ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
  }, [claims, query, hiddenIds]);

  const distributorName = (id: string | null) => distributors.find((d) => d.id === id)?.name ?? null;

  // "Battery stock" summary: claimed batteries we're still physically holding
  // (with us, or away at a distributor), grouped by who is holding each one,
  // plus how many customer batteries are in the shop right now for charging.
  const claimStock = useMemo(() => {
    const byHolder = new Map<string, number>();
    let total = 0;
    for (const c of claims) {
      if (!claimHoldsBattery(c.status)) continue;
      const holder = c.status === "received" ? "With us" : distributorName(c.distributor_id) ?? "With distributor (not set)";
      byHolder.set(holder, (byHolder.get(holder) ?? 0) + 1);
      total += 1;
    }
    return { total, byHolder: Array.from(byHolder.entries()).sort((a, b) => b[1] - a[1]) };
  }, [claims, distributors]);

  const chargingInShop = useMemo(() => jobs.filter((j) => j.status === "in_shop").length, [jobs]);

  function onJobCreated(id: string) {
    setJobFormOpen(false);
    router.push(`/print/charging/${id}?auto=1`);
  }

  function onClaimCreated(id: string) {
    setClaimFormOpen(false);
    router.push(`/print/claim/${id}?auto=1`);
  }

  async function setJobStatus(job: ChargingJob, status: ChargingJobStatus) {
    setBusyId(job.id);
    setActionError(null);
    const supabase = await getBrowserClient();
    const { error } = await supabase.rpc("update_charging_job_status", { p_id: job.id, p_status: status });
    setBusyId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setToast(status === "collected" ? "Marked as collected." : "Marked as unclaimed.");
    router.refresh();
  }

  function onClaimStatusSaved(message: string) {
    setStatusTarget(null);
    setToast(message);
    router.refresh();
  }

  function onHandoverSaved(message: string) {
    setHandoverTarget(null);
    setToast(message);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={soloMode ? (tab === "claims" ? "Battery claims" : "Charging jobs") : "Battery services"}
        subtitle={
          soloMode
            ? tab === "claims"
              ? "Batteries sent back to distributors under warranty."
              : "Customer batteries in for charging."
            : "Charging slips and warranty claims. Shop-only slips — never sent to FBR."
        }
        action={
          soloMode ? (
            tab === "claims" ? (
              <button type="button" onClick={() => setClaimFormOpen(true)} className="btn btn-primary">
                <Icon name="shield" className="h-5 w-5" /> New claim
              </button>
            ) : (
              <button type="button" onClick={() => setJobFormOpen(true)} className="btn btn-primary">
                <Icon name="plug" className="h-5 w-5" /> New charging slip
              </button>
            )
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setClaimFormOpen(true)} className="btn btn-quiet">
                <Icon name="shield" className="h-5 w-5" /> New claim
              </button>
              <button type="button" onClick={() => setJobFormOpen(true)} className="btn btn-primary">
                <Icon name="plug" className="h-5 w-5" /> New charging slip
              </button>
            </div>
          )
        }
      />

      {setupIncomplete && (
        <p className="anim-rise mt-4 rounded-xl bg-sun/20 px-4 py-3 text-sm" style={delay(1)}>
          Some battery-service data could not be loaded. Make sure{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">06_battery_services.sql</code> has been run in
          Supabase.
        </p>
      )}

      <div
        className={`anim-rise mt-6 grid gap-3 ${soloMode ? "" : "sm:grid-cols-2"}`}
        style={delay(1)}
      >
        {(!soloMode || tab === "charging") && (
          <div className="card p-4">
            <p className="text-sm text-lead">In shop for charging</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{chargingInShop}</p>
            <p className="mt-1 text-sm text-lead">
              {chargingInShop === 0 ? "No customer batteries in right now." : "Customer batteries currently being charged."}
            </p>
          </div>
        )}
        {(!soloMode || tab === "claims") && (
          <div className="card p-4">
            <p className="text-sm text-lead">Claimed batteries in stock</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{claimStock.total}</p>
            {claimStock.byHolder.length === 0 ? (
              <p className="mt-1 text-sm text-lead">None held right now.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {claimStock.byHolder.map(([holder, n]) => (
                  <li key={holder} className="flex items-center justify-between text-sm">
                    <span className="text-lead">{holder}</span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="anim-rise mt-4 space-y-3" style={delay(2)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!soloMode && (
            <div role="tablist" aria-label="Battery services" className="inline-flex rounded-2xl bg-plate p-1.5">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "charging"}
                onClick={() => setTab("charging")}
                className={`min-h-10 rounded-xl px-4 text-[15px] font-semibold transition-all ${
                  tab === "charging" ? "bg-white text-casing shadow-card" : "text-lead hover:text-casing"
                }`}
              >
                Charging jobs <span className="tabular-nums">({jobs.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "claims"}
                onClick={() => setTab("claims")}
                className={`min-h-10 rounded-xl px-4 text-[15px] font-semibold transition-all ${
                  tab === "claims" ? "bg-white text-casing shadow-card" : "text-lead hover:text-casing"
                }`}
              >
                Battery claims <span className="tabular-nums">({claims.length})</span>
              </button>
            </div>
          )}

          <div className="relative sm:max-w-xs sm:flex-1">
            <label htmlFor="bs-search" className="sr-only">
              Search
            </label>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-lead" />
            <input
              id="bs-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search slip, customer or battery"
              className="input pl-11"
            />
          </div>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="anim-rise mt-4 rounded-xl bg-terminal/10 px-4 py-3 text-sm text-terminal-deep" style={delay(3)}>
          {actionError}
        </p>
      )}

      <div className="mt-4">
        {tab === "charging" ? (
          visibleJobs.length === 0 ? (
            <EmptyState
              icon="plug"
              title={jobs.length === 0 ? "No charging jobs yet" : "Nothing matches"}
              hint={
                jobs.length === 0
                  ? "Take in a customer's battery for charging and print their slip."
                  : "Try a different word."
              }
              action={
                jobs.length === 0 && (
                  <button type="button" onClick={() => setJobFormOpen(true)} className="btn btn-primary mt-6">
                    <Icon name="plus" className="h-5 w-5" /> New charging slip
                  </button>
                )
              }
            />
          ) : (
            <ul className="space-y-3">
              {visibleJobs.map((job, idx) => {
                const overdue = isChargingOverdue(job.due_date, job.status, today);
                return (
                  <li key={job.id} className="card anim-rise p-4" style={delay(idx + 2)}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-lg font-semibold tabular-nums">{job.slip_number}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${CHARGING_TONE[job.status]}`}>
                            {chargingStatusLabel(job.status)}
                          </span>
                          {overdue && (
                            <span className="rounded-full bg-terminal/10 px-2.5 py-0.5 text-sm font-medium text-terminal-deep">
                              Past due
                            </span>
                          )}
                          {job.outcome && (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
                                job.outcome === "charged" ? "bg-cell/10 text-cell-deep" : "bg-terminal/10 text-terminal-deep"
                              }`}
                            >
                              {job.outcome === "charged" ? "Charged fine" : "Was faulty"}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-semibold">
                          {job.battery_brand} {job.battery_model}
                          {job.battery_number ? ` · ${job.battery_number}` : ""}
                        </p>
                        <p className="text-sm text-lead">
                          {job.customer_name}
                          {job.customer_phone ? ` · ${formatPhone(job.customer_phone)}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-lead">
                          Received {formatDay(job.received_date)} · due {formatDay(job.due_date)}
                        </p>
                        {job.handover_note && <p className="mt-1 text-sm text-lead">Note: {job.handover_note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-display text-2xl font-semibold tabular-nums leading-none">
                          {formatRs(job.price)}
                        </p>
                        {job.handover_amount != null && (
                          <p className="text-sm text-lead">{formatRs(job.handover_amount)} received</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line/70 pt-3">
                      <Link href={`/print/charging/${job.id}`} className="btn btn-quiet btn-sm">
                        <Icon name="printer" className="h-4 w-4" /> Slip
                      </Link>
                      {job.status === "in_shop" && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === job.id}
                            onClick={() => setHandoverTarget(job)}
                            className="btn btn-sm bg-cell/10 text-cell-deep hover:bg-cell/15"
                          >
                            <Icon name="check" className="h-4 w-4" /> Mark collected
                          </button>
                          <button
                            type="button"
                            disabled={busyId === job.id}
                            onClick={() => setJobStatus(job, "unclaimed")}
                            className="btn btn-quiet btn-sm text-terminal-deep"
                          >
                            Mark unclaimed
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget({ kind: "charging", job });
                        }}
                        className="btn btn-quiet btn-sm text-terminal-deep"
                      >
                        <Icon name="trash" className="h-4 w-4" /> Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : visibleClaims.length === 0 ? (
          <EmptyState
            icon="shield"
            title={claims.length === 0 ? "No battery claims yet" : "Nothing matches"}
            hint={
              claims.length === 0
                ? "Take in a battery under warranty and send it to a distributor."
                : "Try a different word."
            }
            action={
              claims.length === 0 && (
                <button type="button" onClick={() => setClaimFormOpen(true)} className="btn btn-primary mt-6">
                  <Icon name="plus" className="h-5 w-5" /> New claim
                </button>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {visibleClaims.map((claim, idx) => {
              const dist = distributorName(claim.distributor_id);
              const nextIdx = BATTERY_CLAIM_STATUSES.findIndex((s) => s.value === claim.status) + 1;
              const canAdvance = claim.status !== "rejected" && claim.status !== "settled" && nextIdx < BATTERY_CLAIM_STATUSES.length;
              return (
                <li key={claim.id} className="card anim-rise p-4" style={delay(idx + 2)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg font-semibold tabular-nums">{claim.claim_number}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${CLAIM_TONE[claim.status]}`}>
                          {claimStatusLabel(claim.status)}
                        </span>
                        {claimHoldsBattery(claim.status) && (
                          <span className="rounded-full bg-plate px-2.5 py-0.5 text-sm font-medium text-lead">
                            Battery with {claim.status === "received" ? "us" : dist ?? "distributor"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-semibold">
                        {claim.battery_brand} {claim.battery_model}
                        {claim.battery_number ? ` · ${claim.battery_number}` : ""}
                      </p>
                      <p className="text-sm text-lead">
                        {claim.customer_name}
                        {claim.customer_phone ? ` · ${formatPhone(claim.customer_phone)}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-lead">
                        Received {formatDay(claim.received_date)}
                        {dist ? ` · ${dist}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      {claim.claim_amount != null && (
                        <p className="font-display text-2xl font-semibold tabular-nums leading-none">
                          {formatRs(claim.claim_amount)}
                        </p>
                      )}
                      {claim.extra_charges != null && (
                        <p className="text-sm text-lead">+{formatRs(claim.extra_charges)} extra</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line/70 pt-3">
                    <Link href={`/print/claim/${claim.id}`} className="btn btn-quiet btn-sm">
                      <Icon name="printer" className="h-4 w-4" /> Slip
                    </Link>
                    {canAdvance && (
                      <button type="button" onClick={() => setStatusTarget(claim)} className="btn btn-sm btn-primary">
                        <Icon name="chevron" className="h-4 w-4" /> Move status
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget({ kind: "claim", claim });
                      }}
                      className="btn btn-quiet btn-sm text-terminal-deep"
                    >
                      <Icon name="trash" className="h-4 w-4" /> Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {jobFormOpen && (
        <ChargingJobForm
          customers={customers}
          priceList={priceList}
          onClose={() => setJobFormOpen(false)}
          onCreated={onJobCreated}
        />
      )}

      {claimFormOpen && (
        <BatteryClaimForm
          customers={customers}
          distributors={distributors}
          onClose={() => setClaimFormOpen(false)}
          onCreated={onClaimCreated}
        />
      )}

      {statusTarget && (
        <ClaimStatusForm
          claim={statusTarget}
          distributors={distributors}
          onClose={() => setStatusTarget(null)}
          onSaved={onClaimStatusSaved}
        />
      )}

      {handoverTarget && (
        <ChargingHandoverForm job={handoverTarget} onClose={() => setHandoverTarget(null)} onSaved={onHandoverSaved} />
      )}

      {deleteTarget && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-bs-title"
            aria-describedby="del-bs-text"
            className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
          >
            <h2 id="del-bs-title" className="font-display text-2xl font-bold">
              Delete {deleteTarget.kind === "charging" ? deleteTarget.job.slip_number : deleteTarget.claim.claim_number}?
            </h2>
            <p id="del-bs-text" className="mt-2 text-lead">
              This permanently deletes this {deleteTarget.kind === "charging" ? "charging slip" : "battery claim"} for{" "}
              {deleteTarget.kind === "charging" ? deleteTarget.job.customer_name : deleteTarget.claim.customer_name}. It
              cannot be undone.
            </p>
            {deleteError && (
              <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
                {deleteError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteBusy} autoFocus className="btn btn-quiet">
                Keep it
              </button>
              <button type="button" onClick={confirmDelete} disabled={deleteBusy} className="btn btn-danger">
                {deleteBusy ? "Deleting" : deleteTarget.kind === "charging" ? "Delete slip" : "Delete claim"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: "plug" | "shield";
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card anim-rise border-dashed border-lead/40 px-6 py-14 text-center">
      <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-sun/25 text-amber-800">
        <Icon name={icon} className="h-8 w-8" />
      </span>
      <p className="mt-4 font-display text-3xl font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-lead">{hint}</p>
      {action}
    </div>
  );
}
