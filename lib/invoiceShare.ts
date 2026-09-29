import { formatPhone, whatsappLink } from "./customers";
import { formatRs } from "./format";
import { formatDay } from "./invoices";
import { computeFbrPrint, fbrHasNumber, type FbrPrintData } from "./fbrPrint";
import type { BusinessProfile, Invoice, InvoiceItem } from "./types";

/** Plain-text version of a bill, for WhatsApp and email. Built from the saved numbers, never retyped. */
export function billText(
  inv: Invoice,
  items: InvoiceItem[],
  seller: BusinessProfile,
  fbr?: FbrPrintData | null,
): string {
  const calc = fbr ? computeFbrPrint(inv.total_value, items, fbr.lines) : null;
  const hasNumber = !!fbr && fbrHasNumber(fbr);
  const cancelled = inv.status === "Cancelled";

  const lines: string[] = [];
  lines.push(`*${seller.business_name}*`);
  lines.push(`${fbr ? "Sales Tax Invoice" : "Sale Invoice"} ${inv.invoice_number}`);
  if (fbr?.environment === "sandbox") lines.push("*TEST INVOICE (FBR sandbox). Not a real FBR invoice.*");
  lines.push(`Date: ${formatDay(inv.invoice_date)}`);
  lines.push(`Customer: ${inv.buyer_name}`);
  if (inv.note) lines.push(`Note: ${inv.note}`);
  lines.push("");
  items.forEach((it, i) => {
    const r = calc?.rows[i];
    lines.push(`${i + 1}. ${it.description}`);
    if (r?.known && r.taxAmount > 0) {
      lines.push(`   ${it.quantity} x ${formatRs(it.rate)}   GST ${r.rateDesc || ""} = ${formatRs(r.taxAmount)}${r.taxInside ? " (in price)" : ""}`);
    }
    lines.push(`   Amount: ${formatRs(r ? r.payable : it.total)}`);
  });
  lines.push("");
  if (calc && calc.taxAdded > 0) {
    lines.push(`Items total: ${formatRs(calc.subtotal)}`);
    lines.push(`GST added: ${formatRs(calc.taxAdded)}`);
  }
  lines.push(`Total: ${formatRs(inv.total_value)}`);
  lines.push(`Paid: ${formatRs(inv.paid_total)}`);
  if (inv.due_total > 0) lines.push(`Balance due: ${formatRs(inv.due_total)}`);
  if (fbr) {
    lines.push("");
    if (hasNumber) {
      lines.push(`FBR invoice number: ${fbr.number}`);
      lines.push("Verify this invoice with the FBR Tax Asaan mobile app.");
    } else {
      lines.push(cancelled ? "This bill is cancelled and was not sent to FBR." : "FBR invoice number: not received yet.");
    }
  }
  lines.push("");
  lines.push("Thank you for your business.");
  if (seller.phone) lines.push(`Call ${formatPhone(seller.phone)}`);
  return lines.join("\n").replace(/\u00a0/g, " ");
}

/** WhatsApp link with the bill text ready to send. Goes to the customer's number when we have it. */
export function whatsappBillLink(
  inv: Invoice,
  items: InvoiceItem[],
  seller: BusinessProfile,
  fbr?: FbrPrintData | null,
): string {
  const text = encodeURIComponent(billText(inv, items, seller, fbr));
  if (inv.buyer_phone) return `${whatsappLink(inv.buyer_phone)}?text=${text}`;
  return `https://wa.me/?text=${text}`;
}

export function emailBillLink(
  inv: Invoice,
  items: InvoiceItem[],
  seller: BusinessProfile,
  fbr?: FbrPrintData | null,
): string {
  const subject = encodeURIComponent(`${fbr ? "Sales Tax Invoice" : "Sale Invoice"} ${inv.invoice_number} from ${seller.business_name}`);
  const body = encodeURIComponent(billText(inv, items, seller, fbr).replace(/\*/g, ""));
  return `mailto:?subject=${subject}&body=${body}`;
}
