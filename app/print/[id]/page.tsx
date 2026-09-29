import { notFound } from "next/navigation";
import { loadInvoiceDocument } from "@/lib/invoiceDoc";
import PrintView from "./PrintView";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadInvoiceDocument(id);
  if (!doc) notFound();
  // doc.fbr is null for a normal bill: the paper then looks exactly as before.
  return <PrintView doc={doc} fbr={doc.fbr ?? null} />;
}
