"use client";

import { useEffect } from "react";

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Keep it",
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-casing/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-text"
        className="anim-pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      >
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-terminal/10 text-terminal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
          </svg>
        </span>
        <h2 id="confirm-title" className="font-display text-2xl font-bold">
          {title}
        </h2>
        <p id="confirm-text" className="mt-2 text-lead">
          {body}
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-terminal/10 px-3 py-2 text-sm text-terminal-deep">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} autoFocus className="btn btn-quiet">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn btn-danger">
            {busy ? "Deleting" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
