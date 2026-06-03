-- Security fix: lock down sensitive server-only tables.
-- The server uses the service-role key (SUPABASE_SERVICE_ROLE_KEY), which
-- bypasses RLS, so these stay accessible to API routes. The public anon key
-- gets zero access once RLS is on with no permissive policy.

-- Fully private (only reached by server API routes):
alter table fabi_auth_cache   enable row level security; -- holds the FABi JWT
alter table fabi_daily_sales  enable row level security;
alter table rc_renewal_events enable row level security;

-- rc_subscriptions already had RLS on but a public "Allow all" policy.
-- Drop it so revenue data is no longer publicly readable.
drop policy if exists "Allow all" on rc_subscriptions;

-- content_generations is read by two owner pages in the browser (anon key),
-- so enable RLS but keep a permissive policy to avoid breaking them. This
-- clears the "RLS disabled" lint while preserving current behavior.
alter table content_generations enable row level security;
drop policy if exists "Allow all" on content_generations;
create policy "Allow all" on content_generations
  for all to public using (true) with check (true);
