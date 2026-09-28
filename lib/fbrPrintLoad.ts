import { createClient } from "@/lib/supabase/server";
import {
  FBR_PRINT_HEADER_COLUMNS,
  FBR_PRINT_LINE_COLUMNS,
  fbrPrintHeaderFromRow,
  fbrPrintLineFromRow,
  type FbrPrintData,
  type FbrPrintLine,
} from "@/lib/fbrPrint";

/**
 * FBR particulars for the printed bill. Server only.
 * Returns null when the bill is not an FBR bill, or when the FBR tables cannot be read,
 * so printing keeps working exactly as before.
 */
export async function loadFbrPrint(invoiceId: string): Promise<FbrPrintData | null> {
  try {
    const supabase = await createClient();
    const head = await supabase
      .from("fbr_invoices")
      .select(FBR_PRINT_HEADER_COLUMNS)
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (head.error || !head.data) return null;
    const header = fbrPrintHeaderFromRow(head.data);
    if (!header) return null;

    let lines: FbrPrintLine[] = [];
    const res = await supabase.from("fbr_invoice_items").select(FBR_PRINT_LINE_COLUMNS).eq("invoice_id", invoiceId);
    if (!res.error && res.data) {
      lines = res.data.map(fbrPrintLineFromRow).filter((l): l is FbrPrintLine => l !== null);
    }
    return { ...header, lines };
  } catch {
    return null;
  }
}
