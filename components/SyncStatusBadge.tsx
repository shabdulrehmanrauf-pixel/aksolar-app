"use client";

import { useSyncStatus } from "@/lib/offline/useSyncStatus";

const CONFIG: Record<
  string,
  { dot: string; label: string; bg: string; text: string }
> = {
  offline: { dot: "bg-amber-500", label: "Offline – changes saved locally", bg: "bg-amber-50", text: "text-amber-800" },
  syncing: { dot: "bg-focus animate-pulse", label: "Syncing…", bg: "bg-focus/10", text: "text-focus" },
  synced: { dot: "bg-cell", label: "All synced", bg: "bg-cell/10", text: "text-cell" },
  error: { dot: "bg-terminal", label: "Sync issue – will retry", bg: "bg-terminal/10", text: "text-terminal-deep" },
};

export default function SyncStatusBadge() {
  const { status, pendingCount } = useSyncStatus();
  const c = CONFIG[status] ?? CONFIG.offline;

  const label =
    status === "offline" && pendingCount > 0
      ? `Offline – ${pendingCount} change${pendingCount === 1 ? "" : "s"} saved locally`
      : status === "synced" && pendingCount > 0
        ? "Syncing…"
        : c.label;

  return (
    <span
      title={label}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium ${c.bg} ${c.text}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
