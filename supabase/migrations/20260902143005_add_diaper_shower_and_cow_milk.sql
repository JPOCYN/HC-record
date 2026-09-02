alter table public.events
  add column diaper_type text,
  drop constraint if exists events_event_type_check,
  drop constraint if exists events_milk_type_check,
  drop constraint if exists events_check,
  drop constraint if exists events_poo_fields_check;

update public.events
set
  diaper_type = case event_type when 'poo' then 'poo' else 'wee' end,
  event_type = 'diaper'
where event_type in ('poo', 'wee');

alter table public.events
  add constraint events_event_type_check
    check (event_type in ('milk', 'food', 'diaper', 'shower')),
  add constraint events_milk_type_check
    check (milk_type is null or milk_type in ('formula', 'cow_milk', 'breast_milk', 'breastfeeding')),
  add constraint events_milk_fields_check
    check (event_type = 'milk' or (milk_type is null and amount_ml is null)),
  add constraint events_diaper_type_check
    check (
      (event_type = 'diaper' and diaper_type in ('wee', 'poo', 'both'))
      or (event_type <> 'diaper' and diaper_type is null)
    ),
  add constraint events_diaper_poo_level_check
    check (
      poo_level is null
      or (event_type = 'diaper' and diaper_type in ('poo', 'both'))
    );
