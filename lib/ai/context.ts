/**
 * Builds a small, real, read-only snapshot of the shop's numbers for the AI
 * to ground its answers in — the same `money_summary` RPC and `inventory`/
 * `customers` tables the Home screen already uses, so the numbers always
 * match what the owner sees on screen, and RLS still applies (this runs with
 * the signed-in user's session, never the service-role key).
 *
 * Deliberately narrow for Part 1: aggregate counts and totals only, never a
 * full dump of customers or invoices. That keeps every request small (matters
 * on Groq's free tier) and keeps customer data from being sent to the AI
 * provider unless the conversation actually needs it.
 */
import { createClient } from "@/lib/supabase/server";
import { todayKarachi } from "@/lib/invoices";
import { formatRs } from "@/lib/format";
import { isLow, isOut } from "@/lib/inventory";

type MoneySummary = {
  sales_total: number;
  sales_count: number;
  cash_received: number;
  udhaar_total: number;
  udhaar_count: number;
};

export async function getShopSnapshot(): Promise<string> {
  const supabase = await createClient();
  const today = todayKarachi();

  const [money, stock, customers] = await Promise.all([
    supabase.rpc("money_summary", { p_day: today }),
    supabase.from("inventory").select("quantity,reorder_level"),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ]);

  const lines: string[] = [`Today's date: ${today}`];

  const summary = (money.data ?? null) as MoneySummary | null;
  if (!money.error && summary) {
    lines.push(
      `Sales today: ${formatRs(summary.sales_total)} across ${summary.sales_count} bill(s).`,
      `Cash received today: ${formatRs(summary.cash_received)}.`,
      `Total udhaar owed by customers right now (all bills, not just today): ${formatRs(summary.udhaar_total)} across ${summary.udhaar_count} bill(s).`
    );
  }

  const items = stock.data ?? [];
  if (!stock.error && items.length) {
    const low = items.filter((i) => isLow(i)).length;
    const out = items.filter((i) => isOut(i)).length;
    lines.push(`Inventory: ${items.length} item(s) in the system, ${low} at or below reorder level (${out} of those fully out of stock).`);
  }

  if (!customers.error && typeof customers.count === "number") {
    lines.push(`Customers on file: ${customers.count}.`);
  }

  return lines.join("\n");
}
