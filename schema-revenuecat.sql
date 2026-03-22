create table rc_subscriptions (
  id text primary key,                    -- RevenueCat subscription ID or app_user_id
  app_user_id text not null,
  country text,
  store text default 'app_store',
  product_id text,
  status text not null,                   -- trialing, active, expired, cancelled, billing_retry
  auto_renewal text,                      -- will_renew, will_not_renew
  environment text default 'production',
  purchased_at timestamptz,
  expires_at timestamptz,
  revenue_gross numeric default 0,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index idx_rc_subs_status on rc_subscriptions(status);
create index idx_rc_subs_env on rc_subscriptions(environment);

alter table rc_subscriptions enable row level security;
create policy "Allow all" on rc_subscriptions for all using (true) with check (true);
