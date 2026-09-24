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
  Phone: these appear in the bottom bar (max 4, plus More = 5).
  Desktop: these appear in the sidebar.
*/
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home", exact: true },
  { href: "/inventory", label: "Inventory", icon: "battery" },
  { href: "/customers", label: "Customers", icon: "users" },
  { href: "/sales", label: "Sales", icon: "receipt" },
  { href: "/reports", label: "Reports", icon: "chart", desktopOnly: true },
  { href: "/battery-services", label: "Battery services", icon: "plug", desktopOnly: true },
  { href: "/scrap", label: "Scrap", icon: "box", desktopOnly: true },
  { href: "/assistant", label: "Assistant", icon: "sparkle", desktopOnly: true },
];

export const MORE_ITEM: NavItem = { href: "/more", label: "More", icon: "more" };
