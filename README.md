# Baby Record

A private, iPhone-first baby care tracker for feeding, diaper, height, and weight records. It includes a read-only MCP endpoint so ChatGPT can answer questions about the data after the owner explicitly connects and approves access.

## Stack

- Next.js and TypeScript
- Supabase Auth, Realtime, Edge Functions, and Postgres
- Supabase Row Level Security
- Vercel hosting
- `mcp-handler` for the authenticated `/mcp` endpoint

## Local setup

1. Install Node.js 22 or newer.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key.
4. Apply the SQL migration in `supabase/migrations` to the Supabase project.
5. Deploy the server-only `household-login` Edge Function and keep its PIN and generated household credentials out of the browser bundle.
6. Start the app with `npm run dev`.

Without Supabase environment variables, the app runs in clearly labelled demo mode and saves data only to the current browser.

## Supabase setup

The initial migration creates:

- `babies`
- `events`
- `measurements`
- `household_pin_attempts` for server-side PIN rate limiting
- explicit Data API grants
- owner-only RLS policies
- read-only policies for OAuth sessions
- Realtime publication for baby, event, and measurement changes

The app uses one private household identity behind a four-digit PIN, so family devices do not need separate accounts. The app creates Harper's profile as a girl born on 15 November 2025 in the `Asia/Hong_Kong` time zone.

## ChatGPT connection

The MCP endpoint accepts only valid Supabase OAuth access tokens. Ordinary household sessions are not accepted because OAuth tokens must include a `client_id` claim.

1. Enable the Supabase OAuth 2.1 server.
2. Configure the authorization path as `/oauth/consent`.
3. Set the Supabase Site URL to the production Vercel URL.
4. Enable dynamic client registration so ChatGPT can register its OAuth client automatically.
5. Connect ChatGPT to `https://YOUR_DOMAIN/mcp` and approve the request with the household PIN.

For an additional client allowlist, set `SUPABASE_MCP_CLIENT_ID` in Vercel to one OAuth client ID or a comma-separated list. Leave it unset when using dynamic client registration.

The MCP server verifies the Supabase token, requires an OAuth `client_id`, forwards the user token to Supabase, and therefore keeps RLS active. It never uses a Supabase secret/service key.

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
