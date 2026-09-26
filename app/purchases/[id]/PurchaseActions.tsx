import Link from "next/link";
import Icon from "@/components/Icons";
import type { PurchaseInvoice } from "@/lib/types";

export default function PurchaseActions({ purchase, onDark = false }: { purchase: PurchaseInvoice; onDark?: boolean }) {
  const quiet = onDark
    ? "on-dark btn border border-white/20 bg-white/10 text-white hover:bg-white/20"
    : "btn btn-quiet";

  return (
    <Link href={`/print/purchase/${purchase.id}?auto=1`} className={quiet}>
      <Icon name="printer" className="h-5 w-5" /> Print
    </Link>
  );
}
