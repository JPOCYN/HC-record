import type { SupabaseClient } from "@supabase/supabase-js";

export async function unlockHousehold(supabase: SupabaseClient, pin: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("household-login", { body: { pin } });
  if (error) {
    const response = (error as { context?: Response }).context;
    const details = response
      ? await response.clone().json().catch(() => null) as { error?: string } | null
      : null;
    return details?.error ?? "Unable to open Harper's records.";
  }
  if (!data?.access_token || !data?.refresh_token) return "Unable to open Harper's records.";

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  return sessionError ? "Unable to open Harper's records." : null;
}
