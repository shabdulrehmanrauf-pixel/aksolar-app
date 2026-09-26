import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem, SupplierBalance } from "@/lib/types";
import NewPurchase, { type PurchaseStockItem } from "./NewPurchase";

export const metadata: Metadata = { title: "Receive stock" };

const STOCK_COLUMNS =
  "id,category,brand,model,type,voltage,plates,ah_rating,wattage,cost_price,quantity";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; item?: string }>;
}) {
  const { supplier, item } = await searchParams;
  const supabase = await createClient();
  const [stock, suppliers] = await Promise.all([
    supabase.from("inventory").select(STOCK_COLUMNS).order("brand"),
    supabase.from("supplier_balances").select("*").eq("is_active", true).order("name"),
  ]);

  return (
    <NewPurchase
      stock={(stock.data ?? []) as PurchaseStockItem[]}
      suppliers={(suppliers.data ?? []) as SupplierBalance[]}
      initialSupplierId={supplier ?? null}
      initialItemId={item ?? null}
    />
  );
}
