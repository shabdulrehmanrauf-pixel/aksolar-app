"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/lazy";
import { addDays, todayKarachi } from "@/lib/invoices";
import { ROLE_LABEL, type Role } from "@/lib/roles";

export type Person = { id: string; name: string };

type LogRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  action: "create" | "update" | "delete";
  table_name: string;
  summary: string;
  changed_fields: string[] | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  is_detail: boolean;
};

const PAGE = 50;

const AREAS: { value: string; label: string; tables: string[] }[] = [
  { value: "", label: "Everything", tables: [] },
  { value: "bills", label: "Bills", tables: ["invoices", "invoice_items"] },
  { value: "payments", label: "Payments received", tables: ["payments"] },
  { value: "stock", label: "Stock", tables: ["inventory"] },
  { value: "customers", label: "Customers", tables: ["customers"] },
  { value: "purchases", label: "Purchases", tables: ["purchase_invoices", "purchase_items"] },
  { value: "supplier_pay", label: "Supplier payments", tables: ["supplier_payments"] },
  { value: "suppliers", label: "Suppliers", tables: ["distributors"] },
  { value: "expenses", label: "Expenses", tables: ["expenses"] },
  { value: "battery", label: "Battery services", tables: ["charging_jobs", "battery_claims", "charging_price_list"] },
  { value: "scrap", label: "Scrap", tables: ["scrap_battery_inventory", "scrap_battery_sales"] },
  { value: "settings", label: "Shop settings and cash", tables: ["business_profile", "cash_settings"] },
  { value: "team", label: "Team and roles", tables: ["user_roles"] },
];

const AREA_LABEL: Record<string, string> = {
  invoices: "Bill",
  invoice_items: "Bill line",
  payments: "Payment",
  inventory: "Stock",
  customers: "Customer",
  purchase_invoices: "Purchase",
  purchase_items: "Purchase line",
  supplier_payments: "Supplier payment",
  distributors: "Supplier",
  expenses: "Expense",
  charging_jobs: "Charging",
  battery_claims: "Claim",
  charging_price_list: "Charging price",
  scrap_battery_inventory: "Scrap",
  scrap_battery_sales: "Scrap sale",
  business_profile: "Shop details",
  cash_settings: "Cash",
  user_roles: "Team",
};

const WHEN: { value: string; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const ACTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any action" },
  { value: "create", label: "Added" },
  { value: "update", label: "Edited" },
  { value: "delete", label: "Deleted" },
];

const ACTION_STYLE: Record<LogRow["action"], { label: string; cls: string }> = {
  create: { label: "Added", cls: "bg-cell/10 text-cell-deep" },
  update: { label: "Edited", cls: "bg-sun/25 text-amber-800" },
  delete: { label: "Deleted", cls: "bg-terminal/10 text-terminal-deep" },
};

/** Start and end of a preset, as Pakistan-time instants (Pakistan has no daylight saving: always +05:00). */
function range(when: string): { from: string | null; to: string | null } {
  const today = todayKarachi();
  const at = (d: string) => `${d}T00:00:00+05:00`;
  if (when === "today") return { from: at(today), to: null };
  if (when === "yesterday") return { from: at(addDays(today, -1)), to: at(today) };
  if (when === "7") return { from: at(addDays(today, -6)), to: null };
  if (when === "30") return { from: at(addDays(today, -29)), to: null };
  return { from: null, to: null };
}

const fmtTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Karachi",
});

const MONEY_KEYS = new Set([
  "cost_price", "sale_price", "price", "total_value", "subtotal", "discount", "freight", "amount",
  "handover_amount", "claim_amount", "extra_charges", "opening_balance", "unit_cost", "line_total",
  "rate", "total_amount", "rate_per_kg",
]);

function showValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (MONEY_KEYS.has(key) && (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)))) {
    return "Rs " + Number(v).toLocaleString("en-PK", { maximumFractionDigits: 2 });
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

const HIDE_KEYS = new Set([
  "id", "created_at", "updated_at", "created_by", "received_by", "client_id", "invoice_id", "customer_id",
  "supplier_id", "purchase_id", "inventory_id", "category_id", "distributor_id", "original_invoice_id",
  "sold_in_sale_id",
]);

function detailLines(r: LogRow): { key: string; before?: string; after: string }[] {
  const pretty = (k: string) => k.replace(/_/g, " ");
  if (r.action === "update") {
    return (r.changed_fields ?? [])
      .filter((k) => !HIDE_KEYS.has(k))
      .map((k) => ({
        key: pretty(k),
        before: showValue(k, r.old_data?.[k]),
        after: showValue(k, r.new_data?.[k]),
      }));
  }
  const data = (r.action === "create" ? r.new_data : r.old_data) ?? {};
  return Object.entries(data)
    .filter(([k, v]) => !HIDE_KEYS.has(k) && v !== null && v !== "")
    .slice(0, 12)
    .map(([k, v]) => ({ key: pretty(k), after: showValue(k, v) }));
}

function Row({ r, open, onToggle }: { r: LogRow; open: boolean; onToggle: () => void }) {
  const a = ACTION_STYLE[r.action];
  const roleText = r.actor_role && r.actor_role in ROLE_LABEL ? ROLE_LABEL[r.actor_role as Role] : null;
  const lines = open ? detailLines(r) : [];
  return (
    <li className={`px-4 py-3.5 ${r.is_detail ? "bg-plate/50" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.cls}`}>{a.label}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-lead">{AREA_LABEL[r.table_name] ?? r.table_name}</span>
        {r.is_detail && <span className="text-xs text-lead">(automatic)</span>}
        <span className="ml-auto text-sm tabular-nums text-lead">{fmtTime.format(new Date(r.created_at))}</span>
      </div>
      <p className="mt-1.5 break-words text-[15px] font-medium">{r.summary}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-lead">
          By <b className="text-casing">{r.actor_name}</b>
          {roleText ? ` (${roleText})` : ""}
        </p>
        <button type="button" onClick={onToggle} className="text-sm font-medium text-focus hover:underline">
          {open ? "Hide details" : "Show details"}
        </button>
      </div>
      {open && (
        <dl className="mt-2 space-y-1 rounded-xl bg-plate/70 px-3 py-2 text-sm">
          {lines.length === 0 && <p className="text-lead">No more details.</p>}
          {lines.map((l) => (
            <div key={l.key} className="flex flex-wrap gap-x-2">
              <dt className="capitalize text-lead">{l.key}:</dt>
              <dd className="break-words">
                {l.before !== undefined ? (
                  <>
                    <span className="text-terminal-deep line-through">{l.before}</span> &rarr;{" "}
                    <span className="font-semibold text-cell-deep">{l.after}</span>
                  </>
                ) : (
                  l.after
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export default function ActivityClient({ people }: { people: Person[] }) {
  const [who, setWho] = useState("");
  const [area, setArea] = useState("");
  const [action, setAction] = useState("");
  const [when, setWhen] = useState("7");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [showAuto, setShowAuto] = useState(false);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const requestNo = useRef(0);

  // Wait until typing pauses before searching.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (offset: number) => {
      const mine = ++requestNo.current;
      setLoading(true);
      setError(null);
      try {
        const supabase = await getBrowserClient();
        let q = supabase
          .from("audit_log")
          .select("id,created_at,actor_id,actor_name,actor_role,action,table_name,summary,changed_fields,old_data,new_data,is_detail")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + PAGE); // one extra row tells us whether there is a next page

        if (!showAuto) q = q.eq("is_detail", false);
        if (who) q = q.eq("actor_id", who);
        if (action) q = q.eq("action", action);
        const tables = AREAS.find((a) => a.value === area)?.tables ?? [];
        if (tables.length > 0) q = q.in("table_name", tables);
        const { from, to } = range(when);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lt("created_at", to);
        if (query) q = q.ilike("summary", `%${query.replace(/[%_]/g, (c) => "\\" + c)}%`);

        const { data, error: dbError } = await q;
        if (mine !== requestNo.current) return; // a newer search replaced this one
        if (dbError) {
          setError(dbError.message);
          setLoading(false);
          return;
        }
        const got = (data ?? []) as LogRow[];
        setHasMore(got.length > PAGE);
        const page = got.slice(0, PAGE);
        setRows((prev) => (offset === 0 ? page : [...prev, ...page]));
      } catch {
        if (mine === requestNo.current) setError("The connection dropped. Check your internet and try again.");
      }
      if (mine === requestNo.current) setLoading(false);
    },
    [who, area, action, when, query, showAuto]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  return (
    <div className="mt-6">
      <section className="card anim-rise p-4" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Who</span>
            <select className="input w-full" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">What</span>
            <select className="input w-full" value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Action</span>
            <select className="input w-full" value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">When</span>
            <select className="input w-full" value={when} onChange={(e) => setWhen(e.target.value)}>
              {WHEN.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            className="input min-w-0 flex-1"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search, e.g. a bill number, customer or item"
            aria-label="Search the activity log"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} />
            Show automatic changes (stock counts after a sale, bill lines)
          </label>
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-terminal-deep">
          {error}
        </p>
      )}

      <section className="card anim-rise mt-4 overflow-hidden" style={{ "--i": 2 } as React.CSSProperties}>
        {rows.length === 0 && !loading && !error ? (
          <p className="p-6 text-center text-lead">Nothing matches. Try a longer time range or fewer filters.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map((r) => (
              <Row key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />
            ))}
          </ul>
        )}
        {loading && <p className="p-4 text-center text-lead">Loading…</p>}
        {hasMore && !loading && (
          <div className="border-t border-line/60 p-3 text-center">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void load(rows.length)}>
              Show older
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
