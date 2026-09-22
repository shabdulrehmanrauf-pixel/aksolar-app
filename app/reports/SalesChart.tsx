import { formatRs, formatRsCompact } from "@/lib/format";
import { formatDay } from "@/lib/invoices";

type Point = { day: string; sales: number; count: number };

function shortLabel(day: string, bucket: "day" | "month") {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return bucket === "month"
    ? new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(dt)
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(dt);
}

/** Light bar chart drawn as plain SVG. No chart library, no client JavaScript. */
export default function SalesChart({ data, bucket }: { data: Point[]; bucket: "day" | "month" }) {
  const W = 700;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 22;
  const padB = 30;
  const max = Math.max(...data.map((d) => d.sales), 0);
  const total = data.reduce((s, d) => s + d.sales, 0);

  if (data.length === 0 || max <= 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl bg-plate/60 px-4 text-center text-lead">
        No sales in this period yet.
      </div>
    );
  }

  const slot = (W - padL - padR) / data.length;
  const barW = Math.min(46, slot * 0.7);
  const plotH = H - padT - padB;
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const peak = data.reduce((a, b) => (b.sales > a.sales ? b : a));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Sales chart. Total ${formatRs(total)}. Best ${bucket === "month" ? "month" : "day"}: ${formatDay(peak.day)} with ${formatRs(peak.sales)}.`}
      className="h-auto w-full"
    >
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#d3d8d2" />
      {data.map((d, i) => {
        const h = d.sales > 0 ? Math.max(3, (d.sales / max) * plotH) : 0;
        const x = padL + i * slot + (slot - barW) / 2;
        const y = H - padB - h;
        const isPeak = d === peak;
        return (
          <g key={d.day}>
            <title>{`${formatDay(d.day)}: ${formatRs(d.sales)} (${d.count} ${d.count === 1 ? "bill" : "bills"})`}</title>
            {h > 0 && <rect x={x} y={y} width={barW} height={h} rx={4} fill={isPeak ? "#f5b400" : "#2b4450"} />}
            {isPeak && (
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="16" fontWeight="600" fill="#1c2b33">
                {formatRsCompact(d.sales)}
              </text>
            )}
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="14" fill="#5a686e">
                {shortLabel(d.day, bucket)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
