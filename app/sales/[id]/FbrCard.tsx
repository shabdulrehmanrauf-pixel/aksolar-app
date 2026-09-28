"use client";

import { useState } from "react";
import { useRoleInfo } from "@/components/RoleProvider";
import { effectiveRole } from "@/lib/roles";
import { fbrMeaning, type FbrInfo } from "@/lib/fbrStatus";
import FbrBadge from "../FbrBadge";

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Karachi",
});

function fmt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : when.format(d);
}

/** The "FBR" box on one bill: status, FBR invoice number, and (for the Owner and Accountant) FBR's error text. */
export default function FbrCard({ info, invoiceNumber, cancelled }: { info: FbrInfo; invoiceNumber: string; cancelled: boolean }) {
  const role = effectiveRole(useRoleInfo());
  const seesDetail = role === "owner" || role === "accountant";
  const isOwner = role === "owner";
  const [copied, setCopied] = useState(false);

  const showProblem = seesDetail && (info.status === "failed" || info.status === "unknown") && (info.errorMessage || info.errorCode);
  const nextTry = info.status === "pending" && info.attempts > 0 ? fmt(info.nextRetryAt) : null;
  const sentAt = info.status === "sent" ? fmt(info.submittedAt) : null;

  async function copyNumber() {
    if (!info.number) return;
    try {
      await navigator.clipboard.writeText(info.number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available: the number is still on screen */
    }
  }

  return (
    <section className="card anim-rise p-5" style={{ "--i": 2 } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">FBR</h2>
        <FbrBadge info={info} />
      </div>

      <p className="mt-2 text-[15px] text-lead">{fbrMeaning(info, cancelled)}</p>

      {info.number && (
        <div className="mt-3 rounded-xl bg-plate/70 px-3 py-2.5">
          <p className="text-sm text-lead">FBR invoice number</p>
          <div className="flex items-center justify-between gap-3">
            <p className="break-all font-semibold tabular-nums">{info.number}</p>
            <button type="button" onClick={copyNumber} className="shrink-0 text-sm font-semibold text-focus hover:underline">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <dl className="mt-3 space-y-1 text-sm text-lead">
        {sentAt && <div>Sent {sentAt}</div>}
        {nextTry && <div>Next try: {nextTry}</div>}
        {seesDetail && info.attempts > 0 && info.status !== "sent" && (
          <div>
            {info.attempts} {info.attempts === 1 ? "try" : "tries"} so far
          </div>
        )}
      </dl>

      {showProblem && (
        <div role="alert" className="mt-3 rounded-xl bg-terminal/10 px-3 py-2.5 text-[15px] text-terminal-deep">
          <p className="font-semibold">What FBR said</p>
          {info.errorCode && <p className="tabular-nums">Error code {info.errorCode}</p>}
          {info.errorMessage && <p className="mt-0.5 whitespace-pre-line break-words">{info.errorMessage}</p>}
        </div>
      )}

      {!seesDetail && (info.status === "failed" || info.status === "unknown") && !cancelled && (
        <p className="mt-3 rounded-xl bg-terminal/10 px-3 py-2.5 text-[15px] text-terminal-deep">
          There is a problem with this bill at FBR. Please tell the Owner.
        </p>
      )}

      {isOwner && (info.status === "failed" || info.status === "unknown") && !cancelled && (
        <div className="mt-3 rounded-xl bg-plate/70 px-3 py-2.5 text-[15px]">
          <p className="font-semibold">To send it again</p>
          <p className="mt-0.5 text-lead">
            {info.status === "unknown"
              ? "First look for this bill on the FBR portal. Only if it is not there, run this on the shop PC in C:\\fbr-sender:"
              : "Fix the cause first, then run this on the shop PC in C:\\fbr-sender:"}
          </p>
          <code className="mt-1.5 block break-all rounded-lg bg-white px-2.5 py-2 text-sm text-casing">
            node src/cli.js retry {invoiceNumber}
            {info.status === "unknown" ? " --yes-i-checked-fbr" : ""}
          </code>
        </div>
      )}
    </section>
  );
}
