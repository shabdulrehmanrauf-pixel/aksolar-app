/**
 * FBR status of one bill (Phase D5a). Pure helpers, safe to use in server and client code.
 * The sender on the shop PC writes these values into the fbr_invoices table. The app only reads them.
 *
 * A bill with NO row in fbr_invoices was not made as an FBR bill, so it shows no FBR badge at all.
 */

export type FbrStatus = "pending" | "sending" | "sent" | "failed" | "unknown";

export type FbrInfo = {
  status: FbrStatus;
  /** The invoice number FBR gave back. Only present once status is "sent". */
  number: string | null;
  environment: "sandbox" | "production";
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  nextRetryAt: string | null;
  submittedAt: string | null;
};

/** The columns the app reads from fbr_invoices. */
export const FBR_COLUMNS =
  "invoice_id,fbr_status,fbr_invoice_number,environment,error_code,error_message,attempts,next_retry_at,submitted_at";

const STATUSES: FbrStatus[] = ["pending", "sending", "sent", "failed", "unknown"];

/** Turns one fbr_invoices row into FbrInfo. Returns null for a row that does not look right. */
export function fbrInfoFromRow(row: unknown): (FbrInfo & { invoiceId: string }) | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const invoiceId = typeof r.invoice_id === "string" ? r.invoice_id : "";
  const status = r.fbr_status as FbrStatus;
  if (!invoiceId || !STATUSES.includes(status)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    invoiceId,
    status,
    number: str(r.fbr_invoice_number),
    environment: r.environment === "production" ? "production" : "sandbox",
    errorCode: str(r.error_code),
    errorMessage: str(r.error_message),
    attempts: Number(r.attempts) || 0,
    nextRetryAt: str(r.next_retry_at),
    submittedAt: str(r.submitted_at),
  };
}

export const FBR_LABEL: Record<FbrStatus, string> = {
  pending: "FBR waiting",
  sending: "FBR sending",
  sent: "FBR sent",
  failed: "FBR failed",
  unknown: "FBR unsure",
};

/** Colours, same family as PayBadge. Test (sandbox) bills are marked so nobody thinks they are real. */
export const FBR_TONE: Record<FbrStatus, string> = {
  pending: "bg-sun/25 text-amber-900",
  sending: "bg-sun/25 text-amber-900",
  sent: "bg-cell/10 text-cell-deep",
  failed: "bg-terminal/10 text-terminal-deep",
  unknown: "bg-sun/25 text-amber-900",
};

export const FBR_TONE_DARK: Record<FbrStatus, string> = {
  pending: "bg-sun text-casing",
  sending: "bg-sun text-casing",
  sent: "bg-emerald-200 text-emerald-900",
  failed: "bg-red-200 text-red-900",
  unknown: "bg-sun text-casing",
};

/** One plain sentence for each state: what it means and what to do. */
export function fbrMeaning(info: FbrInfo, billCancelled: boolean): string {
  if (billCancelled && info.status !== "sent") {
    return "This bill is cancelled, so it is not sent to FBR.";
  }
  if (billCancelled && info.status === "sent") {
    return info.environment === "sandbox"
      ? "FBR accepted this bill in the TEST system before it was cancelled here. It is not a real FBR invoice."
      : "FBR accepted this bill before it was cancelled here. FBR's own record still shows it as accepted -- use a debit note to correct that.";
  }
  switch (info.status) {
    case "sent":
      return info.environment === "sandbox"
        ? "FBR accepted this bill in the TEST system. It is not a real FBR invoice yet."
        : "FBR accepted this bill.";
    case "pending":
      return info.attempts > 0
        ? "FBR did not answer yet. The shop PC will try again by itself."
        : "Waiting for the shop PC to send it. This normally takes about 15 seconds.";
    case "sending":
      return "The shop PC is sending it to FBR right now.";
    case "failed":
      return "FBR refused this bill. It will not be sent again until the cause is fixed.";
    case "unknown":
      return "There was no clear answer from FBR. It was not sent again, in case FBR already has it. Check the FBR portal first.";
  }
}

/** Should the list show a badge for this bill? Cancelled bills that never reached FBR show none. */
export function showFbrBadge(info: FbrInfo | undefined, billCancelled: boolean): info is FbrInfo {
  if (!info) return false;
  if (billCancelled && info.status !== "sent") return false;
  return true;
}
