/**
 * Go-live readiness checks (Phase D8). Pure helpers, safe in server and client code.
 * These only check what the app can see for itself -- they cannot check PRAL registration,
 * tokens, or anything on the FBR side. Section 4 of the D6 checklist covers those.
 */

export type FbrReadiness = {
  environment: "sandbox" | "production";
  /** Taxable items still missing HS code or GST rate -- these block an FBR bill. */
  itemsNotReady: number;
  listsLoaded: boolean;
  failedCount: number;
  unknownCount: number;
  senderSeenRecently: boolean;
};

/** True when every check this page can see has passed. Going live still needs the D6/D8 human steps too. */
export function isReadyForGoLive(r: FbrReadiness): boolean {
  return r.itemsNotReady === 0 && r.listsLoaded && r.failedCount === 0 && r.unknownCount === 0 && r.senderSeenRecently;
}
