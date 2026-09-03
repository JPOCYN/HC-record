alter table public.babies
  add column birth_length_cm numeric(4, 1)
    check (birth_length_cm is null or birth_length_cm between 20 and 80),
  add column birth_head_circumference_cm numeric(4, 1)
    check (birth_head_circumference_cm is null or birth_head_circumference_cm between 15 and 60);

alter table public.measurements
  alter column weight_kg type numeric(6, 3) using weight_kg::numeric(6, 3),
  add column head_circumference_cm numeric(4, 1)
    check (head_circumference_cm is null or head_circumference_cm between 15 and 80),
  drop constraint measurements_check,
  add constraint measurements_has_value_check check (
    height_cm is not null
    or weight_kg is not null
    or head_circumference_cm is not null
  );

alter table public.schedule_items
  add column repeat_until date,
  add constraint schedule_items_repeat_until_check check (
    repeat_until is null
    or (repeats_weekly and repeat_until >= event_date)
  );

comment on column public.babies.birth_length_cm is 'Length at birth in centimetres.';
comment on column public.babies.birth_head_circumference_cm is 'Head circumference at birth in centimetres.';
comment on column public.measurements.head_circumference_cm is 'Head circumference in centimetres.';
comment on column public.schedule_items.repeat_until is 'Inclusive final date for a weekly recurring item.';
