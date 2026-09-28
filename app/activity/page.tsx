import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { loadRoleInfo } from "@/lib/rolesServer";
import ActivityClient, { type Person } from "./ActivityClient";

export const metadata: Metadata = { title: "Activity log" };

export default async function ActivityPage() {
  const info = await loadRoleInfo();
  if (!can(info, "activity.view")) redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_list");

  if (error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Activity log could not be loaded</h1>
        <p className="mt-3 text-lead">
          Open Supabase, go to SQL Editor, and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">16_roles_and_audit.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {error.message}</p>
      </div>
    );
  }

  const people: Person[] = ((data ?? []) as { user_id: string; full_name: string; email: string | null }[]).map((m) => ({
    id: m.user_id,
    name: m.full_name || (m.email ?? "Unknown"),
  }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Activity log"
        subtitle="Every add, change and delete in the app: who did it, when, and what changed."
      />
      <ActivityClient people={people} />
    </div>
  );
}
