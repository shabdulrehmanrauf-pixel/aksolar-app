import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { loadRoleInfo } from "@/lib/rolesServer";
import { FBR_KINDS, type FbrKind } from "@/lib/fbr";
import FbrListsClient from "./FbrListsClient";

export const metadata: Metadata = { title: "FBR lists" };

export default async function FbrPage() {
  const info = await loadRoleInfo();
  if (!can(info, "team.manage")) redirect("/");

  const supabase = await createClient();
  const [profile, heartbeat, ...counts] = await Promise.all([
    supabase.from("business_profile").select("business_name,ntn,province,fbr_enabled,fbr_environment,prices_include_tax").maybeSingle(),
    supabase.from("fbr_heartbeat").select("last_seen").maybeSingle(),
    ...FBR_KINDS.map((k) => supabase.from("fbr_reference").select("code", { count: "exact", head: true }).eq("kind", k.kind)),
  ]);

  if (profile.error || (profile.data && !("fbr_enabled" in profile.data))) {
    return (
      <div className="card max-w-xl border-terminal/40 p-6">
        <h1 className="font-display text-3xl font-bold">FBR setup could not be loaded</h1>
        <p className="mt-3 text-lead">
          Open Supabase, go to SQL Editor, and run <code className="rounded bg-plate px-1.5 py-0.5 text-casing">18_fbr.sql</code> and then{" "}
          <code className="rounded bg-plate px-1.5 py-0.5 text-casing">19_fbr_d2_d3.sql</code>.
        </p>
        {profile.error && <p className="mt-3 text-sm text-lead">Details: {profile.error.message}</p>}
      </div>
    );
  }

  const loaded: Record<string, number> = {};
  FBR_KINDS.forEach((k, i) => (loaded[k.kind] = counts[i].count ?? 0));

  return (
    <div className="max-w-3xl">
      <PageHeader title="FBR lists" subtitle="The lists FBR uses. Bills and items are checked against them." />
      <FbrListsClient
        kinds={FBR_KINDS as { kind: FbrKind; label: string; hint: string }[]}
        loaded={loaded}
        settings={{
          businessName: (profile.data?.business_name as string) ?? "",
          ntn: (profile.data?.ntn as string | null) ?? null,
          province: (profile.data?.province as string | null) ?? null,
          enabled: !!profile.data?.fbr_enabled,
          environment: (profile.data?.fbr_environment as string) ?? "sandbox",
          pricesIncludeTax: !!profile.data?.prices_include_tax,
        }}
        senderLastSeen={(heartbeat.data?.last_seen as string | null) ?? null}
      />
    </div>
  );
}
