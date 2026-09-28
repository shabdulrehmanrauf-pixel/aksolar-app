"use client";

import Link from "next/link";
import { openCommand } from "@/lib/command";
import Avatar from "./Avatar";
import Icon from "./Icons";
import LogoMark from "./LogoMark";
import { useRoleInfo } from "./RoleProvider";
import SyncStatusBadge from "./SyncStatusBadge";
import { can } from "@/lib/roles";

export default function TopBar({ email }: { email: string }) {
  const roleInfo = useRoleInfo();
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-plate/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 lg:h-16 lg:px-8">
        {/* Phone and tablet: logo */}
        <Link href="/" className="flex items-center gap-2.5 lg:hidden" aria-label="AK Solar home">
          <LogoMark className="h-7 w-7" />
          <span className="font-display text-xl font-bold tracking-wide">AK Solar</span>
        </Link>

        {/* Desktop: search box */}
        <button
          type="button"
          onClick={() => openCommand()}
          className="hidden h-11 w-full max-w-lg items-center gap-3 rounded-xl border border-line bg-white px-4 text-left text-lead shadow-sm transition-colors hover:border-lead/40 lg:flex"
        >
          <Icon name="search" className="h-5 w-5" />
          <span className="flex-1">Search stock, customers or bills</span>
          <kbd className="rounded-md border border-line bg-plate px-1.5 py-0.5 text-xs font-medium text-lead">Ctrl K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <SyncStatusBadge />
          {/* Desktop: quick add */}
          {can(roleInfo, "inventory.edit") && (
<Link href="/inventory?add=1" className="btn btn-quiet btn-sm hidden lg:inline-flex">
            <Icon name="plus" className="h-4 w-4" /> Item
          </Link>
)}
          {can(roleInfo, "customers.edit") && (
<Link href="/customers?add=1" className="btn btn-quiet btn-sm hidden lg:inline-flex">
            <Icon name="plus" className="h-4 w-4" /> Customer
          </Link>
)}
          {can(roleInfo, "sales.create") && (
<Link href="/sales/new" className="btn btn-primary btn-sm hidden lg:inline-flex">
            <Icon name="receipt" className="h-4 w-4" /> New bill
          </Link>
)}

          {/* Phone: search and account */}
          <button
            type="button"
            onClick={() => openCommand()}
            aria-label="Search stock, customers or bills"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-casing shadow-sm ring-1 ring-line/70 lg:hidden"
          >
            <Icon name="search" className="h-5 w-5" />
          </button>
          <Link href="/more" aria-label="Account and more" className="lg:hidden">
            <Avatar name={email} size="sm" />
          </Link>
        </div>
      </div>
    </header>
  );
}
