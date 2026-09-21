/**
 * Loads the Supabase browser client only when it is needed (on save, delete, sign in or sign out),
 * instead of shipping it with every page. Keeps first load light and fast.
 */
export async function getBrowserClient() {
  const { createClient } = await import("./client");
  return createClient();
}
