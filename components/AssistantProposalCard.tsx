"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon, { type IconName } from "./Icons";
import { formatRs } from "@/lib/format";
import { formatDay, methodLabel } from "@/lib/invoices";
import { categoryLabel } from "@/lib/inventory";
import { REGISTRATION_TYPES } from "@/lib/customers";
import type {
  ActionDecision,
  ActionResponse,
  BillProposal,
  ChargingProposal,
  ClaimProposal,
  CustomerProposal,
  ItemProposal,
  Proposal,
  ProposalCard,
  ScrapAddProposal,
  ScrapSaleProposal,
} from "@/lib/ai/proposalTypes";

/** Icon, heading and confirm-button words for each kind of proposal. */
const KIND_META: Record<Proposal["kind"], { icon: IconName; title: string; confirm: string }> = {
  create_bill: { icon: "receipt", title: "Bill ready to confirm", confirm: "Confirm bill" },
  add_item: { icon: "box", title: "New item ready to confirm", confirm: "Add item" },
  add_customer: { icon: "userplus", title: "New customer ready to confirm", confirm: "Add customer" },
  add_scrap: { icon: "battery", title: "Scrap battery ready to confirm", confirm: "Add to scrap" },
  sell_scrap: { icon: "banknote", title: "Scrap sale ready to confirm", confirm: "Confirm sale" },
  create_charging: { icon: "bolt", title: "Charging slip ready to confirm", confirm: "Save slip" },
  create_claim: { icon: "shield", title: "Battery claim ready to confirm", confirm: "Save claim" },
};

type Phase = "idle" | "working" | "saved" | "cancelled" | "edited" | "failed";

/**
 * The confirmation card for something the assistant prepared. It draws ONLY what the server
 * validated and saved (see lib/ai/proposals.ts), never the assistant's own wording, so what
 * you read here is exactly what will be saved when you tap Confirm.
 *
 * `onOutcome` adds a short "✔ Saved: …" / "✖ Not saved: …" note to the chat so the assistant
 * (and you) can see what happened.
 */
export default function AssistantProposalCard({
  card,
  onOutcome,
}: {
  card: ProposalCard;
  onOutcome: (note: string) => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ActionResponse | null>(null);
  const busy = useRef(false); // stops a double tap from sending two requests
  const p = card.proposal;
  const meta = KIND_META[p.kind];

  async function decide(decision: ActionDecision) {
    if (busy.current) return;
    busy.current = true;
    setPhase("working");
    try {
      const res = await fetch("/api/assistant/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, decision }),
      });
      const data = (await res.json()) as ActionResponse;
      setResult(data);

      if (!data.ok) {
        setPhase("failed");
        onOutcome(`✖ Not saved: ${data.message}`);
        return;
      }
      if (decision === "confirm") {
        setPhase("saved");
        onOutcome(`✔ Saved: ${data.message}`);
      } else if (decision === "cancel") {
        setPhase("cancelled");
        onOutcome("✖ Cancelled. Nothing was saved.");
      } else {
        setPhase("edited");
        router.push(`/sales/new?ai=${card.id}`);
      }
    } catch {
      setPhase("failed");
      setResult({ ok: false, message: "Couldn't reach the server. Check the connection. Nothing was confirmed." });
    } finally {
      busy.current = false;
    }
  }

  const working = phase === "working";
  const finished = phase !== "idle" && phase !== "working";

  return (
    <div className="w-full max-w-[95%] rounded-2xl border border-line bg-white p-4 shadow-card sm:max-w-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sun/20 text-casing">
            <Icon name={meta.icon} className="h-4 w-4" />
          </span>
          <p className="font-semibold text-casing">{meta.title}</p>
        </div>
        {phase === "idle" || working ? (
          <span className="shrink-0 rounded-full bg-plate px-2.5 py-1 text-xs font-semibold text-lead">Not saved yet</span>
        ) : phase === "saved" ? (
          <span className="shrink-0 rounded-full bg-cell/10 px-2.5 py-1 text-xs font-semibold text-cell-deep">Saved</span>
        ) : (
          <span className="shrink-0 rounded-full bg-plate px-2.5 py-1 text-xs font-semibold text-lead">
            {phase === "cancelled" ? "Cancelled" : phase === "edited" ? "Sent to edit" : "Not saved"}
          </span>
        )}
      </div>

      <div className="mt-3">
        {p.kind === "create_bill" && <BillBody p={p} />}
        {p.kind === "add_item" && <ItemBody p={p} />}
        {p.kind === "add_customer" && <CustomerBody p={p} />}
        {p.kind === "add_scrap" && <ScrapAddBody p={p} />}
        {p.kind === "sell_scrap" && <ScrapSaleBody p={p} />}
        {p.kind === "create_charging" && <ChargingBody p={p} />}
        {p.kind === "create_claim" && <ClaimBody p={p} />}
      </div>

      {p.warnings.length > 0 && !finished && (
        <ul className="mt-3 space-y-1 rounded-xl bg-sun/15 px-3 py-2 text-sm text-amber-900" role="note">
          {p.warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {phase === "failed" && result && (
        <p className="mt-3 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep" role="alert">
          {result.message} Ask the assistant to prepare it again, or use the normal screen.
        </p>
      )}

      {phase === "saved" && result?.link && (
        <Link href={result.link} className="btn btn-quiet mt-3 w-full">
          {result.linkLabel ?? "Open"}
        </Link>
      )}

      {!finished && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary flex-1" onClick={() => decide("confirm")} disabled={working}>
            {working ? "Saving…" : meta.confirm}
          </button>
          {p.kind === "create_bill" && (
            <button type="button" className="btn btn-quiet" onClick={() => decide("edit")} disabled={working}>
              <Icon name="edit" className="h-4 w-4" />
              Edit
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => decide("cancel")} disabled={working}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- bodies */

function Row({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-lead">{label}</span>
      <span className={`text-right font-semibold ${tone === "bad" ? "text-terminal-deep" : "text-casing"}`}>{value}</span>
    </div>
  );
}

function BillBody({ p }: { p: BillProposal }) {
  return (
    <div className="space-y-3">
      <Row label="Customer" value={p.customer.saved ? p.customer.name : `${p.customer.name} (walk-in)`} />
      <ul className="divide-y divide-line/60 rounded-xl border border-line/60">
        {p.lines.map((l) => (
          <li key={l.itemId} className="px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-casing">{l.name}</p>
                {l.specs && <p className="text-xs text-lead">{l.specs}</p>}
              </div>
              <p className="shrink-0 text-sm font-semibold text-casing">{formatRs(l.amount)}</p>
            </div>
            <p className="mt-0.5 text-xs text-lead">
              {l.qty} × {formatRs(l.rate)}
              {l.priceChanged && (
                <span className="ml-2 rounded-full bg-sun/25 px-2 py-0.5 font-semibold text-amber-900">Price changed</span>
              )}
            </p>
          </li>
        ))}
      </ul>
      <div className="space-y-1">
        <Row label="Total" value={formatRs(p.total)} />
        <Row label={p.mode === "credit" ? "Paying now" : `Paying now (${methodLabel(p.method)})`} value={formatRs(p.paid)} />
        {p.due > 0 && <Row label="Udhaar" value={formatRs(p.due)} tone="bad" />}
      </div>
      {p.note && <p className="text-xs text-lead">Note: {p.note}</p>}
    </div>
  );
}

function ItemBody({ p }: { p: ItemProposal }) {
  const f = p.form;
  return (
    <div className="space-y-1">
      <p className="text-base font-semibold text-casing">
        {f.brand} {f.model}
      </p>
      <p className="text-xs text-lead">{[categoryLabel(f.category), p.specs].filter(Boolean).join(" · ")}</p>
      <div className="mt-2 space-y-1">
        <Row label="Starting stock" value={f.quantity} />
        <Row label="Cost price" value={formatRs(Number(f.cost_price))} />
        <Row label="Sale price" value={formatRs(Number(f.sale_price))} />
        <Row label="Low-stock warning at" value={f.reorder_level} />
      </div>
    </div>
  );
}

function CustomerBody({ p }: { p: CustomerProposal }) {
  const f = p.form;
  const type = REGISTRATION_TYPES.find((t) => t.value === f.registration_type)?.label ?? f.registration_type;
  return (
    <div className="space-y-1">
      <p className="text-base font-semibold text-casing">{f.name}</p>
      <div className="mt-2 space-y-1">
        <Row label="Phone" value={f.phone || "—"} />
        <Row label="Address" value={f.address || "—"} />
        <Row label="Type" value={type} />
        {f.cnic_or_ntn && <Row label="CNIC / NTN" value={f.cnic_or_ntn} />}
      </div>
    </div>
  );
}

/** "Ali Traders" or "Ahmed (walk-in)" */
function customerLine(c: { name: string; saved: boolean }) {
  return c.saved ? c.name : `${c.name} (walk-in)`;
}

function ScrapAddBody({ p }: { p: ScrapAddProposal }) {
  return (
    <div className="space-y-1">
      <p className="text-base font-semibold text-casing">
        {p.brand} {p.model}
      </p>
      {p.batteryType && <p className="text-xs text-lead">{p.batteryType}</p>}
      <div className="mt-2 space-y-1">
        <Row label="Quantity" value={String(p.quantity)} />
        <Row label="Weight" value={p.weightKg != null ? `${p.weightKg} kg` : "Not weighed yet"} />
        {p.batteryNumber && <Row label="Serial / plate" value={p.batteryNumber} />}
        <Row label="From" value={p.customerName ?? "—"} />
        <Row label="Received" value={formatDay(p.receivedDate)} />
      </div>
      {p.note && <p className="mt-2 text-xs text-lead">Note: {p.note}</p>}
    </div>
  );
}

function ScrapSaleBody({ p }: { p: ScrapSaleProposal }) {
  return (
    <div className="space-y-3">
      <Row label="Buyer" value={p.buyerPhone ? `${p.buyerName} · ${p.buyerPhone}` : p.buyerName} />
      <ul className="max-h-40 divide-y divide-line/60 overflow-y-auto rounded-xl border border-line/60">
        {p.rows.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-casing">{r.name}</p>
              <p className="text-xs text-lead">{r.intakeNumber}</p>
            </div>
            <p className="shrink-0 text-sm text-lead">qty {r.qty}</p>
          </li>
        ))}
      </ul>
      <div className="space-y-1">
        <Row label="Batteries" value={String(p.totalQty)} />
        <Row label="Total weight" value={`${p.weightKg} kg`} />
        <Row label="Rate per kg" value={formatRs(p.ratePerKg)} />
        <Row label="Total amount" value={formatRs(p.total)} />
        <Row label="Sale date" value={formatDay(p.saleDate)} />
      </div>
      {p.note && <p className="text-xs text-lead">Note: {p.note}</p>}
    </div>
  );
}

function ChargingBody({ p }: { p: ChargingProposal }) {
  return (
    <div className="space-y-1">
      <Row label="Customer" value={customerLine(p.customer)} />
      {p.customer.phone && <Row label="Phone" value={p.customer.phone} />}
      <p className="pt-1 text-base font-semibold text-casing">
        {p.brand} {p.model}
      </p>
      <div className="mt-2 space-y-1">
        {p.batteryNumber && <Row label="Serial / plate" value={p.batteryNumber} />}
        <Row label="Charging price" value={formatRs(p.price)} />
        <Row label="Received" value={formatDay(p.receivedDate)} />
        <Row label="Collect by" value={formatDay(p.dueDate)} />
      </div>
      {p.note && <p className="mt-2 text-xs text-lead">Note: {p.note}</p>}
    </div>
  );
}

function ClaimBody({ p }: { p: ClaimProposal }) {
  return (
    <div className="space-y-1">
      <Row label="Customer" value={customerLine(p.customer)} />
      {p.customer.phone && <Row label="Phone" value={p.customer.phone} />}
      <p className="pt-1 text-base font-semibold text-casing">
        {p.brand} {p.model}
      </p>
      <div className="mt-2 space-y-1">
        {p.batteryNumber && <Row label="Serial / plate" value={p.batteryNumber} />}
        <Row label="Original bill" value={p.originalInvoice ? `${p.originalInvoice.number} · ${formatDay(p.originalInvoice.date)}` : "—"} />
        <Row label="Distributor" value={p.distributor ? `${p.distributor.name}${p.distributor.isNew ? " (new)" : ""}` : "Not chosen yet"} />
        {p.claimAmount != null && <Row label="Claim amount" value={formatRs(p.claimAmount)} />}
        {p.extraCharges != null && <Row label="Extra charges" value={formatRs(p.extraCharges)} />}
        <Row label="Received" value={formatDay(p.receivedDate)} />
      </div>
      {p.note && <p className="mt-2 text-xs text-lead">Note: {p.note}</p>}
    </div>
  );
}
