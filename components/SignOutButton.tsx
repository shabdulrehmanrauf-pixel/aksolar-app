"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="on-dark rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60"
    >
      {busy ? "Signing out" : "Sign out"}
    </button>
  );
}
