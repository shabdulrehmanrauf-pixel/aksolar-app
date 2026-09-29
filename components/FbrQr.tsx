"use client";

import { useMemo } from "react";
import { makeFbrQr } from "@/lib/fbrQr";

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
