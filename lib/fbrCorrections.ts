/**
 * Pure helpers for FBR corrections (Phase D7): cancelling a bill, and the 180-day debit-note window.
 * No FBR wire-protocol assumptions here -- only the rule PRAL states publicly (180 days from the
 * original invoice date). Confirm with the accountant / PRAL before relying on this for a real bill.
 */

export const DEBIT_NOTE_WINDOW_DAYS = 180;

/** Days between an ISO date (YYYY-MM-DD) and today, in Pakistan's calendar day terms. */
export function daysSince(isoDate: string): number {
  const then = new Date(`${isoDate}T00:00:00+05:00`).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86400000);
}

export function canDebitNote(originalInvoiceDate: string): boolean {
  return daysSince(originalInvoiceDate) <= DEBIT_NOTE_WINDOW_DAYS;
}

export function debitNoteDaysLeft(originalInvoiceDate: string): number {
  return Math.max(0, DEBIT_NOTE_WINDOW_DAYS - daysSince(originalInvoiceDate));
}
