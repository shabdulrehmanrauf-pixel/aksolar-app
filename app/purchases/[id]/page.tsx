import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPurchaseDocument } from "@/lib/purchaseDoc";
import PurchaseDetail from "./PurchaseDetail";

export const metadata: Metadata = { title: "Purchase bill" };

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadPurchaseDocument(id);
  if (!doc) notFound();

  return <PurchaseDetail {...doc} />;
}
