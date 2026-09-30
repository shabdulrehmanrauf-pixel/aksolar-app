/**
 * Who can do what. ONE place, used by the menus, the More page, and (in Part 2) the screens.
 * To change what a role may do, change ROLES_FOR_PAGE / ROLES_FOR below. The database rules
 * (Part 2 SQL) must match; ask before changing them.
 */

export type Role = "owner" | "counter_staff" | "accountant";

export const ROLES: Role[] = ["owner", "counter_staff", "accountant"];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  counter_staff: "Counter staff",
  accountant: "Accountant",
};

export const ROLE_HINT: Record<Role, string> = {
  owner: "Everything, including the team and the activity log.",
  counter_staff:
    "Makes bills, takes payments, adds customers, does battery services and scrap intake. Cannot change prices, edit stock, delete, or see reports.",
  accountant:
    "Sees reports and money screens, records expenses and supplier payments. Cannot make bills or change stock.",
};

/**
 * ok        = signed in, has a role, account is on
 * no_role   = signed in but the Owner has not given this login a role yet
 * inactive  = the Owner turned this account off
 * legacy    = the Part 1 SQL has not been run yet: behave exactly like before (show everything)
 */
export type RoleStatus = "ok" | "no_role" | "inactive" | "legacy";

export type RoleInfo = { status: RoleStatus; role: Role | null; fullName: string };

export const LEGACY_ROLE_INFO: RoleInfo = { status: "legacy", role: null, fullName: "" };

/** Reads what the database function my_role_info() returned. */
export function parseRoleInfo(data: unknown): RoleInfo {
  if (!data || typeof data !== "object") return LEGACY_ROLE_INFO;
  const d = data as { role?: string | null; full_name?: string | null; is_active?: boolean };
  const role = (ROLES as string[]).includes(d.role ?? "") ? (d.role as Role) : null;
  const fullName = (d.full_name ?? "").trim();
  if (!role) return { status: "no_role", role: null, fullName };
  if (!d.is_active) return { status: "inactive", role, fullName };
  return { status: "ok", role, fullName };
}

/** The role to use for showing/hiding things. Legacy (SQL not run yet) shows everything. */
export function effectiveRole(info: RoleInfo): Role | null {
  if (info.status === "legacy") return "owner";
  return info.status === "ok" ? info.role : null;
}

/* ------------------------------------------------------------------ pages */

// Any page not listed here (Home, Inventory, Customers, Sales, More, print slips) is open to every role.
const ROLES_FOR_PAGE: { prefix: string; roles: Role[] }[] = [
  { prefix: "/team", roles: ["owner"] },
  { prefix: "/fbr", roles: ["owner"] },
  { prefix: "/sales/new", roles: ["owner", "counter_staff"] },
  { prefix: "/purchases/new", roles: ["owner"] },
  { prefix: "/activity", roles: ["owner"] },
  { prefix: "/reports", roles: ["owner", "accountant"] },
  { prefix: "/purchases", roles: ["owner", "accountant"] },
  { prefix: "/suppliers", roles: ["owner", "accountant"] },
  { prefix: "/payments", roles: ["owner", "accountant"] },
  { prefix: "/expenses", roles: ["owner", "accountant"] },
  { prefix: "/battery-services", roles: ["owner", "counter_staff"] },
  { prefix: "/scrap", roles: ["owner", "counter_staff"] },
  { prefix: "/assistant", roles: ["owner", "counter_staff"] },
];

export function canOpen(info: RoleInfo, pathname: string): boolean {
  const role = effectiveRole(info);
  if (!role) return false;
  const rule = ROLES_FOR_PAGE.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return rule ? rule.roles.includes(role) : true;
}

/* ------------------------------------------------------------------ actions (used by Part 2) */

export type Capability =
  | "sales.create"
  | "sales.delete"
  | "payment.receive"
  | "price.override"
  | "inventory.edit"
  | "customers.edit"
  | "customers.delete"
  | "purchases.manage"
  | "suppliers.manage"
  | "supplierPayments.manage"
  | "expenses.manage"
  | "cash.opening"
  | "battery.manage"
  | "scrap.sell"
  | "cost.view"
  | "reports.view"
  | "team.manage"
  | "activity.view"
  | "udhaar.add";

const ROLES_FOR: Record<Capability, Role[]> = {
  "sales.create": ["owner", "counter_staff"],
  "sales.delete": ["owner"],
  "payment.receive": ["owner", "counter_staff"],
  "price.override": ["owner"],
  "inventory.edit": ["owner"],
  "customers.edit": ["owner", "counter_staff"],
  "customers.delete": ["owner"],
  "purchases.manage": ["owner"],
  "suppliers.manage": ["owner"],
  "supplierPayments.manage": ["owner", "accountant"],
  "expenses.manage": ["owner", "accountant"],
  "cash.opening": ["owner", "accountant"],
  "battery.manage": ["owner", "counter_staff"],
  "scrap.sell": ["owner"],
  "cost.view": ["owner", "accountant"],
  "reports.view": ["owner", "accountant"],
  "team.manage": ["owner"],
  "activity.view": ["owner"],
  "udhaar.add": ["owner"],
};

export function can(info: RoleInfo, capability: Capability): boolean {
  const role = effectiveRole(info);
  return !!role && ROLES_FOR[capability].includes(role);
}
