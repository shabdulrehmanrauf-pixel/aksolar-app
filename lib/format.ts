export function formatRs(value: number): string {
  return "Rs\u00a0" + value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
