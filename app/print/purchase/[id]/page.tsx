import { notFound } from "next/navigation";
import { loadPurchaseDocument } from "@/lib/purchaseDoc";
import PurchaseSlipView from "./PurchaseSlipView";

export default async function PurchasePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadPurchaseDocument(id);
  if (!doc) notFound();
  return <PurchaseSlipView doc={doc} />;
}
