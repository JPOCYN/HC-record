create unique index events_one_active_sleep_per_baby_idx
  on public.events (baby_id)
  where event_type = 'sleep' and ended_at is null;
