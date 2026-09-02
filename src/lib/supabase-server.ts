import type { AuthInfo } from "@modelcontextprotocol/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY } from "@/src/lib/supabase-public-config";

function env() {
  const url = SUPABASE_PROJECT_URL;
  const key = SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not configured.");
  return { url, key };
}

export function createSupabaseForToken(token: string): SupabaseClient {
  const { url, key } = env();
  return createClient(url, key, {
    accessToken: async () => token,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function verifySupabaseMcpToken(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const approvedClientId = process.env.SUPABASE_MCP_CLIENT_ID;
  if (!approvedClientId) return undefined;

  const { url, key } = env();
  const verifier = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await verifier.auth.getClaims(bearerToken);
  if (error || !data?.claims) return undefined;

  const claims = data.claims as Record<string, unknown>;
  const subject = typeof claims.sub === "string" ? claims.sub : null;
  const clientId = typeof claims.client_id === "string" ? claims.client_id : null;
  const expiresAt = typeof claims.exp === "number" ? claims.exp : undefined;
  if (!subject || clientId !== approvedClientId) return undefined;

  const scope = typeof claims.scope === "string" ? claims.scope.split(/\s+/).filter(Boolean) : [];
  return {
    token: bearerToken,
    clientId,
    scopes: scope,
    expiresAt,
    extra: { userId: subject },
  };
}

export function supabaseOAuthIssuer(): string {
  return `${SUPABASE_PROJECT_URL.replace(/\/$/, "")}/auth/v1`;
}
