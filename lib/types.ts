export type Category = "battery" | "panel" | "accessory";

export type InventoryItem = {
  id: string;
  category: Category;
  brand: string;
  model: string;
  type: string | null;
  voltage: number | null;
  plates: number | null;
  ah_rating: number | null;
  wattage: number | null;
  warranty_months: number | null;
  cost_price: number;
  sale_price: number;
  quantity: number;
  reorder_level: number;
  hs_code: string | null;
  uom: string;
  created_at: string;
  updated_at: string;
};
