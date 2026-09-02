alter table public.babies
  add column blood_type text
    check (blood_type is null or blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  add column birth_weight_kg numeric(5, 3)
    check (birth_weight_kg is null or birth_weight_kg between 0.2 and 10),
  add column birth_time time without time zone,
  add column gestational_weeks smallint,
  add column gestational_days smallint,
  add constraint babies_gestational_age_check check (
    (gestational_weeks is null and gestational_days is null)
    or (
      gestational_weeks between 20 and 45
      and (gestational_days is null or gestational_days between 0 and 6)
    )
  );

comment on column public.babies.blood_type is 'ABO and Rh blood type, when known.';
comment on column public.babies.birth_weight_kg is 'Birth weight in kilograms.';
comment on column public.babies.birth_time is 'Local time of birth.';
comment on column public.babies.gestational_weeks is 'Completed gestational weeks at birth.';
comment on column public.babies.gestational_days is 'Additional gestational days after completed weeks.';
