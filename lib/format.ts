const NB = "\u00a0";

export function formatRs(value: number): string {
  return "Rs" + NB + value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Big amounts the way shopkeepers say them: Rs 84.5 Lac, Rs 1.2 Cr. Small amounts stay in full. */
export function formatRsCompact(value: number): string {
  const abs = Math.abs(value);
  const short = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1e7) return `Rs${NB}${short(value / 1e7)}${NB}Cr`;
  if (abs >= 1e5) return `Rs${NB}${short(value / 1e5)}${NB}Lac`;
  return formatRs(value);
}

/** 19 Sep 2026, always in Pakistan time so server and browser agree. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi",
  }).format(new Date(iso));
}
