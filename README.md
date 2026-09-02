# Baby Record

A private, iPhone-first baby care tracker for feeding, diaper, height, and weight records. It includes a read-only MCP endpoint so ChatGPT can answer questions about the data after the owner explicitly connects and approves access.

## Stack

- Next.js and TypeScript
- Supabase Auth and Postgres
- Supabase Row Level Security
- Vercel hosting
- `mcp-handler` for the authenticated `/mcp` endpoint

## Local setup

1. Install Node.js 22 or newer.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key.
4. Apply the SQL migration in `supabase/migrations` to the Supabase project.
5. Create the private owner account in Supabase Authentication.
6. Start the app with `npm run dev`.

Without Supabase environment variables, the app runs in clearly labelled demo mode and saves data only to the current browser.

## Supabase setup

The initial migration creates:

- `babies`
- `events`
- `measurements`
- explicit Data API grants
- owner-only RLS policies
- read-only policies for OAuth sessions

The app creates the first profile as a girl born on 15 November 2025 in the `Asia/Hong_Kong` time zone.

## ChatGPT connection

The MCP endpoint is deliberately fail-closed until OAuth is configured.

1. Enable the Supabase OAuth 2.1 server.
2. Configure the authorization path as `/oauth/consent`.
3. Use asymmetric JWT signing keys in Supabase.
4. Register the private ChatGPT client or complete the supported client-registration flow.
5. Set `SUPABASE_MCP_CLIENT_ID` in Vercel to the resulting OAuth client ID.
6. Set the Supabase Site URL to the production Vercel URL.
7. Connect ChatGPT to `https://YOUR_DOMAIN/mcp`.

The MCP server verifies the Supabase token, checks the OAuth client ID, forwards the user token to Supabase, and therefore keeps RLS active. It never uses a Supabase secret/service key.

Available read-only tools:

- `get_baby_profile`
- `get_latest_event`
- `get_daily_summary`
- `get_events`
- `get_period_summary`
- `get_growth_history`

## Verification

```text
npm run type-check
npm run lint
npm test
npm run build
npm audit
```

The app records facts and trends; it does not provide medical diagnoses.
