"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/lazy";
import type { CashAccountChoice } from "@/lib/cash";

/**
 * Loads the account list once so forms can offer "paid from which account".
 * If the cash book SQL has not been run (or the role may not read it) this quietly returns an empty
 * list, and the form behaves exactly as it did before.
 */
export function useCashAccounts(): CashAccountChoice[] {
  const [choices, setChoices] = useState<CashAccountChoice[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = await getBrowserClient();
        const { data, error } = await supabase.rpc("cash_account_choices");
        if (!alive || error || !Array.isArray(data)) return;
        setChoices(data as CashAccountChoice[]);
      } catch {
        /* offline or not set up: forms fall back to the default account */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return choices;
}
