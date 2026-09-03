create function public.end_active_night_sleep_on_diaper()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.event_type = 'diaper' then
    update public.events
    set ended_at = new.occurred_at
    where baby_id = new.baby_id
      and event_type = 'sleep'
      and sleep_type = 'night'
      and ended_at is null
      and occurred_at <= new.occurred_at;
  end if;

  return new;
end;
$$;

revoke execute on function public.end_active_night_sleep_on_diaper() from public;

create trigger events_end_night_sleep_on_diaper
after insert on public.events
for each row execute function public.end_active_night_sleep_on_diaper();
