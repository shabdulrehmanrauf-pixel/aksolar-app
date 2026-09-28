import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { loadRoleInfo } from "@/lib/rolesServer";
import TeamClient, { type TeamMember } from "./TeamClient";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const info = await loadRoleInfo();
  if (!can(info, "team.manage")) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("team_list");

  if (error) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">Team could not be loaded</h1>
        <p className="mt-3 text-lead">
          Open Supabase, go to SQL Editor, and run{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">16_roles_and_audit.sql</code>.
        </p>
        <p className="mt-3 text-sm text-lead">Details: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Team" subtitle="Everyone who can sign in to AK Solar, and what each person may do." />
      <TeamClient members={(data ?? []) as TeamMember[]} myId={user?.id ?? ""} />
    </div>
  );
}
