"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icons";
import { MORE_ITEM, NAV_ITEMS, type NavItem } from "./nav";

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export default function NavLinks({ variant }: { variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();

  if (variant === "sidebar") {
    return (
      <nav aria-label="Main" className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`on-dark group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium transition-colors ${
                active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <span aria-hidden="true" className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-sun" />
              )}
              <Icon
                name={item.icon}
                className={`h-5 w-5 transition-colors ${active ? "text-sun" : "text-white/55 group-hover:text-white"}`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  const items = [...NAV_ITEMS.filter((i) => !i.desktopOnly), MORE_ITEM];
  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-white/92 backdrop-blur-md lg:hidden"
    >
      <ul
        className="mx-auto grid h-16 max-w-md"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex h-full flex-col items-center justify-center gap-0.5"
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ${
                    active ? "bg-sun/30 text-casing" : "text-lead"
                  }`}
                >
                  <Icon name={item.icon} className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span className={`text-[11px] leading-none ${active ? "font-semibold text-casing" : "text-lead"}`}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
