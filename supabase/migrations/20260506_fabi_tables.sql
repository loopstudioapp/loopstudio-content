-- FABi auth cache: single-row store for the JWT + brand/company/store IDs
create table if not exists fabi_auth_cache (
  id text primary key default 'singleton',
  token text not null,
  token_expires_at timestamptz not null,
  brand_uid text not null,
  company_uid text not null,
  store_uids text[] not null default '{}',
  refreshed_at timestamptz not null default now()
);

-- FABi daily sales: one row per (date, store)
create table if not exists fabi_daily_sales (
  date date not null,
  store_uid text not null default 'all',
  revenue_net bigint not null default 0,
  revenue_gross bigint not null default 0,
  discount_amount bigint not null default 0,
  invoice_count int not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (date, store_uid)
);

create index if not exists fabi_daily_sales_date_idx on fabi_daily_sales(date desc);
