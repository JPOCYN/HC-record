create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  item_type text not null
    check (item_type in ('school', 'doctor', 'important')),
  title text not null
    check (char_length(trim(title)) between 1 and 120),
  event_date date not null,
  event_time time without time zone,
  repeats_weekly boolean not null default false,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index schedule_items_baby_event_date_idx
  on public.schedule_items (baby_id, event_date);

create index schedule_items_created_by_idx
  on public.schedule_items (created_by);

create trigger schedule_items_set_updated_at
before update on public.schedule_items
for each row execute function public.set_updated_at();

alter table public.schedule_items enable row level security;

revoke all on table public.schedule_items from anon, authenticated;
grant select, insert, update, delete on table public.schedule_items to authenticated;

create policy "Owners can read baby schedule"
on public.schedule_items for select
to authenticated
using (
  exists (
    select 1
    from public.babies
    where babies.id = schedule_items.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can create baby schedule"
on public.schedule_items for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = schedule_items.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can update baby schedule"
on public.schedule_items for update
to authenticated
using (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = schedule_items.baby_id
      and babies.owner_id = (select auth.uid())
  )
)
with check (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = schedule_items.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

create policy "Owners can delete baby schedule"
on public.schedule_items for delete
to authenticated
using (
  created_by = (select auth.uid())
  and ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.babies
    where babies.id = schedule_items.baby_id
      and babies.owner_id = (select auth.uid())
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'schedule_items'
  ) then
    alter publication supabase_realtime add table public.schedule_items;
  end if;
end
$$;

comment on table public.schedule_items is
  'Private school, doctor, and important timetable entries. OAuth clients are read-only through RLS.';
