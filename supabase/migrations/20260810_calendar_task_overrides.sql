-- Per-occurrence date and time changes for recurring calendar tasks.
--
-- The original occurrence_date remains the stable completion/skip identity.
-- display_date and start_time control where that one occurrence is rendered,
-- leaving the task's weekly, monthly, or yearly schedule untouched.

create table if not exists calendar_task_overrides (
  id uuid default gen_random_uuid() primary key,
  task_id uuid not null references calendar_tasks(id) on delete cascade,
  occurrence_date date not null,
  display_date date not null,
  start_time text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, occurrence_date)
);

create index if not exists idx_calendar_overrides_original
  on calendar_task_overrides(occurrence_date);
create index if not exists idx_calendar_overrides_display
  on calendar_task_overrides(display_date);
create index if not exists idx_calendar_overrides_task
  on calendar_task_overrides(task_id, occurrence_date);

alter table calendar_task_overrides enable row level security;
create policy "Allow all" on calendar_task_overrides
  for all using (true) with check (true);
