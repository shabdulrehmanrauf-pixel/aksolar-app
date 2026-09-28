"use client";

import { useEffect } from "react";
import Link from "next/link";
import Icon, { type IconName } from "./Icons";
import { useRoleInfo } from "./RoleProvider";
import { can, canOpen } from "@/lib/roles";

type Action = {
  href: string;
  label: string;
  hint: string;
  icon: IconName;
  tone: string;
  /** Set for a button whose screen doesn't exist yet, shown greyed out so the full set of buttons
   * decision D7 asked for ("I need buttons") is visible now, with the rest arriving as each phase
   * lands instead of being hidden and forgotten. Make payment unlocked in F2, Add expense in F3. */
  soon?: boolean;
};

const ACTIONS: Action[] = [
  { href: "/sales/new", label: "New bill", hint: "Sell to a customer", icon: "receipt", tone: "bg-sun/25 text-amber-800" },
  { href: "/purchases/new", label: "Receive stock", hint: "Buy from a supplier", icon: "truck", tone: "bg-focus/10 text-focus" },
  { href: "/payments/new", label: "Make payment", hint: "Pay a supplier", icon: "banknote", tone: "bg-cell/10 text-cell" },
  { href: "/expenses?add=1", label: "Add expense", hint: "Log rent, salaries, fuel, etc.", icon: "minus", tone: "bg-terminal/10 text-terminal-deep" },
  { href: "/customers?add=1", label: "Add customer", hint: "Save a new customer", icon: "userplus", tone: "bg-focus/10 text-focus" },
];

/** The sheet opened by the phone bottom bar's center "+" (decision D7, Option B). Unlike the form
 * Sheet, tapping the dark backdrop closes this one -- it only launches other screens, nothing here
 * can be half-typed and lost. */
export default function QuickActionsSheet({ onClose }: { onClose: () => void }) {
  const roleInfo = useRoleInfo();
  const actions = ACTIONS.filter((a) =>
    a.href.startsWith("/customers") ? can(roleInfo, "customers.edit") : canOpen(roleInfo, a.href.split("?")[0])
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-casing/60 lg:hidden"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-actions-title"
        onClick={(e) => e.stopPropagation()}
        className="sheet-panel w-full rounded-t-3xl bg-white pb-safe shadow-2xl"
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 id="quick-actions-title" className="font-display text-2xl font-bold">
            Quick actions
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lead hover:bg-plate"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <ul className="space-y-2 px-4 pb-4">
          {actions.map((a) =>
            a.soon ? (
              <li key={a.href}>
                <div aria-disabled="true" className="flex items-center gap-3.5 rounded-2xl p-3.5 opacity-50">
                  <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${a.tone}`}>
                    <Icon name={a.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{a.label}</span>
                    <span className="block text-sm text-lead">{a.hint}</span>
                  </span>
                </div>
              </li>
            ) : (
              <li key={a.href}>
                <Link href={a.href} onClick={onClose} className="flex items-center gap-3.5 rounded-2xl p-3.5 transition-colors hover:bg-plate">
                  <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${a.tone}`}>
                    <Icon name={a.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{a.label}</span>
                    <span className="block text-sm text-lead">{a.hint}</span>
                  </span>
                  <Icon name="chevron" className="h-4 w-4 text-lead/60" />
                </Link>
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  );
}
