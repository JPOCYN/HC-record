create table public.household_pin_attempts (
  ip_hash text primary key,
  attempts smallint not null default 0,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.household_pin_attempts enable row level security;

revoke all on table public.household_pin_attempts from anon, authenticated;
grant all on table public.household_pin_attempts to service_role;

comment on table public.household_pin_attempts is
  'Server-only rate limiting for the household PIN endpoint.';
