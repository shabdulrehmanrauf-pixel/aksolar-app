import { PAYMENT_LABEL } from "@/lib/invoices";
import type { InvoiceStatus, PaymentStatus } from "@/lib/types";

const TONE: Record<PaymentStatus, string> = {
  Paid: "bg-cell/10 text-cell-deep",
  Partial: "bg-sun/25 text-amber-900",
  Credit: "bg-terminal/10 text-terminal-deep",
};

/** Small coloured tag: Paid / Part paid / Udhaar. A cancelled bill shows Cancelled instead. */
const TONE_DARK: Record<PaymentStatus, string> = {
  Paid: "bg-emerald-200 text-emerald-900",
  Partial: "bg-sun text-casing",
  Credit: "bg-red-200 text-red-900",
};

export default function PayBadge({ status, bill, onDark }: { status: PaymentStatus; bill?: InvoiceStatus; onDark?: boolean }) {
  if (bill === "Cancelled") {
    return <span className="inline-flex rounded-full bg-plate px-2.5 py-1 text-xs font-semibold text-lead">Cancelled</span>;
  }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${(onDark ? TONE_DARK : TONE)[status]}`}>
      {PAYMENT_LABEL[status]}
    </span>
  );
}
