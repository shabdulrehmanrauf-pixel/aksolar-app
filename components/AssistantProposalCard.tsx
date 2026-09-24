"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icons";
import { formatRs } from "@/lib/format";
import { methodLabel } from "@/lib/invoices";
import { categoryLabel } from "@/lib/inventory";
import { REGISTRATION_TYPES } from "@/lib/customers";
import type { ActionDecision, ActionResponse, BillProposal, CustomerProposal, ItemProposal, ProposalCard } from "@/lib/ai/proposalTypes";

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
            <Icon name={p.kind === "create_bill" ? "receipt" : p.kind === "add_item" ? "box" : "userplus"} className="h-4 w-4" />
          </span>
          <p className="font-semibold text-casing">
            {p.kind === "create_bill" ? "Bill ready to confirm" : p.kind === "add_item" ? "New item ready to confirm" : "New customer ready to confirm"}
          </p>
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
            {working ? "Saving…" : p.kind === "create_bill" ? "Confirm bill" : p.kind === "add_item" ? "Add item" : "Add customer"}
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
