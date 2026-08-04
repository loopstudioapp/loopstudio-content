/**
 * Calendar task model, recurrence expansion, and the daily task ordering rules.
 *
 * Every date here is a Vietnam (GMT+7) calendar date as `YYYY-MM-DD`, and every
 * time is a Vietnam wall-clock `HH:MM`. Nothing is stored as an instant, so
 * "6am on Monday" stays 6am regardless of where the browser is.
 */

export const VN_TZ = "Asia/Ho_Chi_Minh";

export type Category = "music" | "app" | "other";
export type Recurrence = "none" | "weekly" | "monthly" | "yearly";

export type Task = {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  priority: number;
  category: Category;
  estimate_minutes: number;
  recurrence: Recurrence;
  timed: boolean;
  pin_first: boolean;
  start_date: string | null;
  start_time: string | null;
  weekly_times: Record<string, string>;
  monthly_day: number | null;
  yearly_month: number | null;
  yearly_day: number | null;
  created_at: string;
};

export type Occurrence = {
  key: string; // `${task.id}:${completionDate}` — the completion identity
  task: Task;
  date: string; // YYYY-MM-DD the occurrence is shown on
  /**
   * The date the completion row is keyed on. Same as `date` normally, but a
   * carried-over task stays pinned to the day it was originally scheduled, so
   * ticking it writes the row the overdue check reads and it stops rolling.
   */
  completionDate: string;
  time: string; // HH:MM
  minutes: number; // minutes past midnight, for sorting and grid placement
  timed: boolean; // false = anytime task, never drawn on the grid
  done: boolean;
  isGate: boolean; // the day's must-finish-first task for music / app
  rolledFrom: string | null; // original date when carried over, else null
};

export const CATEGORIES: Category[] = ["music", "app", "other"];

export const CATEGORY_COLOR: Record<Category, string> = {
  music: "#a855f7",
  app: "#22c55e",
  other: "#ea580c",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  music: "Music",
  app: "App",
  other: "Other",
};

/** Categories that get a daily must-finish-first task, in queue order. */
export const GATE_ORDER: Category[] = ["music", "app"];

export const DEFAULT_TIME = "09:00";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Monday-first display order. Values are JS day numbers, so `weekly_times`
 * keys keep their 0 = Sunday meaning no matter how the week is laid out.
 */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ── Date helpers (UTC-anchored so no local timezone can shift a day) ── */

export function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(new Date());
}

/** Minutes past midnight, right now, in Vietnam time. */
export function vnNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = isoToDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToIso(date);
}

export function addMonths(iso: string, months: number): string {
  const date = isoToDate(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(Math.min(day, daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)));
  return dateToIso(date);
}

/** 0 = Sunday. */
export function dayOfWeek(iso: string): number {
  return isoToDate(iso).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Monday-first weeks: the week containing `iso` runs Monday to Sunday.
 * Monday(1) shifts back 0 days, Sunday(0) shifts back 6.
 */
export function startOfWeek(iso: string): string {
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7));
}

/** The Sunday that starts the 6-week grid covering `iso`'s month. */
export function startOfMonthGrid(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return startOfWeek(`${y}-${String(m).padStart(2, "0")}-01`);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Inverse of `toMinutes` — 390 becomes "06:30". */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmtTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${period.toLowerCase()}` : `${hour}:${String(m).padStart(2, "0")}${period.toLowerCase()}`;
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtDateLong(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(isoToDate(iso));
}

/* ── Recurrence ── */

/**
 * The time a task occurs on `iso`, or null when it does not occur that day.
 */
export function occursOn(task: Task, iso: string): string | null {
  if (task.start_date && iso < task.start_date) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const fallback = task.start_time || DEFAULT_TIME;

  switch (task.recurrence) {
    case "none":
      return task.start_date === iso ? fallback : null;

    case "weekly": {
      const time = task.weekly_times?.[String(dayOfWeek(iso))];
      return time || null;
    }

    case "monthly": {
      // A 31st-of-the-month task lands on the last day of shorter months.
      const target = Math.min(task.monthly_day || 1, daysInMonth(year, month));
      return day === target ? fallback : null;
    }

    case "yearly": {
      if (month !== (task.yearly_month || 1)) return null;
      const target = Math.min(task.yearly_day || 1, daysInMonth(year, month));
      return day === target ? fallback : null;
    }

    default:
      return null;
  }
}

/** Most important first: priority desc, then earliest, then oldest. */
function byImportance(a: Occurrence, b: Occurrence): number {
  if (b.task.priority !== a.task.priority) return b.task.priority - a.task.priority;
  if (a.minutes !== b.minutes) return a.minutes - b.minutes;
  return a.task.created_at.localeCompare(b.task.created_at);
}

/** Chronological, then most important — the order a day reads in. */
export function byTime(a: Occurrence, b: Occurrence): number {
  if (a.minutes !== b.minutes) return a.minutes - b.minutes;
  return byImportance(a, b);
}

/**
 * Every occurrence on one date, with completion state and the day's gate tasks
 * flagged. Gates are picked from all occurrences (not just pending ones), so
 * finishing the day's key music task does not promote a second music task
 * into the gate slot.
 */
/**
 * A one-off task that came and went unfinished. It stops appearing on its
 * original day and shows up on the current day instead, carrying its time.
 *
 * Only one-off tasks roll. A recurring task simply comes around again on its
 * own schedule; carrying it forward would stack copies against its next
 * occurrence.
 */
export function isCarriedOver(task: Task, today: string, done: Set<string>): boolean {
  return (
    task.recurrence === "none" &&
    !!task.start_date &&
    task.start_date < today &&
    !done.has(`${task.id}:${task.start_date}`)
  );
}

export function occurrencesOn(
  tasks: Task[],
  iso: string,
  done: Set<string>,
  today: string = vnToday(),
  skipped: Set<string> = new Set(),
): Occurrence[] {
  const occurrences: Occurrence[] = [];

  for (const task of tasks) {
    let time: string | null;
    let completionDate = iso;
    let rolledFrom: string | null = null;

    if (isCarriedOver(task, today, done)) {
      // Shows only on the current day, never on the day it was scheduled for.
      if (iso !== today) continue;
      time = task.start_time || DEFAULT_TIME;
      completionDate = task.start_date as string;
      rolledFrom = task.start_date;
    } else {
      time = occursOn(task, iso);
    }

    if (!time) continue;
    // A skipped occurrence is dropped outright: off the grid, out of the queue,
    // and not eligible to carry over.
    if (skipped.has(`${task.id}:${completionDate}`)) continue;
    occurrences.push({
      key: `${task.id}:${completionDate}`,
      task,
      date: iso,
      completionDate,
      time,
      minutes: toMinutes(time),
      timed: task.timed,
      done: done.has(`${task.id}:${completionDate}`),
      isGate: false,
      rolledFrom,
    });
  }

  for (const category of GATE_ORDER) {
    const inCategory = occurrences.filter((o) => !o.timed && !o.task.pin_first && o.task.category === category);
    if (!inCategory.length) continue;
    const gate = inCategory.slice().sort(byImportance)[0];
    gate.isGate = true;
  }

  return occurrences;
}

/**
 * The order to work a day in.
 *
 * Timed tasks come first in clock order — they are fixed appointments and
 * outrank priority. Anytime tasks follow: the music gate, then the app gate,
 * then whatever is left by priority. Completed occurrences drop out entirely.
 *
 * Pass `nowMinutes` when the day being worked is today, to drop timed tasks
 * whose slot has already gone by. Omit it for any other day.
 */
export function dayQueue(occurrences: Occurrence[], nowMinutes?: number): Occurrence[] {
  const pending = occurrences.filter((o) => !o.done);

  const timed = pending
    .filter((o) => o.timed)
    // A timed task drops out once its slot has fully passed. The window is the
    // whole estimate, not the start minute — cutting at the start would hide a
    // task during the very hours it is meant to be worked.
    .filter((o) => nowMinutes === undefined || o.minutes + o.task.estimate_minutes > nowMinutes)
    .sort((a, b) => a.minutes - b.minutes || byImportance(a, b));

  const anytime = pending.filter((o) => !o.timed);

  // Pinned tasks lead everything that is not pinned to a clock, ahead of the
  // category gates. Priority cannot express this on its own.
  const pinned = anytime.filter((o) => o.task.pin_first).sort(byImportance);
  const unpinned = anytime.filter((o) => !o.task.pin_first);

  const gates: Occurrence[] = [];
  for (const category of GATE_ORDER) {
    const gate = unpinned.find((o) => o.isGate && o.task.category === category);
    if (gate) gates.push(gate);
  }
  const rest = unpinned.filter((o) => !o.isGate).sort(byImportance);

  return [...timed, ...pinned, ...gates, ...rest];
}

/**
 * Anytime tasks for a day, most important first. Pinned tasks lead, matching
 * the order the task view works through them.
 */
export function anytimeQueue(occurrences: Occurrence[]): Occurrence[] {
  const anytime = occurrences.filter((o) => !o.timed);
  return [
    ...anytime.filter((o) => o.task.pin_first).sort(byImportance),
    ...anytime.filter((o) => !o.task.pin_first).sort(byImportance),
  ];
}

/** Occurrences for each date in `[from, to]`, keyed by date. */
export function expandRange(
  tasks: Task[],
  from: string,
  to: string,
  done: Set<string>,
  today: string = vnToday(),
  skipped: Set<string> = new Set(),
): Record<string, Occurrence[]> {
  const byDate: Record<string, Occurrence[]> = {};
  for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
    byDate[iso] = occurrencesOn(tasks, iso, done, today, skipped).sort(byTime);
  }
  return byDate;
}

/** Normalize an API row into a Task, filling defaults the UI relies on. */
export function normalizeTask(row: Record<string, unknown>): Task {
  const weekly = row.weekly_times;
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    image_url: (row.image_url as string) ?? null,
    priority: Number(row.priority ?? 5),
    category: (CATEGORIES.includes(row.category as Category) ? row.category : "other") as Category,
    estimate_minutes: Number(row.estimate_minutes ?? 30),
    recurrence: (row.recurrence as Recurrence) ?? "none",
    timed: row.timed !== false, // legacy rows predate the column and were timed
    pin_first: row.pin_first === true,
    start_date: (row.start_date as string) ?? null,
    start_time: (row.start_time as string) ?? DEFAULT_TIME,
    weekly_times: (weekly && typeof weekly === "object" ? weekly : {}) as Record<string, string>,
    monthly_day: (row.monthly_day as number) ?? null,
    yearly_month: (row.yearly_month as number) ?? null,
    yearly_day: (row.yearly_day as number) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}
