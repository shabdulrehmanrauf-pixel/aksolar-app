import { notFound } from "next/navigation";
import { loadClaimSlipDocument } from "@/lib/batteryClaimsDoc";
import ClaimSlipView from "./ClaimSlipView";

export default async function PrintClaimSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadClaimSlipDocument(id);
  if (!doc) notFound();
  return <ClaimSlipView doc={doc} />;
}
