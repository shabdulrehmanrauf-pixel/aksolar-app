/**
 * Connectivity detection.
 *
 * `navigator.onLine` is a good first signal but it can lie (e.g. connected to a
 * Wi-Fi router with no real internet). Before a sync run we also do a tiny,
 * cheap request to Supabase's auth endpoint to confirm the connection is real.
 */

let cachedGood = false;

export function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** A quick, cache-busting request that fails fast if there is no real internet. */
export async function checkRealConnectivity(timeoutMs = 4000): Promise<boolean> {
  if (!isBrowserOnline()) {
    cachedGood = false;
    return false;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    // No URL configured (shouldn't happen in a real deployment) -- trust the browser.
    return isBrowserOnline();
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(t);
    cachedGood = true;
    return true;
  } catch {
    cachedGood = false;
    return false;
  }
}

export function lastKnownGood(): boolean {
  return cachedGood;
}
