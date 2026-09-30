import { getBrowserClient } from "@/lib/supabase/lazy";
import { offlineDb } from "@/lib/offline/db";

/**
 * Deletes a customer AND all their bills (payments, udhaar, items back in stock).
 * A customer with a bill that was reported to FBR is never deleted -- the database refuses.
 * Needs 21_delete_customer.sql to have been run in Supabase.
 */
export async function deleteCustomerWithBills(customerId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await getBrowserClient();
    const { error } = await supabase.rpc("delete_customer_and_bills", { p_customer_id: customerId, p_restock: true });
    if (error) {
      if (error.code === "42883" || error.code === "PGRST202") {
        return { error: "The delete setup is missing. Run 21_delete_customer.sql in Supabase, then try again." };
      }
      if (error.code === "23503") {
        return { error: "This customer still has records linked to it, so it cannot be deleted. " + error.message };
      }
      return { error: error.message };
    }
  } catch {
    return { error: "The connection dropped. Refresh the page to see if the customer was deleted." };
  }

  // Clean this phone's offline copy so the deleted bills do not come back in Sales / Udhaar.
  try {
    const bills = await offlineDb.invoices.filter((i) => i.customer_id === customerId).toArray();
    const ids = bills.map((b) => b.id);
    if (ids.length > 0) {
      const items = await offlineDb.invoice_items.filter((it) => ids.includes(it.invoice_id)).toArray();
      await offlineDb.invoice_items.bulkDelete(items.map((it) => it.id));
      await offlineDb.invoices.bulkDelete(ids);
    }
    await offlineDb.customers.delete(customerId);
  } catch {
    /* the cache is only a copy; ignore */
  }
  return { error: null };
}
