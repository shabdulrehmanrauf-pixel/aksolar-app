import type { BatteryClaimStatus } from "./types";

/* ---------- Status labels + order ---------- */

export const BATTERY_CLAIM_STATUSES: { value: BatteryClaimStatus; label: string }[] = [
  { value: "received", label: "Received from customer" },
  { value: "sent_to_distributor", label: "Sent to distributor" },
  { value: "approved", label: "Approved by distributor" },
  { value: "rejected", label: "Rejected by distributor" },
  { value: "given_to_customer", label: "Replacement given to customer" },
  { value: "settled", label: "Settled with distributor" },
];

export function claimStatusLabel(s: BatteryClaimStatus): string {
  return BATTERY_CLAIM_STATUSES.find((x) => x.value === s)?.label ?? s;
}

/** Whether a battery from this claim is still physically away from the customer
 * (with us, or with the distributor) -- i.e. it should still count in stock. */
export function claimHoldsBattery(status: BatteryClaimStatus): boolean {
  return status === "received" || status === "sent_to_distributor" || status === "approved";
}

/** A distributor must be chosen before (or exactly when) a claim moves to "sent_to_distributor". */
export function claimNeedsDistributor(status: BatteryClaimStatus): boolean {
  return status === "sent_to_distributor" || status === "approved" || status === "settled";
}
