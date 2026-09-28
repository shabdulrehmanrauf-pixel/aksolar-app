import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadInvoiceDocument } from "@/lib/invoiceDoc";
import { loadFbrStatus } from "@/lib/fbrStatusLoad";
import { createClient } from "@/lib/supabase/server";
import InvoiceDetail from "./InvoiceDetail";

export const metadata: Metadata = { title: "Bill" };

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Karachi",
});

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await loadInvoiceDocument(id);
  if (!doc) notFound();
  const fbr = await loadFbrStatus(doc.invoice.id);

  // Who made this bill, and who received each payment. If the Part 1 SQL has not been run yet,
  // the lookup simply fails and this small section is left out.
  const inv = doc.invoice as typeof doc.invoice & { created_by?: string | null };
  const pays = doc.payments as (typeof doc.payments[number] & { received_by?: string | null })[];
  const ids = [...new Set([inv.created_by, ...pays.map((p) => p.received_by)].filter((x): x is string => !!x))];
  let names: Record<string, string> = {};
  if (ids.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("user_display_names", { p_ids: ids });
    if (data && typeof data === "object") names = data as Record<string, string>;
  }
  const madeBy = inv.created_by ? names[inv.created_by] : undefined;

  return (
    <>
      <InvoiceDetail doc={doc} fbr={fbr} />
      {(madeBy || pays.some((p) => p.received_by && names[p.received_by])) && (
        <section className="card mt-4 p-5">
          <h2 className="font-display text-2xl font-semibold">Who did this</h2>
          <ul className="mt-2 space-y-1 text-[15px]">
            {madeBy && (
              <li>
                Bill made by <b>{madeBy}</b>, {when.format(new Date(inv.created_at))}
              </li>
            )}
            {pays.map((p) =>
              p.received_by && names[p.received_by] ? (
                <li key={p.id}>
                  Rs {Number(p.amount).toLocaleString("en-PK")} received by <b>{names[p.received_by]}</b>,{" "}
                  {when.format(new Date(p.paid_at))}
                </li>
              ) : null
            )}
          </ul>
          <p className="mt-2 text-sm text-lead">The Owner can see every change in Activity log.</p>
        </section>
      )}
    </>
  );
}
