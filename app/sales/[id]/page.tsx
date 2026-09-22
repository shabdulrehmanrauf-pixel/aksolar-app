import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadInvoiceDocument } from "@/lib/invoiceDoc";
import InvoiceDetail from "./InvoiceDetail";

export const metadata: Metadata = { title: "Bill" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadInvoiceDocument(id);
  if (!doc) notFound();
  return <InvoiceDetail doc={doc} />;
}
