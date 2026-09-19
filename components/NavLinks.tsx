"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Add new sections here as later phases are built (Customers, Invoices, ...).
const LINKS = [{ href: "/inventory", label: "Inventory" }];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex self-stretch">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`on-dark flex items-center border-b-[3px] px-3 text-[15px] font-medium ${
              active
                ? "border-sun text-white"
                : "border-transparent text-white/70 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
