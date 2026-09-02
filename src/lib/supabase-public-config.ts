// These values are designed for browser use. Supabase RLS protects all data.
// Environment variables take precedence when Vercel's integration is available.
export const SUPABASE_PROJECT_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://qtqdhkdngjvdbvyrtshw.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_-cZx8Hs4InBaxpfyFLo5NA_zD0zlVDt";
