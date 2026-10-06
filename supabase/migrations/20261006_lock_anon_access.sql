-- Security fix (2026-10-06): the browser no longer talks to Supabase. Every page
-- goes through session-checked API routes that use the service-role key (which
-- bypasses RLS). Lock the public anon key (and "authenticated", unused) out of
-- every public table: no "Allow all" policies and no table privileges.
-- Before this, anon could read employees.pin and read/write staff, accounts,
-- metrics, calendar, Pinterest and the revenue/cost caches in pinterest_topics.

do $$
declare
  t record;
  p record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.tablename loop
      execute format('drop policy %I on public.%I', p.policyname, t.tablename);
    end loop;
    execute format('revoke all on table public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;

-- Tables created later are not exposed to the anon key by default either.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
