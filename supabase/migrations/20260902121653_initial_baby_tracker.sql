create extension if not exists pgcrypto;

create table public.babies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Harper'
    check (char_length(trim(name)) between 1 and 80),
  gender text not null default 'female'
    check (gender in ('female', 'male', 'other', 'unknown')),
  date_of_birth date not null,
  timezone text not null default 'Asia/Hong_Kong'
    check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  event_type text not null
    check (event_type in ('milk', 'food', 'poo', 'wee')),
  occurred_at timestamptz not null default now(),
  milk_type text
    check (milk_type is null or milk_type in ('formula', 'breast_milk', 'breastfeeding')),
  amount_ml integer
    check (amount_ml is null or amount_ml between 1 and 2000),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (event_type = 'milk' or (milk_type is null and amount_ml is null))
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null default now(),
  height_cm numeric(5, 1)
    check (height_cm is null or height_cm between 20 and 200),
  weight_kg numeric(5, 2)
    check (weight_kg is null or weight_kg between 0.1 and 200),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (height_cm is not null or weight_kg is not null)
);

create index events_baby_occurred_at_idx
  on public.events (baby_id, occurred_at desc);

create index measurements_baby_measured_at_idx
  on public.measurements (baby_id, measured_at desc);

create index babies_owner_id_idx on public.babies (owner_id);
create index events_created_by_idx on public.events (created_by);
create index measurements_created_by_idx on public.measurements (created_by);

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public;

create trigger babies_set_updated_at
before update on public.babies
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger measurements_set_updated_at
before update on public.measurements
for each row execute function public.set_updated_at();

alter table public.babies enable row level security;
alter table public.events enable row level security;
alter table public.measurements enable row level security;

revoke all on table public.babies from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.measurements from anon, authenticated;

grant select, insert, update on table public.babies to authenticated;
grant select, insert, update, delete on table public.events to authenticated;
grant select, insert, update, delete on table public.measurements to authenticated;

create policy "Owners can read their baby profile"
on public.babies for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "Owners can create their baby profile"
on public.babies for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "Owners can update their baby profile"
on public.babies for update
to authenticated
using (
  (select auth.uid()) = owner_id
  and ((select auth.jwt()) ->> 'client_id') is null
)
with check (
  (select auth.uid()) = owner_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "Owners can read baby events"
on public.events for select
to authenticated
using (
  exists (
    select 1
    from public.babies
    where babies.id = events.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can create baby events"
on public.events for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = events.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can update baby events"
on public.events for update
to authenticated
using (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = events.baby_id
      and babies.owner_id = (select auth.uid())
  )
)
with check (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = events.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can delete baby events"
on public.events for delete
to authenticated
using (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = events.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can read baby measurements"
on public.measurements for select
to authenticated
using (
  exists (
    select 1
    from public.babies
    where babies.id = measurements.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can create baby measurements"
on public.measurements for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = measurements.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can update baby measurements"
on public.measurements for update
to authenticated
using (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = measurements.baby_id
      and babies.owner_id = (select auth.uid())
  )
)
with check (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = measurements.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can delete baby measurements"
on public.measurements for delete
to authenticated
using (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = measurements.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

comment on table public.babies is 'Private baby profiles owned by authenticated users.';
comment on table public.events is 'Feeding and diaper records. OAuth clients are read-only through RLS.';
comment on table public.measurements is 'Height and weight history. OAuth clients are read-only through RLS.';
