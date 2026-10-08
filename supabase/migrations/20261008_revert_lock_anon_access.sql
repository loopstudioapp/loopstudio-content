-- Revert 20261006_lock_anon_access.sql (owner, 2026-10-08): the owner site's
-- browser pages talk to Supabase with the anon key again. Restores exactly the
-- state recorded right before the lock was applied on 2026-10-06:
-- - RLS stays on for every public table (it already was on all 16 tables).
-- - "Allow all" (for all to public using true with check true) on the 12 tables
--   that had it. fabi_auth_cache, fabi_daily_sales, rc_renewal_events and
--   rc_subscriptions had no policy (locked by 20260603_lock_sensitive_tables.sql)
--   and stay without one.
-- - All table privileges for anon and authenticated on every public table.
-- - Supabase's default privileges for anon/authenticated on new public
--   tables and sequences (owner postgres).

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'calendar_task_completions', 'calendar_task_overrides',
    'calendar_task_skips', 'calendar_tasks', 'content_generations',
    'daily_metrics', 'employees', 'pinterest_accounts', 'pinterest_pins',
    'pinterest_schedule', 'pinterest_topics'
  ] loop
    execute format('drop policy if exists "Allow all" on public.%I', t);
    execute format('create policy "Allow all" on public.%I for all to public using (true) with check (true)', t);
  end loop;
end $$;

grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
