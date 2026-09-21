"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/lazy";
import Icon from "./Icons";

export default function SignOutButton({ className = "btn btn-quiet w-full" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await (await getBrowserClient()).auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} disabled={busy} className={className}>
      <Icon name="logout" className="h-[18px] w-[18px]" />
      {busy ? "Signing out" : "Sign out"}
    </button>
  );
}
