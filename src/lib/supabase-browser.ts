import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY } from "@/src/lib/supabase-public-config";

let browserClient: SupabaseClient | null | undefined;

export function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_PROJECT_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  if (!hasSupabaseConfig()) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createClient(
    SUPABASE_PROJECT_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
  return browserClient;
}
