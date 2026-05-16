-- Renewal events log (one row per renewal that happens, going forward + backfilled)
create table if not exists rc_renewal_events (
  id text primary key,                -- RevenueCat event id, or synthetic for backfill
  app_user_id text not null,
  app_name text not null,
  product_id text,
  country text,
  store text default 'app_store',
  revenue numeric not null default 0,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists rc_renewal_events_occurred_idx on rc_renewal_events(occurred_at desc);
create index if not exists rc_renewal_events_app_idx on rc_renewal_events(app_name, occurred_at desc);

alter table rc_renewal_events disable row level security;
