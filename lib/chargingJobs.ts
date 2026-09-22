import type { ChargingJobStatus } from "./types";

/* ---------- Shop rules shown on every charging slip ---------- */

export const CHARGING_HOLD_DAYS = 3;

export const SHOP_HOURS_NOTE = "Open 10:30 AM - 9:00 PM. Closed on Friday.";

export const CHARGING_SLIP_TERMS =
  `Please collect your battery within ${CHARGING_HOLD_DAYS} days of the date above. ` +
  `After ${CHARGING_HOLD_DAYS} days we are not responsible for the battery. ${SHOP_HOURS_NOTE}`;

/* ---------- Status labels ---------- */

export const CHARGING_STATUS_LABEL: Record<ChargingJobStatus, string> = {
  in_shop: "In shop",
  collected: "Collected",
  unclaimed: "Unclaimed (past due)",
};

export function chargingStatusLabel(s: ChargingJobStatus): string {
  return CHARGING_STATUS_LABEL[s] ?? s;
}

/** True once today is past the due date and the battery has not been collected. */
export function isChargingOverdue(dueDate: string, status: ChargingJobStatus, todayYmd: string): boolean {
  return status === "in_shop" && todayYmd > dueDate;
}
