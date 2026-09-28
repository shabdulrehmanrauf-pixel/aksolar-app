"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * The FBR QR code: Version 2 (25 x 25 squares), printed 1.0 x 1.0 inch (PRAL DI API v1.12, section 6).
 * It holds the FBR invoice number. Uses error correction M when the number fits, else L (a 28-character number).
 * If the number cannot fit in Version 2, nothing is drawn (the caller shows the number as text).
 */
export function makeFbrQr(value: string): boolean[][] | null {
  const level = new TextEncoder().encode(value).length <= 26 ? "M" : "L";
  try {
    const q = qrcode(2, level);
    q.addData(value, "Byte");
    q.make();
    const n = q.getModuleCount();
    if (n !== 25) return null;
    const rows: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) row.push(q.isDark(r, c));
      rows.push(row);
    }
    return rows;
  } catch {
    return null;
  }
}

export default function FbrQr({ value }: { value: string }) {
  const modules = useMemo(() => makeFbrQr(value), [value]);
  if (!modules) return null;
  const n = modules.length;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modules[r][c]) d += `M${c} ${r}h1v1h-1z`;
  return (
    // White quiet zone (4 squares = 0.16 inch) around the 1 x 1 inch code, so phones can scan it.
    <div style={{ background: "#fff", padding: "0.16in", width: "fit-content" }} data-testid="fbr-qr">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${n} ${n}`}
        width="1in"
        height="1in"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`FBR QR code for invoice ${value}`}
        style={{ display: "block", width: "1in", height: "1in" }}
      >
        <path d={d} fill="#000" />
      </svg>
    </div>
  );
}
