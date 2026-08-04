-- Timed vs anytime tasks.
--
-- A timed task is fixed to a clock time, shows on the week grid, and must be
-- done at that time. An anytime task has no clock time, never appears on the
-- grid, and is ranked purely by priority within its day.
--
-- Existing rows were all created with a time, so the default is true.

alter table calendar_tasks
  add column if not exists timed boolean not null default true;
