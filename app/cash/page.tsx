import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { todayKarachi } from "@/lib/invoices";
import type { CashBook, CashOverview } from "@/lib/cash";
import CashBookClient from "./CashBookClient";

export const metadata: Metadata = { title: "Cash book" };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; account?: string }>;
}) {
  const { date, account } = await searchParams;
  const today = todayKarachi();
  const day = date && YMD.test(date) && date <= today ? date : today;
  const accountId = account && /^[0-9a-f-]{36}$/i.test(account) ? account : null;

  const supabase = await createClient();
  const [bookRes, overviewRes] = await Promise.all([
    supabase.rpc("cash_book", { p_from: day, p_to: day, p_account_id: accountId }),
    supabase.rpc("cash_accounts_overview", { p_day: day }),
  ]);

  if (bookRes.error || overviewRes.error) {
    const err = bookRes.error ?? overviewRes.error;
    const missing = err?.code === "42883" || err?.code === "PGRST202" || err?.code === "42P01";
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Cash book could not be loaded</h1>
        {missing ? (
          <p className="mt-3 text-lead">
            Open Supabase, go to SQL Editor, and run{" "}
            <code className="rounded bg-plate px-1.5 py-0.5 text-casing">20_cash_ledger.sql</code>.
          </p>
        ) : (
          <p className="mt-3 text-lead">Only the Owner can open the cash book.</p>
        )}
        <p className="mt-3 text-sm text-lead">Details: {err?.message}</p>
      </div>
    );
  }

  return (
    <CashBookClient
      day={day}
      today={today}
      accountId={accountId}
      book={bookRes.data as CashBook}
      overview={overviewRes.data as CashOverview}
    />
  );
}
