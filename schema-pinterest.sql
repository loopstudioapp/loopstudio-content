-- Pinterest Automation Pipeline Tables

create table pinterest_accounts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  pinterest_username text,
  postiz_api_key text not null,
  postiz_integration_id text not null,
  board_id text not null,
  content_type text not null check (content_type in ('before_after', 'listicle', 'visual_guide')),
  status text not null default 'active' check (status in ('active', 'paused')),
  pins_per_day int not null default 10,
  telegram_chat_id text,
  app_store_url text default 'https://apps.apple.com/us/app/interior-design-roomy-ai/id6759851023?ct=pinterest&mt=8',
  created_at timestamptz default now()
);

create table pinterest_pins (
  id uuid default gen_random_uuid() primary key,
  account_id uuid not null references pinterest_accounts(id) on delete cascade,
  topic_id text not null,
  title text not null,
  description text not null,
  image_url text,
  postiz_post_id text,
  scheduled_at timestamptz,
  status text not null default 'pending' check (status in ('pending','generating','uploading','scheduled','posted','failed')),
  error_message text,
  retry_count int default 0,
  created_at timestamptz default now()
);

create table pinterest_topics (
  id text primary key,
  category text not null,
  title_template text not null,
  description_template text not null,
  prompt_seed text not null,
  times_used int default 0,
  last_used_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes
create index idx_pins_account_status on pinterest_pins(account_id, status);
create index idx_pins_scheduled on pinterest_pins(scheduled_at) where status = 'scheduled';
create index idx_topics_category on pinterest_topics(category);
create index idx_topics_least_used on pinterest_topics(category, times_used asc, last_used_at asc nulls first);

-- RLS
alter table pinterest_accounts enable row level security;
alter table pinterest_pins enable row level security;
alter table pinterest_topics enable row level security;
create policy "Allow all" on pinterest_accounts for all using (true) with check (true);
create policy "Allow all" on pinterest_pins for all using (true) with check (true);
create policy "Allow all" on pinterest_topics for all using (true) with check (true);
