create index if not exists babies_owner_id_idx
  on public.babies (owner_id);

create index if not exists events_created_by_idx
  on public.events (created_by);

create index if not exists measurements_created_by_idx
  on public.measurements (created_by);

alter policy "Owners can create their baby profile"
on public.babies
with check (
  (select auth.uid()) = owner_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

alter policy "Owners can update their baby profile"
on public.babies
using (
  (select auth.uid()) = owner_id
  and ((select auth.jwt()) ->> 'client_id') is null
)
with check (
  (select auth.uid()) = owner_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

alter policy "Owners can create baby events"
on public.events
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

alter policy "Owners can update baby events"
on public.events
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

alter policy "Owners can delete baby events"
on public.events
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

alter policy "Owners can create baby measurements"
on public.measurements
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

alter policy "Owners can update baby measurements"
on public.measurements
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

alter policy "Owners can delete baby measurements"
on public.measurements
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
