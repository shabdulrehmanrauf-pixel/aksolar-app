"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icons";
import { emailBillLink, whatsappBillLink } from "@/lib/invoiceShare";
import { fbrHasNumber } from "@/lib/fbrPrint";
import type { InvoiceDocument } from "@/lib/invoiceDoc";

/** Print, PDF, WhatsApp and email for one bill. The PDF code is only downloaded when someone taps a PDF button. */
export default function InvoiceActions({ doc, onDark = false }: { doc: InvoiceDocument; onDark?: boolean }) {
  const { invoice, items, seller, fbr } = doc;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const quiet = onDark
    ? "on-dark btn border border-white/20 bg-white/10 text-white hover:bg-white/20"
    : "btn btn-quiet";

  // FBR bill still waiting for its number: PDF/WhatsApp/email would go out without it.
  const isFbr = !!fbr;
  const numberReady = !isFbr || invoice.status === "Cancelled" || fbrHasNumber(fbr!);
  const waitNote =
    "This FBR bill has not received its FBR number yet. It normally takes about 15 seconds after saving " +
    "(check the shop PC sender is running). You can still send it, but it will say the number is not received.";

  async function makeFile() {
    const { invoicePdfFile } = await import("@/lib/pdf");
    return invoicePdfFile(doc);
  }

  async function download() {
    setBusy(true);
    setNote(null);
    try {
      const file = await makeFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote(numberReady ? `${file.name} downloaded.` : `${file.name} downloaded. ${waitNote}`);
    } catch {
      setNote("The PDF could not be made. Use Print and choose Save as PDF instead.");
    }
    setBusy(false);
  }

  /** Phones: opens the share sheet with the PDF attached (WhatsApp, email, Drive ...). Other devices download it instead. */
  async function sharePdf() {
    setBusy(true);
    setNote(null);
    try {
      const file = await makeFile();
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${isFbr ? "Sales Tax Invoice" : "Sale Invoice"} ${invoice.invoice_number}` });
      } else {
        await download();
        return;
      }
      if (!numberReady) setNote(waitNote);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote("Sharing did not work. Try Download PDF instead.");
    }
    setBusy(false);
  }

  function sendClick(ready: boolean) {
    if (!ready) setNote(waitNote);
    else setNote(null);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        <Link href={`/print/${invoice.id}?auto=1`} className={quiet}>
          <Icon name="printer" className="h-5 w-5" /> Print
        </Link>
        <button type="button" onClick={download} disabled={busy} className={quiet}>
          <Icon name="download" className="h-5 w-5" /> Download PDF
        </button>
        <button type="button" onClick={sharePdf} disabled={busy} className={`${quiet} sm:hidden`}>
          <Icon name="share" className="h-5 w-5" /> Share PDF
        </button>
        <a
          href={whatsappBillLink(invoice, items, seller, fbr)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => sendClick(numberReady)}
          className="on-dark btn bg-[#25a35a] text-white hover:bg-[#1f8f4e]"
        >
          <Icon name="chat" className="h-5 w-5" /> WhatsApp
        </a>
        <a href={emailBillLink(invoice, items, seller, fbr)} onClick={() => sendClick(numberReady)} className={quiet}>
          <Icon name="mail" className="h-5 w-5" /> Email
        </a>
      </div>
      {note && (
        <p role="status" className={`mt-2 text-sm ${onDark ? "text-white/80" : "text-lead"}`}>
          {note}
        </p>
      )}
    </div>
  );
}
