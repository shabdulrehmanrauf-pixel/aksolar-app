"use client";

import { useEffect } from "react";
import { startAutoSync } from "@/lib/offline/sync";

/** Mounted once in app/layout.tsx, alongside RegisterSW. Renders nothing. */
export default function SyncProvider() {
  useEffect(() => {
    startAutoSync();
  }, []);
  return null;
}
