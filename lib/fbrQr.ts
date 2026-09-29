import qrcode from "qrcode-generator";

/**
 * The FBR QR code: Version 2 (25 x 25 squares), printed 1.0 x 1.0 inch (PRAL DI API v1.12, section 6).
 * It holds the FBR invoice number. Uses error correction M when the number fits, else L (a 28-character number).
 * Returns null if the number cannot fit in Version 2 (the caller then shows the number as text only).
 * Shared by the print page and the PDF, so both draw the same code.
 */
export function makeFbrQr(value: string): boolean[][] | null {
  const level = new TextEncoder().encode(value).length <= 26 ? "M" : "L";
  try {
    const q = qrcode(2, level);
    q.addData(value, "Byte");
    q.make();
    const n = q.getModuleCount();
    if (n !== 25) return null;
    const rows: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) row.push(q.isDark(r, c));
      rows.push(row);
    }
    return rows;
  } catch {
    return null;
  }
}
