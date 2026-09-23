import { notFound } from "next/navigation";
import { loadScrapSaleSlipDocument } from "@/lib/scrapBatteryDoc";
import ScrapSaleSlipView from "./ScrapSaleSlipView";

export default async function PrintScrapSaleSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadScrapSaleSlipDocument(id);
  if (!doc) notFound();
  return <ScrapSaleSlipView doc={doc} />;
}
