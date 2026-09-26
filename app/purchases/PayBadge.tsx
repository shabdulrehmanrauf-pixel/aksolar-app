import type { PurchaseStatus } from "@/lib/types";

const TONE: Record<"Paid" | "Part paid" | "Unpaid", string> = {
  Paid: "bg-cell/10 text-cell-deep",
  "Part paid": "bg-sun/25 text-amber-900",
  Unpaid: "bg-terminal/10 text-terminal-deep",
};

export default function PurchasePayBadge({
  tag,
  status,
}: {
  tag: "Paid" | "Part paid" | "Unpaid";
  status?: PurchaseStatus;
}) {
  if (status === "Cancelled") {
    return <span className="inline-flex rounded-full bg-plate px-2.5 py-1 text-xs font-semibold text-lead">Cancelled</span>;
  }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[tag]}`}>{tag}</span>;
}
