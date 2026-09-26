import { notFound } from "next/navigation";
import { loadPaymentDocument } from "@/lib/paymentDoc";
import PaymentVoucherView from "./PaymentVoucherView";

export default async function PaymentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadPaymentDocument(id);
  if (!doc) notFound();
  return <PaymentVoucherView doc={doc} />;
}
