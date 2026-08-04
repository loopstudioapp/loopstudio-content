-- "Do first" tasks.
--
-- Priority alone cannot express this: a task ranked 10 still sits behind the
-- music and app gates, and ties between two priority-10 tasks fall back to
-- creation order. A pinned task leads the day's queue outright.

alter table calendar_tasks
  add column if not exists pin_first boolean not null default false;
