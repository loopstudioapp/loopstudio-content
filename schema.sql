-- Run this in Supabase SQL Editor to set up the database

create table employees (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  pin text not null,
  avatar_color text not null default '#22c55e',
  created_at timestamptz default now()
);

create table accounts (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid references employees(id) on delete cascade,
  angle int not null check (angle between 1 and 3),
  platform text not null default 'TikTok / Lemon8',
  username text not null,
  login_email text,
  login_method text,
  app text default 'Roomy AI',
  device text,
  status text default 'Active',
  notes text,
  created_at timestamptz default now()
);

create table daily_metrics (
  id uuid default gen_random_uuid() primary key,
  account_id uuid references accounts(id) on delete cascade,
  date date not null default current_date,
  followers int default 0,
  following int default 0,
  total_likes int default 0,
  posts int default 0,
  created_at timestamptz default now(),
  unique(account_id, date)
);

-- Index for fast metric lookups
create index idx_metrics_account_date on daily_metrics(account_id, date desc);

-- Enable RLS but allow all access (no auth needed, just anon key)
alter table employees enable row level security;
alter table accounts enable row level security;
alter table daily_metrics enable row level security;

create policy "Allow all" on employees for all using (true) with check (true);
create policy "Allow all" on accounts for all using (true) with check (true);
create policy "Allow all" on daily_metrics for all using (true) with check (true);
