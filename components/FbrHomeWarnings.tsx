import Link from "next/link";
import Icon from "@/components/Icons";
import { SENDER_OFFLINE_AFTER_MINUTES, hasFbrWarning, type FbrHomeWarnings } from "@/lib/fbrHome";

function BillList({
  rows,
  count,
}: {
  rows: { id: string; invoiceNumber: string; buyerName: string }[];
  count: number;
}) {
  return (
    <ul className="mt-1.5 space-y-0.5 text-[13px]">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/sales/${r.id}`} className="underline decoration-current/40 underline-offset-2 hover:decoration-current">
            {r.invoiceNumber}
          </Link>{" "}
          - {r.buyerName}
        </li>
      ))}
      {count > rows.length && <li className="opacity-80">+ {count - rows.length} more</li>}
    </ul>
  );
}

/** One warning strip. Shown only when there is something to say (D5d). */
export default function FbrHomeWarnings({ w }: { w: FbrHomeWarnings }) {
  if (!hasFbrWarning(w)) return null;

  return (
    <section aria-label="FBR warnings" className="space-y-2.5">
      {w.senderOffline && (
        <div className="flex items-start gap-3 rounded-2xl border border-terminal/20 bg-terminal/10 px-4 py-3.5 text-terminal-deep">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-[15px] font-medium">
            The FBR sender on the shop PC has not been seen for over {SENDER_OFFLINE_AFTER_MINUTES} minutes
            {w.senderLastSeen ? "" : " (never)"}. New FBR bills will wait until it is running again.
          </p>
        </div>
      )}

      {w.failedCount > 0 && (
        <div className="rounded-2xl border border-terminal/20 bg-terminal/10 px-4 py-3.5 text-terminal-deep">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[15px] font-medium">
              {w.failedCount} {w.failedCount === 1 ? "bill" : "bills"} {w.failedCount === 1 ? "was" : "were"} refused by FBR.
              Open each bill to see FBR's reason and the retry command.
            </p>
          </div>
          <BillList rows={w.failedSample} count={w.failedCount} />
        </div>
      )}

      {w.unknownCount > 0 && (
        <div className="rounded-2xl border border-sun/40 bg-sun/20 px-4 py-3.5 text-amber-900">
          <div className="flex items-start gap-3">
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[15px] font-medium">
              {w.unknownCount} {w.unknownCount === 1 ? "bill has" : "bills have"} no clear answer from FBR. Check the FBR portal
              before retrying.
            </p>
          </div>
          <BillList rows={w.unknownSample} count={w.unknownCount} />
        </div>
      )}

    </section>
  );
}
