"use client";

import { useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";

/**
 * Subscribes a component to a Dexie query so it re-renders whenever the
 * underlying IndexedDB table changes -- whether that change came from this
 * tab (an offline save) or from the sync engine pulling fresh server data.
 *
 * `initial` is shown before the first Dexie read resolves (should normally be
 * the server-rendered prop, so there is no flash of an empty list).
 */
export function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue(v),
      error: () => setValue(initialRef.current),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
