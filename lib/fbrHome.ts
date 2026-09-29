/**
 * FBR warnings for the Home screen (Phase D5d). Pure helpers, safe in server and client code.
 * Shown only to Owner and Accountant (same audience that sees FBR error detail on a bill, D5a).
 * When fbr_enabled is off, or the FBR tables are missing, this whole block is skipped.
 */

export type FbrHomeWarnings = {
  enabled: boolean;
  environment: "sandbox" | "production";
  /** True when the shop PC sender has not been seen recently. */
  senderOffline: boolean;
  senderLastSeen: string | null;
  failedCount: number;
  failedSample: { id: string; invoiceNumber: string; buyerName: string }[];
  unknownCount: number;
  unknownSample: { id: string; invoiceNumber: string; buyerName: string }[];
};

/** A sender that hasn't reported in for this long is treated as offline. It writes a heartbeat about every minute. */
export const SENDER_OFFLINE_AFTER_MINUTES = 10;

export function isSenderOffline(lastSeen: string | null): boolean {
  if (!lastSeen) return true;
  const ageMinutes = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  return ageMinutes > SENDER_OFFLINE_AFTER_MINUTES;
}

/** True when there is anything worth telling the Owner/Accountant about. */
export function hasFbrWarning(w: FbrHomeWarnings): boolean {
  return w.enabled && (w.senderOffline || w.failedCount > 0 || w.unknownCount > 0);
}
