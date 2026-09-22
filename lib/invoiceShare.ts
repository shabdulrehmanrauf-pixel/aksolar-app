import { formatPhone, whatsappLink } from "./customers";
import { formatRs } from "./format";
import { formatDay } from "./invoices";
import type { BusinessProfile, Invoice, InvoiceItem } from "./types";

/** Plain-text version of a bill, for WhatsApp and email. Built from the saved numbers, never retyped. */
export function billText(inv: Invoice, items: InvoiceItem[], seller: BusinessProfile): string {
  const lines: string[] = [];
  lines.push(`*${seller.business_name}*`);
  lines.push(`Sale Invoice ${inv.invoice_number}`);
  lines.push(`Date: ${formatDay(inv.invoice_date)}`);
  lines.push(`Customer: ${inv.buyer_name}`);
  if (inv.note) lines.push(`Note: ${inv.note}`);
  lines.push("");
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.description}`);
    lines.push(`   ${it.quantity} x ${formatRs(it.rate)} = ${formatRs(it.total)}`);
  });
  lines.push("");
  lines.push(`Total: ${formatRs(inv.total_value)}`);
  lines.push(`Paid: ${formatRs(inv.paid_total)}`);
  if (inv.due_total > 0) lines.push(`Balance due: ${formatRs(inv.due_total)}`);
  lines.push("");
  lines.push("Thank you for your business.");
  if (seller.phone) lines.push(`Call ${formatPhone(seller.phone)}`);
  return lines.join("\n").replace(/\u00a0/g, " ");
}

/** WhatsApp link with the bill text ready to send. Goes to the customer's number when we have it. */
export function whatsappBillLink(inv: Invoice, items: InvoiceItem[], seller: BusinessProfile): string {
  const text = encodeURIComponent(billText(inv, items, seller));
  if (inv.buyer_phone) return `${whatsappLink(inv.buyer_phone)}?text=${text}`;
  return `https://wa.me/?text=${text}`;
}

export function emailBillLink(inv: Invoice, items: InvoiceItem[], seller: BusinessProfile): string {
  const subject = encodeURIComponent(`Sale Invoice ${inv.invoice_number} from ${seller.business_name}`);
  const body = encodeURIComponent(billText(inv, items, seller).replace(/\*/g, ""));
  return `mailto:?subject=${subject}&body=${body}`;
}
