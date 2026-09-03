alter table public.events
  add column sleep_type text,
  add column ended_at timestamptz,
  drop constraint if exists events_event_type_check;

alter table public.events
  add constraint events_event_type_check
    check (event_type in ('milk', 'food', 'diaper', 'shower', 'sleep')),
  add constraint events_sleep_fields_check
    check (
      (event_type = 'sleep' and sleep_type in ('nap', 'night'))
      or (event_type <> 'sleep' and sleep_type is null and ended_at is null)
    ),
  add constraint events_sleep_time_check
    check (ended_at is null or ended_at >= occurred_at);
