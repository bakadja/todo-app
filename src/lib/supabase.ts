import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createBrowserSupabaseClient(
  url: string,
  publishableKey: string,
): SupabaseClient {
  if (!url || !publishableKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  return createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let browserClient: SupabaseClient | null | undefined;

export function getBrowserSupabaseClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;

  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

  browserClient =
    url && publishableKey
      ? createBrowserSupabaseClient(url, publishableKey)
      : null;

  return browserClient;
}
