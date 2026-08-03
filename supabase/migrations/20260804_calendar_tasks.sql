-- Calendar + task manager. Run in the Supabase SQL Editor.

create table if not exists calendar_tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text default '',
  image_url text,
  priority int not null default 5 check (priority between 1 and 10),
  category text not null default 'other' check (category in ('music', 'app', 'other')),
  estimate_minutes int not null default 30 check (estimate_minutes > 0),
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'monthly', 'yearly')),

  -- One-off date, and the "not before" anchor for recurring tasks.
  start_date date,
  -- Default wall-clock time, 'HH:MM' in Vietnam time.
  start_time text default '09:00',

  -- Weekly recurrence with a per-weekday time: {"1":"06:00","2":"18:00"}, 0 = Sunday.
  weekly_times jsonb not null default '{}'::jsonb,

  monthly_day int check (monthly_day between 1 and 31),
  yearly_month int check (yearly_month between 1 and 12),
  yearly_day int check (yearly_day between 1 and 31),

  -- Soft delete: rows are never removed, so history stays intact.
  deleted_at timestamptz,
  created_at timestamptz default now()
);

-- One row per completed occurrence. A recurring task completed on one day
-- stays pending on every other day it recurs.
create table if not exists calendar_task_completions (
  id uuid default gen_random_uuid() primary key,
  task_id uuid not null references calendar_tasks(id) on delete cascade,
  occurrence_date date not null,
  completed_at timestamptz not null default now(),
  unique (task_id, occurrence_date)
);

create index if not exists idx_calendar_tasks_live on calendar_tasks(created_at) where deleted_at is null;
create index if not exists idx_calendar_completions_date on calendar_task_completions(occurrence_date);
create index if not exists idx_calendar_completions_task on calendar_task_completions(task_id, occurrence_date);

alter table calendar_tasks enable row level security;
alter table calendar_task_completions enable row level security;
create policy "Allow all" on calendar_tasks for all using (true) with check (true);
create policy "Allow all" on calendar_task_completions for all using (true) with check (true);
