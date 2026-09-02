create policy "Service role manages PIN attempts"
on public.household_pin_attempts for all
to service_role
using (true)
with check (true);
