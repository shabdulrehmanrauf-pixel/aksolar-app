/*
  A small, dependency-free PDF writer, just enough for one invoice (text, lines, boxes).
  No package is added, so the app stays light. It is loaded only when someone taps "Download PDF".
  It uses the standard Helvetica fonts, which every PDF viewer has. Characters outside Latin
  (for example Urdu script) cannot be drawn with these fonts and are shown as "?".
  The Print view (browser) shows every script correctly.
*/
import { formatRs } from "./format";
import { formatDay, formatTime, methodLabel } from "./invoices";
import { computeFbrPrint, fbrHasNumber, type FbrPrintData } from "./fbrPrint";
import { makeFbrQr } from "./fbrQr";
import type { BusinessProfile, Invoice, InvoiceItem, Payment } from "./types";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 42; // page margin

// Helvetica / Helvetica-Bold character widths (per 1000 units) for ASCII 32..126
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

/** Keeps only characters the standard fonts can draw. */
function clean(text: string): string {
  return text
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7e]/g, "?");
}

function width(text: string, size: number, bold: boolean): number {
  const table = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of text) w += table[ch.charCodeAt(0) - 32] ?? 556;
  return (w * size) / 1000;
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text: string, maxWidth: number, size: number, bold: boolean): string[] {
  const words = clean(text).split(" ").filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (width(test, size, bold) <= maxWidth || !line) {
      line = test;
    } else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

class Page {
  ops: string[] = [];
  text(x: number, y: number, s: string, size = 10, bold = false, align: "left" | "right" | "center" = "left") {
    const t = clean(s);
    const w = width(t, size, bold);
    const px = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${px.toFixed(2)} ${(PAGE_H - y).toFixed(2)} Td (${escapePdf(t)}) Tj ET`);
  }
  line(x1: number, y1: number, x2: number, y2: number, gray = 0.75, lw = 0.6) {
    this.ops.push(`${gray} G ${lw} w ${x1.toFixed(2)} ${(PAGE_H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_H - y2).toFixed(2)} l S 0 G`);
  }
  rect(x: number, y: number, w: number, h: number, gray: number) {
    this.ops.push(`${gray} g ${x.toFixed(2)} ${(PAGE_H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  }
  /** The FBR QR code, drawn as black squares (no image library needed), size x size points, top-left at x,y. */
  qr(x: number, y: number, size: number, value: string) {
    const modules = makeFbrQr(value);
    if (!modules) return false;
    const n = modules.length;
    const s = size / n;
    this.rect(x, y, size, size, 1); // white quiet-zone background
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (modules[r][c]) this.rect(x + c * s, y + r * s, s, s, 0);
    return true;
  }
}

function assemble(pages: Page[]): Uint8Array {
  const objects: string[] = [];
  // 1 catalog, 2 pages, 3 F1, 4 F2, then per page: content, page
  const pageObjNums = pages.map((_, i) => 5 + i * 2 + 1);
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  pages.forEach((p, i) => {
    const content = p.ops.join("\n");
    const cNum = 5 + i * 2;
    objects[cNum] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    objects[cNum + 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cNum} 0 R >>`;
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objects.length; n++) out += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  // Every character is ASCII, so one byte per character.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

export type PdfInput = {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
  seller: BusinessProfile;
  /** FBR particulars. null/undefined = not an FBR bill (PDF is built exactly as before). */
  fbr?: FbrPrintData | null;
};

/** Builds the bill as a PDF (A4). Every amount comes from the saved bill. */
export function buildInvoicePdf({ invoice: inv, items, payments, seller, fbr }: PdfInput): Uint8Array {
  const isFbr = !!fbr;
  const hasNumber = isFbr && fbrHasNumber(fbr!);
  const calc = fbr ? computeFbrPrint(inv.total_value, items, fbr.lines) : null;
  const cancelled = inv.status === "Cancelled";
  const pages: Page[] = [];
  let pg = new Page();
  pages.push(pg);
  const right = PAGE_W - M;
  let y = M;

  // Header
  pg.text(M, y + 14, seller.business_name, 18, true);
  let hy = y + 28;
  const sellerLines = [
    seller.address,
    [seller.phone, seller.ntn ? `NTN ${seller.ntn}` : null].filter(Boolean).join("   "),
  ].filter(Boolean) as string[];
  for (const l of sellerLines) {
    pg.text(M, hy, l, 9);
    hy += 12;
  }
  pg.text(right, y + 14, isFbr ? "Sales Tax Invoice" : "Sale Invoice", 18, true, "right");
  pg.text(right, y + 30, inv.invoice_number, 11, true, "right");
  pg.text(right, y + 43, formatDay(inv.invoice_date), 10, false, "right");
  y = Math.max(hy, y + 52) + 8;
  pg.line(M, y, right, y, 0.4, 1);
  y += 18;

  if (fbr?.environment === "sandbox") {
    pg.text((M + right) / 2, y, "TEST INVOICE (FBR sandbox). Not a real FBR invoice.", 10, true, "center");
    y += 16;
  }

  // Buyer
  pg.text(M, y, "BILLED TO", 8, true);
  y += 14;
  pg.text(M, y, inv.buyer_name, 12, true);
  y += 14;
  const buyerLines = [
    inv.buyer_phone,
    inv.buyer_address,
    inv.buyer_cnic_or_ntn
      ? `${inv.buyer_cnic_or_ntn.length === 13 ? "CNIC" : "NTN"} ${inv.buyer_cnic_or_ntn}`
      : null,
    inv.note ? `Note: ${inv.note}` : null,
  ].filter(Boolean) as string[];
  for (const l of buyerLines) {
    for (const part of wrap(l, right - M, 10, false)) {
      pg.text(M, y, part, 10);
      y += 12.5;
    }
  }
  y += 10;

  // Table
  const cSr = M + 2;
  const cDesc = M + 26;
  const cGst = right - 60;
  const cTax = right - 132;
  const cQty = calc ? right - 296 : right - 190;
  const cRate = calc ? right - 200 : right - 105;
  const cAmt = right - 4;
  const descW = (calc ? cQty - 14 : cQty - 14) - cDesc;

  function tableHead() {
    pg.rect(M, y - 11, right - M, 20, 0.93);
    pg.text(cSr, y + 3, "#", 9, true);
    pg.text(cDesc, y + 3, "Item", 9, true);
    pg.text(cQty, y + 3, "Qty", 9, true, "right");
    pg.text(cRate, y + 3, "Rate", 9, true, "right");
    if (calc) {
      pg.text(cTax, y + 3, "GST", 9, true, "right");
      pg.text(cGst, y + 3, "GST %", 9, true, "right");
    }
    pg.text(cAmt, y + 3, "Amount", 9, true, "right");
    y += 22;
  }
  tableHead();

  items.forEach((it, i) => {
    const desc = wrap(it.description, descW, 10, false);
    const rowH = Math.max(1, desc.length) * 12.5 + 10;
    if (y + rowH > PAGE_H - 200) {
      pg = new Page();
      pages.push(pg);
      y = M + 12;
      tableHead();
    }
    const r = calc?.rows[i];
    pg.text(cSr, y + 2, String(i + 1), 10);
    desc.forEach((d, k) => pg.text(cDesc, y + 2 + k * 12.5, d, 10));
    pg.text(cQty, y + 2, String(it.quantity), 10, false, "right");
    pg.text(cRate, y + 2, formatRs(it.rate).replace(/^Rs\s/, ""), 10, false, "right");
    if (r) {
      pg.text(cTax, y + 2, r.known ? formatRs(r.taxAmount).replace(/^Rs\s/, "") : "-", 10, false, "right");
      pg.text(cGst, y + 2, r.known ? r.rateDesc || "-" : "-", 10, false, "right");
    }
    pg.text(cAmt, y + 2, formatRs(r ? r.payable : it.total).replace(/^Rs\s/, ""), 10, true, "right");
    y += rowH;
    pg.line(M, y - 7, right, y - 7, 0.88, 0.5);
  });

  if (y > PAGE_H - 190) {
    pg = new Page();
    pages.push(pg);
    y = M + 12;
  }

  // Totals
  y += 10;
  const lx = right - 190;
  if (calc && calc.taxAdded > 0) {
    pg.text(lx, y, "Items total", 10);
    pg.text(right, y, formatRs(calc.subtotal), 10, false, "right");
    y += 13;
    pg.text(lx, y, "GST added", 10);
    pg.text(right, y, formatRs(calc.taxAdded), 10, false, "right");
    y += 15;
  }
  pg.text(lx, y, "Total", 12, true);
  pg.text(right, y, formatRs(inv.total_value), 14, true, "right");
  y += 18;
  if (calc && calc.taxIncluded > 0) {
    for (const l of wrap(`* Sales tax of ${formatRs(calc.taxIncluded)} is already included in the price of the marked items.`, right - lx + 190, 8, false)) {
      pg.text(lx, y, l, 8);
      y += 11;
    }
    y += 3;
  }
  pg.text(lx, y, "Paid", 10);
  pg.text(right, y, formatRs(inv.paid_total), 10, false, "right");
  y += 14;
  if (inv.due_total > 0) {
    pg.rect(lx - 6, y - 11, right - lx + 10, 20, 0.93);
    pg.text(lx, y + 3, "Balance due", 11, true);
    pg.text(right, y + 3, formatRs(inv.due_total), 11, true, "right");
    y += 26;
  } else {
    pg.text(lx, y, "Paid in full", 10, true);
    y += 20;
  }

  // Payments received
  if (payments.length > 0) {
    y += 6;
    pg.text(M, y, "PAYMENTS RECEIVED", 8, true);
    y += 13;
    for (const p of payments) {
      pg.text(M, y, `${formatDay(p.paid_at.slice(0, 10))}, ${formatTime(p.paid_at)}   ${methodLabel(p.method)}`, 9);
      pg.text(M + 260, y, formatRs(p.amount), 9, false, "right");
      y += 12.5;
    }
  }

  // FBR block: number and QR (Version 2, 1 x 1 inch = 72 x 72 points)
  if (isFbr) {
    if (y + 90 > PAGE_H - 90) {
      pg = new Page();
      pages.push(pg);
      y = M + 12;
    }
    y += 8;
    pg.line(M, y, right, y, 0.85, 0.5);
    y += 16;
    if (hasNumber) {
      const drew = pg.qr(M, y, 72, fbr!.number!);
      const tx = M + (drew ? 72 + 16 : 0);
      pg.text(tx, y + 12, "FBR INVOICE NUMBER", 8, true);
      pg.text(tx, y + 27, fbr!.number!, 12, true);
      if (fbr!.submittedAt) {
        pg.text(tx, y + 41, `Reported to FBR: ${formatDay(fbr!.submittedAt.slice(0, 10))}, ${formatTime(fbr!.submittedAt)}`, 8);
      }
      pg.text(tx, y + 55, "Verify this invoice with the FBR Tax Asaan mobile app.", 8);
      y += 82;
    } else {
      pg.text(
        M,
        y + 10,
        cancelled ? "This bill is cancelled and was not sent to FBR." : "FBR invoice number: not received yet.",
        10,
        true,
      );
      y += 26;
    }
  }

  // Footer on every page
  pages.forEach((p, i) => {
    p.line(M, PAGE_H - 52, right, PAGE_H - 52, 0.85, 0.5);
    p.text(M, PAGE_H - 38, "Thank you for your business.", 9);
    p.text(right, PAGE_H - 38, `Page ${i + 1} of ${pages.length}`, 9, false, "right");
  });

  return assemble(pages);
}

/** Builds the PDF and wraps it in a File, ready to download or share. */
export function invoicePdfFile(input: PdfInput): File {
  const bytes = buildInvoicePdf(input);
  return new File([bytes as BlobPart], `${input.invoice.invoice_number}.pdf`, { type: "application/pdf" });
}
