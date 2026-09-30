import type { IconName } from "./Icons";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Home must match "/" exactly, otherwise it would look active on every page. */
  exact?: boolean;
  /** Shown in the desktop sidebar only. On phones it lives under More (the bottom bar holds 5 tabs at most). */
  desktopOnly?: boolean;
};

/*
  ADD NEW SECTIONS HERE. Only list screens that exist (no tabs that lead nowhere).
  Phone: the bottom bar is now a fixed layout (Home, Inventory, "+", Sales, More) per
  decision D7 -- see NavLinks.tsx. `desktopOnly` here just controls the SIDEBAR-vs-bottom-bar
  split; it no longer maps 1:1 onto "which 4 icons appear", since only Home/Inventory/Sales
  keep their own bottom-bar icon. Everything else (Customers included, moved off the bar by
  D7) is one tap away under More -- see app/more/page.tsx.
  Desktop: every item below appears in the sidebar, in this order, regardless of desktopOnly.
*/
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home", exact: true },
  { href: "/inventory", label: "Inventory", icon: "battery" },
  { href: "/customers", label: "Customers", icon: "users", desktopOnly: true },
  { href: "/sales", label: "Sales", icon: "receipt" },
  { href: "/udhaar", label: "Udhaar", icon: "alert", desktopOnly: true },
  { href: "/suppliers", label: "Suppliers", icon: "truck", desktopOnly: true },
  { href: "/purchases", label: "Purchases", icon: "cart", desktopOnly: true },
  { href: "/payments", label: "Payments", icon: "banknote", desktopOnly: true },
  { href: "/expenses", label: "Expenses", icon: "minus", desktopOnly: true },
  { href: "/reports", label: "Reports", icon: "chart", desktopOnly: true },
  { href: "/battery-services", label: "Battery services", icon: "plug", desktopOnly: true },
  { href: "/scrap", label: "Scrap", icon: "box", desktopOnly: true },
  { href: "/assistant", label: "Assistant", icon: "sparkle", desktopOnly: true },
  // Owner only (see lib/roles.ts). On a phone they are under More.
  { href: "/activity", label: "Activity log", icon: "shield", desktopOnly: true },
  { href: "/team", label: "Team", icon: "idcard", desktopOnly: true },
  { href: "/fbr", label: "FBR lists", icon: "shield", desktopOnly: true },
];

export const MORE_ITEM: NavItem = { href: "/more", label: "More", icon: "more" };
