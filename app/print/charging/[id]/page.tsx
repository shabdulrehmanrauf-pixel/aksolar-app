import { notFound } from "next/navigation";
import { loadChargingSlipDocument } from "@/lib/chargingJobsDoc";
import ChargingSlipView from "./ChargingSlipView";

export default async function PrintChargingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadChargingSlipDocument(id);
  if (!doc) notFound();
  return <ChargingSlipView doc={doc} />;
}
