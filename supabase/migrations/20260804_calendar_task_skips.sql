-- Per-occurrence exceptions for recurring tasks.
--
-- A recurring task's schedule lives in weekly_times / monthly_day / yearly_*,
-- which are shared by every occurrence. Without this table the only way to drop
-- a single day was to narrow the recurrence (losing that weekday forever) or
-- split the task in two. A skip row removes exactly one date.
--
-- Mirrors calendar_task_completions: same shape, same (task, date) identity.

create table if not exists calendar_task_skips (
  id uuid default gen_random_uuid() primary key,
  task_id uuid not null references calendar_tasks(id) on delete cascade,
  occurrence_date date not null,
  created_at timestamptz not null default now(),
  unique (task_id, occurrence_date)
);

create index if not exists idx_calendar_skips_date on calendar_task_skips(occurrence_date);
create index if not exists idx_calendar_skips_task on calendar_task_skips(task_id, occurrence_date);

alter table calendar_task_skips enable row level security;
create policy "Allow all" on calendar_task_skips for all using (true) with check (true);
