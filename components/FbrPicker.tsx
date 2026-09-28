"use client";

import { useMemo, useState } from "react";
import type { FbrRefRow } from "@/lib/fbr";

/**
 * A text box that suggests values from an FBR list while you type (used for HS codes and units).
 * If the list has not been loaded yet (rows is empty) it behaves like a normal text box.
 * `pick` decides whether the saved value is the list's code or its label.
 */
export default function FbrPicker({
  id,
  label,
  value,
  onChange,
  rows,
  pick,
  error,
  hint,
  placeholder,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: FbrRefRow[];
  pick: "code" | "label";
  error?: string;
  hint?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal";
}) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    if (rows.length === 0) return [];
    const q = value.trim().toLowerCase();
    const list = q
      ? rows.filter((r) => r.code.toLowerCase().includes(q) || (r.label ?? "").toLowerCase().includes(q))
      : rows;
    return list.slice(0, 8);
  }, [rows, value]);

  const known = rows.length > 0 && value.trim() !== "" && rows.some((r) => (pick === "code" ? r.code : r.label ?? r.code) === value.trim());

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        aria-invalid={error ? true : undefined}
        className="input"
      />
      {open && matches.length > 0 && !known && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-white shadow-lg">
          {matches.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-plate"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(pick === "code" ? r.code : r.label ?? r.code);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{pick === "code" ? r.code : r.label ?? r.code}</span>
                {pick === "code" && r.label ? <span className="block text-xs text-lead">{r.label}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className="mt-1 text-sm text-terminal-deep">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-sm text-lead">{hint}</p>
      ) : rows.length === 0 ? null : known ? (
        <p className="mt-1 text-sm text-cell-deep">In the FBR list.</p>
      ) : null}
    </div>
  );
}
