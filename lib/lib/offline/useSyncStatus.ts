"use client";

import { useEffect, useState } from "react";
import { getSyncSnapshot, subscribeSyncStatus, type SyncStatus } from "./sync";

export function useSyncStatus() {
  const [snapshot, setSnapshot] = useState(getSyncSnapshot);

  useEffect(() => {
    return subscribeSyncStatus(() => setSnapshot(getSyncSnapshot()));
  }, []);

  return snapshot as { status: SyncStatus; pendingCount: number; lastError: string | null };
}
