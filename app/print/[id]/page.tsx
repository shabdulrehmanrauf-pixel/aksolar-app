import { notFound } from "next/navigation";
import { loadInvoiceDocument } from "@/lib/invoiceDoc";
import { loadFbrPrint } from "@/lib/fbrPrintLoad";
import PrintView from "./PrintView";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadInvoiceDocument(id);
  if (!doc) notFound();
  // null for a normal bill: the paper then looks exactly as before.
  const fbr = await loadFbrPrint(doc.invoice.id);
  return <PrintView doc={doc} fbr={fbr} />;
}
