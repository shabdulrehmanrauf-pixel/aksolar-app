import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { todayKarachi } from "@/lib/invoices";
import type { CashOverview } from "@/lib/cash";
import AccountsClient from "./AccountsClient";

export const metadata: Metadata = { title: "Cash accounts" };

export default async function CashAccountsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_accounts_overview", { p_day: todayKarachi() });
  if (error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Accounts could not be loaded</h1>
        <p className="mt-3 text-lead">
          Run <code className="rounded bg-plate px-1.5 py-0.5 text-casing">20_cash_ledger.sql</code> in Supabase (SQL Editor), or check that you are signed in as the Owner.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {error.message}</p>
      </div>
    );
  }
  return <AccountsClient overview={data as CashOverview} today={todayKarachi()} />;
}
