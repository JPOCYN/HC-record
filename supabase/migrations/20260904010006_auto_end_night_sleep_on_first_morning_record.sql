drop trigger if exists events_end_night_sleep_on_diaper on public.events;
drop function if exists public.end_active_night_sleep_on_diaper();

create function public.end_active_night_sleep_on_morning_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.event_type in ('milk', 'diaper') then
    update public.events
    set ended_at = new.occurred_at
    where id = (
      select event.id
      from public.events as event
      where event.baby_id = new.baby_id
        and event.event_type = 'sleep'
        and event.sleep_type = 'night'
        and event.ended_at is null
        and event.occurred_at < new.occurred_at
        and (new.occurred_at at time zone 'Asia/Hong_Kong')::date
          = (event.occurred_at at time zone 'Asia/Hong_Kong')::date + 1
      order by event.occurred_at desc
      limit 1
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.end_active_night_sleep_on_morning_record() from public;

create trigger events_end_night_sleep_on_morning_record
after insert on public.events
for each row execute function public.end_active_night_sleep_on_morning_record();
