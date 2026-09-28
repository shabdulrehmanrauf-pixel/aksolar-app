"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { getBrowserClient } from "@/lib/supabase/lazy";
import { ROLES, ROLE_HINT, ROLE_LABEL, type Role } from "@/lib/roles";

export type TeamMember = {
  user_id: string;
  email: string | null;
  full_name: string;
  role: Role | null;
  is_active: boolean;
  has_role: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

function lastSeen(iso: string | null) {
  if (!iso) return "Has not signed in yet";
  return (
    "Last sign-in " +
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Karachi",
    }).format(new Date(iso))
  );
}

function MemberCard({ m, isMe, index }: { m: TeamMember; isMe: boolean; index: number }) {
  const router = useRouter();
  const [name, setName] = useState(m.full_name);
  const [role, setRole] = useState<Role | "">(m.role ?? "");
  const [active, setActive] = useState(m.has_role ? m.is_active : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed = !m.has_role || name.trim() !== m.full_name || role !== (m.role ?? "") || active !== m.is_active;
  const ready = name.trim() !== "" && role !== "";

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = await getBrowserClient();
      const { error: dbError } = await supabase.rpc("set_user_role", {
        p_user_id: m.user_id,
        p_role: role,
        p_full_name: name.trim(),
        p_is_active: active,
      });
      if (dbError) {
        setError(dbError.message);
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("The connection dropped. Check your internet and try again.");
    }
    setBusy(false);
  }

  return (
    <li
      className={`card anim-rise p-5 ${!m.has_role ? "border-sun" : ""}`}
      style={{ "--i": index + 1 } as React.CSSProperties}
    >
      <div className="flex items-start gap-3.5">
        <Avatar name={name || m.email || "?"} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" title={m.email ?? ""}>
            {m.email ?? "(no email)"}
            {isMe && <span className="ml-2 rounded-full bg-plate px-2 py-0.5 text-xs font-medium text-lead">You</span>}
          </p>
          <p className="text-sm text-lead">{lastSeen(m.last_sign_in_at)}</p>
          {!m.has_role && (
            <p className="mt-1 text-sm font-medium text-amber-800">Needs a name and a role before this person can use the app.</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Name (shown in the activity log)</span>
          <input
            className="input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ali Ahmed"
            maxLength={60}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Role</span>
          <select className="input w-full" value={role} onChange={(e) => setRole(e.target.value as Role | "")}>
            <option value="">Choose a role</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {role !== "" && <p className="mt-2 text-sm text-lead">{ROLE_HINT[role]}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className={`flex items-center gap-2 ${isMe ? "opacity-60" : ""}`}>
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={active}
            disabled={isMe}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span className="text-[15px]">{isMe ? "Account is on (you cannot turn off yourself)" : "Account is on"}</span>
        </label>
        <button type="button" onClick={save} disabled={!changed || !ready || busy} className="btn btn-primary btn-sm">
          {busy ? "Saving" : m.has_role ? "Save changes" : "Give access"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
          {error}
        </p>
      )}
      {saved && !error && !changed && <p className="mt-3 text-sm text-cell-deep">Saved.</p>}
    </li>
  );
}

export default function TeamClient({ members, myId }: { members: TeamMember[]; myId: string }) {
  return (
    <div className="mt-6">
      <section className="card anim-rise p-5" style={{ "--i": 0 } as React.CSSProperties}>
        <h2 className="font-display text-2xl font-semibold">Adding a new person</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px] text-lead">
          <li>
            Open Supabase, then <b className="text-casing">Authentication &rarr; Users &rarr; Add user</b>.
          </li>
          <li>Enter their email and a password, and switch on &ldquo;Auto Confirm User&rdquo;.</li>
          <li>Come back here and refresh. They appear below with a yellow border.</li>
          <li>Type their name, choose a role, and press &ldquo;Give access&rdquo;. Tell them their email and password.</li>
        </ol>
        <p className="mt-2 text-sm text-lead">Everybody signs in with their own login, so the activity log always shows who did what. Never share one login.</p>
      </section>

      <ul className="mt-4 space-y-3">
        {members.map((m, i) => (
          <MemberCard key={m.user_id} m={m} isMe={m.user_id === myId} index={i} />
        ))}
      </ul>
    </div>
  );
}
