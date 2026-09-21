"use client";

import { useEffect } from "react";

/**
 * Slide-in panel for forms. A bottom sheet on phones, a right-hand drawer on tablets and desktops.
 * Escape closes it, the page behind does not scroll, and clicking the dark area does NOT close it
 * (so half-typed forms are not lost by accident).
 */
export default function Sheet({
  onClose,
  labelledBy,
  dismissable = true,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  dismissable?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, dismissable]);

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-casing/60 md:items-stretch md:justify-end">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="sheet-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:h-full md:max-h-none md:max-w-xl md:rounded-l-3xl md:rounded-tr-none"
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line md:hidden" />
        {children}
      </div>
    </div>
  );
}
