"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { FbrKind, FbrRefRow, FbrSettings } from "@/lib/fbr";
import { FBR_OFF } from "@/lib/fbr";

/** Reads one FBR list from the database (cached for the session). Empty list = not loaded yet. */
const cache = new Map<FbrKind, FbrRefRow[]>();

export async function loadFbrRef(kind: FbrKind, force = false): Promise<FbrRefRow[]> {
  if (!force && cache.has(kind)) return cache.get(kind)!;
  try {
    const supabase = await getBrowserClient();
    const rows: FbrRefRow[] = [];
    // HS code lists are long, so read in pages.
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await supabase
        .from("fbr_reference")
        .select("code,label,payload")
        .eq("kind", kind)
        .order("code")
        .range(from, from + 999);
      if (error) return cache.get(kind) ?? [];
      rows.push(...((data ?? []) as FbrRefRow[]));
      if (!data || data.length < 1000) break;
    }
    cache.set(kind, rows);
    return rows;
  } catch {
    return cache.get(kind) ?? [];
  }
}

export function clearFbrRefCache() {
  cache.clear();
}

export function useFbrRef(kind: FbrKind): FbrRefRow[] {
  const [rows, setRows] = useState<FbrRefRow[]>(cache.get(kind) ?? []);
  useEffect(() => {
    let alive = true;
    loadFbrRef(kind).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [kind]);
  return rows;
}

/** Shop-level FBR switches. If the database has not been upgraded (or the read fails), FBR is treated as OFF. */
export function useFbrSettings(): FbrSettings {
  const [s, setS] = useState<FbrSettings>(FBR_OFF);
  useEffect(() => {
    let alive = true;
    // Remember the last known setting, so a bill made offline still knows FBR is ON.
    try {
      const saved = window.localStorage.getItem("ak_fbr_settings");
      if (saved) setS(JSON.parse(saved) as FbrSettings);
    } catch {
      /* ignore */
    }
    (async () => {
      try {
        const supabase = await getBrowserClient();
        const { data } = await supabase
          .from("business_profile")
          .select("fbr_enabled,fbr_environment,prices_include_tax,province")
          .maybeSingle();
        if (alive && data) {
          const next: FbrSettings = {
            enabled: !!data.fbr_enabled,
            environment: data.fbr_environment === "production" ? "production" : "sandbox",
            pricesIncludeTax: !!data.prices_include_tax,
            shopProvince: (data.province as string | null) ?? null,
          };
          setS(next);
          try {
            window.localStorage.setItem("ak_fbr_settings", JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* stay OFF */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return s;
}
