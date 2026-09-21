import type { IconName } from "./Icons";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Home must match "/" exactly, otherwise it would look active on every page. */
  exact?: boolean;
};

/*
  ADD NEW SECTIONS HERE. Only list screens that exist (no tabs that lead nowhere).
  Phone: these appear in the bottom bar (max 4, plus More = 5).
  Desktop: these appear in the sidebar.
  Later: add { href: "/sales", label: "Sales", icon: ... } after Phase 3 (invoicing).
*/
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home", exact: true },
  { href: "/inventory", label: "Inventory", icon: "battery" },
  { href: "/customers", label: "Customers", icon: "users" },
];

export const MORE_ITEM: NavItem = { href: "/more", label: "More", icon: "more" };
