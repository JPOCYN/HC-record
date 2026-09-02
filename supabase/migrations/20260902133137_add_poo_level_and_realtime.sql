alter table public.events
  add column if not exists poo_level smallint;

alter table public.events
  add constraint events_poo_level_check
  check (poo_level is null or poo_level between 1 and 5),
  add constraint events_poo_fields_check
  check (event_type = 'poo' or poo_level is null);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'babies'
  ) then
    alter publication supabase_realtime add table public.babies;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'measurements'
  ) then
    alter publication supabase_realtime add table public.measurements;
  end if;
end
$$;
