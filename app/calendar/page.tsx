"use client";

import { Check, ChevronLeft, ChevronRight, Flag, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FocusView from "./FocusView";
import TaskModal from "./TaskModal";
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  MONTHS,
  Occurrence,
  Task,
  WEEKDAYS,
  addDays,
  addMonths,
  byTime,
  dayQueue,
  expandRange,
  fmtDateLong,
  fmtDuration,
  fmtTime,
  normalizeTask,
  occurrencesOn,
  startOfMonthGrid,
  startOfWeek,
  vnNowMinutes,
  vnToday,
} from "@/lib/calendar/tasks";

type View = "month" | "week" | "focus";

const HOUR_HEIGHT = 48;
const btnCls =
  "px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors";

/* ── Week grid overlap packing ── */
type Placed = { occurrence: Occurrence; start: number; end: number; col: number; cols: number };

function placeDay(occurrences: Occurrence[]): Placed[] {
  const events = occurrences
    .map((occurrence) => ({
      occurrence,
      start: occurrence.minutes,
      end: occurrence.minutes + Math.max(occurrence.task.estimate_minutes, 20),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const placed: Placed[] = [];
  let cluster: typeof events = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const columnEnds: number[] = [];
    const assigned = cluster.map((event) => {
      let col = columnEnds.findIndex((end) => end <= event.start);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(event.end);
      } else {
        columnEnds[col] = event.end;
      }
      return { ...event, col };
    });
    assigned.forEach((item) => placed.push({ ...item, cols: columnEnds.length }));
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const event of events) {
    if (cluster.length && event.start >= clusterEnd) flush();
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, event.end);
  }
  flush();
  return placed;
}

export default function CalendarPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(vnToday());
  const [selected, setSelected] = useState(vnToday());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [modal, setModal] = useState<{ task: Task | null; date: string; time?: string } | null>(null);
  const [nowMinutes, setNowMinutes] = useState(vnNowMinutes());
  const gridRef = useRef<HTMLDivElement | null>(null);
  const today = vnToday();

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) router.push("/");
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => setNowMinutes(vnNowMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /* The date span the current view needs loaded. */
  const [rangeFrom, rangeTo] = useMemo((): [string, string] => {
    if (view === "month") {
      const start = startOfMonthGrid(cursor);
      return [start, addDays(start, 41)];
    }
    if (view === "week") {
      const start = startOfWeek(cursor);
      return [start, addDays(start, 6)];
    }
    return [selected, selected];
  }, [view, cursor, selected]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/calendar/tasks?from=${rangeFrom}&to=${rangeTo}`);
      const data = await response.json();
      if (!response.ok) {
        setSetupNeeded(Boolean(data.setup_required));
        throw new Error(data.error || "Could not load tasks");
      }
      setSetupNeeded(false);
      setTasks((data.tasks || []).map(normalizeTask));
      setDone(new Set<string>(data.completions || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    load();
  }, [load]);

  // Open the week grid on the working day, not on midnight.
  useEffect(() => {
    if (view === "week" && gridRef.current) {
      gridRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, [view]);

  const toggleDone = useCallback(
    async (occurrence: Occurrence) => {
      const wasDone = done.has(occurrence.key);
      setDone((current) => {
        const next = new Set(current);
        if (wasDone) next.delete(occurrence.key);
        else next.add(occurrence.key);
        return next;
      });

      try {
        const response = wasDone
          ? await fetch(
              `/api/calendar/complete?task_id=${occurrence.task.id}&occurrence_date=${occurrence.date}`,
              { method: "DELETE" },
            )
          : await fetch("/api/calendar/complete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ task_id: occurrence.task.id, occurrence_date: occurrence.date }),
            });
        if (!response.ok) throw new Error();
      } catch {
        // Roll the optimistic update back if the write did not land.
        setDone((current) => {
          const next = new Set(current);
          if (wasDone) next.add(occurrence.key);
          else next.delete(occurrence.key);
          return next;
        });
        setError("Could not save that change");
      }
    },
    [done],
  );

  const byDate = useMemo(
    () => expandRange(tasks, rangeFrom, rangeTo, done),
    [tasks, rangeFrom, rangeTo, done],
  );

  const selectedOccurrences = useMemo(
    () => occurrencesOn(tasks, selected, done).sort(byTime),
    [tasks, selected, done],
  );

  const focusQueue = useMemo(
    () => dayQueue(occurrencesOn(tasks, selected, done)),
    [tasks, selected, done],
  );

  const step = (direction: number) => {
    if (view === "month") setCursor(addMonths(cursor, direction));
    else if (view === "week") setCursor(addDays(cursor, direction * 7));
    else setSelected(addDays(selected, direction));
  };

  const goToday = () => {
    setCursor(today);
    setSelected(today);
  };

  const title =
    view === "focus"
      ? fmtDateLong(selected)
      : view === "week"
        ? `${MONTHS[Number(startOfWeek(cursor).slice(5, 7)) - 1]} ${startOfWeek(cursor).slice(0, 4)}`
        : `${MONTHS[Number(cursor.slice(5, 7)) - 1]} ${cursor.slice(0, 4)}`;

  /** Clicking an empty slot seeds the form with that day and hour. */
  const openNew = (date: string, hour?: number) => {
    setSelected(date);
    setModal({ task: null, date, time: hour === undefined ? undefined : `${String(hour).padStart(2, "0")}:00` });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Calendar</h1>
          <p className="text-xs text-[#525252]">Tasks &amp; schedule · GMT+7</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/owner" className={btnCls}>Owner</Link>
          <Link href="/portfolio" className={btnCls}>Portfolio</Link>
        </div>
      </div>

      {setupNeeded && (
        <div className="bg-[#141414] border border-[#f59e0b]/25 rounded-xl p-4 mb-5">
          <p className="text-[#f59e0b] text-sm font-semibold">Database setup required</p>
          <p className="text-[#a3a3a3] text-xs mt-1 leading-5">
            Run <code className="text-white">supabase/migrations/20260804_calendar_tasks.sql</code> in the Supabase SQL editor, then reload.
          </p>
        </div>
      )}

      {error && !setupNeeded && (
        <div className="bg-[#141414] border border-[#ef4444]/20 rounded-xl p-4 text-[#ef4444] text-sm mb-5">
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center border border-[#262626] rounded-lg overflow-hidden">
          {(["month", "week", "focus"] as View[]).map((value) => (
            <button
              key={value}
              onClick={() => setView(value)}
              className={`px-3 py-1.5 text-xs capitalize transition-colors ${
                view === value ? "bg-[#1c1c1c] text-white" : "text-[#737373] hover:text-white"
              }`}
            >
              {value === "focus" ? "Task" : value}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="p-1.5 text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            <ChevronLeft size={14} />
          </button>
          <button onClick={goToday} className={btnCls}>Today</button>
          <button onClick={() => step(1)} className="p-1.5 text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>

        <h2 className="text-sm font-semibold text-white ml-1">{title}</h2>

        <div className="ml-auto flex items-center gap-2">
          {view !== "focus" && (
            <button
              onClick={() => setShowDone((value) => !value)}
              className={`px-3 py-1.5 text-xs border rounded-lg transition-colors ${
                showDone ? "border-[#404040] text-white" : "border-[#262626] text-[#737373] hover:text-white"
              }`}
            >
              {showDone ? "Hide done" : "Show done"}
            </button>
          )}
          <button
            onClick={() => openNew(selected)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-black bg-[#22c55e] rounded-lg hover:bg-[#16a34a] transition-colors"
          >
            <Plus size={13} /> Task
          </button>
        </div>
      </div>

      {loading && !tasks.length && (
        <div className="bg-[#141414] border border-[#262626] rounded-xl h-64 animate-pulse" />
      )}

      {/* ── Month ── */}
      {view === "month" && (
        <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#262626]">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-2 text-center text-[10px] uppercase tracking-wider text-[#525252] font-semibold">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, offset) => {
              const date = addDays(rangeFrom, offset);
              const inMonth = date.slice(0, 7) === cursor.slice(0, 7);
              const isToday = date === today;
              const isSelected = date === selected;
              const items = (byDate[date] || []).filter((o) => showDone || !o.done);

              return (
                <button
                  key={date}
                  onClick={() => setSelected(date)}
                  onDoubleClick={() => openNew(date)}
                  className={`min-h-[86px] sm:min-h-[104px] flex flex-col items-start text-left p-1.5 border-b border-r border-[#1f1f1f] transition-colors hover:bg-[#181818] ${
                    isSelected ? "bg-[#181818]" : ""
                  }`}
                  style={{ opacity: inMonth ? 1 : 0.35 }}
                >
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 text-[11px] rounded-full mb-1 ${
                      isToday ? "bg-[#22c55e] text-black font-bold" : isSelected ? "text-white font-semibold" : "text-[#737373]"
                    }`}
                  >
                    {Number(date.slice(8, 10))}
                  </span>
                  <div className="w-full space-y-0.5">
                    {items.slice(0, 3).map((occurrence) => (
                      <div key={occurrence.key} className="flex items-center gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: CATEGORY_COLOR[occurrence.task.category] }}
                        />
                        <span
                          className={`text-[10px] truncate ${occurrence.done ? "text-[#525252] line-through" : "text-[#a3a3a3]"}`}
                        >
                          {occurrence.task.title}
                        </span>
                      </div>
                    ))}
                    {items.length > 3 && (
                      <p className="text-[10px] text-[#525252] pl-2.5">+{items.length - 3} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Week ── */}
      {view === "week" && (
        <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
          <div className="grid border-b border-[#262626]" style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}>
            <div />
            {Array.from({ length: 7 }, (_, offset) => {
              const date = addDays(rangeFrom, offset);
              const isToday = date === today;
              return (
                <button
                  key={date}
                  onClick={() => setSelected(date)}
                  className={`py-2 text-center transition-colors hover:bg-[#181818] ${date === selected ? "bg-[#181818]" : ""}`}
                >
                  <p className="text-[10px] uppercase tracking-wider text-[#525252]">{WEEKDAYS[offset]}</p>
                  <p className={`text-sm font-semibold ${isToday ? "text-[#22c55e]" : "text-white"}`}>
                    {Number(date.slice(8, 10))}
                  </p>
                </button>
              );
            })}
          </div>

          <div ref={gridRef} className="overflow-y-auto max-h-[560px]">
            <div className="grid relative" style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}>
              {/* Hour gutter */}
              <div>
                {Array.from({ length: 24 }, (_, hour) => (
                  <div key={hour} style={{ height: HOUR_HEIGHT }} className="relative">
                    <span className="absolute -top-1.5 right-1.5 text-[9px] text-[#525252]">
                      {hour === 0 ? "" : `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "am" : "pm"}`}
                    </span>
                  </div>
                ))}
              </div>

              {Array.from({ length: 7 }, (_, offset) => {
                const date = addDays(rangeFrom, offset);
                const items = (byDate[date] || []).filter((o) => showDone || !o.done);
                const placed = placeDay(items);

                return (
                  <div key={date} className="relative border-l border-[#1f1f1f]">
                    {Array.from({ length: 24 }, (_, hour) => (
                      <div
                        key={hour}
                        onClick={() => openNew(date, hour)}
                        style={{ height: HOUR_HEIGHT }}
                        className="border-b border-[#1a1a1a] hover:bg-[#181818] transition-colors cursor-pointer"
                      />
                    ))}

                    {date === today && (
                      <div
                        className="absolute left-0 right-0 pointer-events-none z-10"
                        style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                      >
                        <div className="h-px bg-[#ef4444]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444] -mt-[3px]" />
                      </div>
                    )}

                    {placed.map(({ occurrence, col, cols }) => {
                      const accent = CATEGORY_COLOR[occurrence.task.category];
                      const height = Math.max(20, (occurrence.task.estimate_minutes / 60) * HOUR_HEIGHT);
                      return (
                        <button
                          key={occurrence.key}
                          onClick={() => { setSelected(date); setModal({ task: occurrence.task, date }); }}
                          className="absolute rounded-md px-1.5 py-0.5 text-left overflow-hidden transition-opacity hover:opacity-80"
                          style={{
                            top: (occurrence.minutes / 60) * HOUR_HEIGHT,
                            height,
                            left: `calc(${(col / cols) * 100}% + 2px)`,
                            width: `calc(${100 / cols}% - 4px)`,
                            background: `${accent}22`,
                            borderLeft: `2px solid ${accent}`,
                            opacity: occurrence.done ? 0.4 : 1,
                          }}
                        >
                          <p
                            className={`text-[10px] font-medium leading-tight truncate ${
                              occurrence.done ? "text-[#737373] line-through" : "text-white"
                            }`}
                          >
                            {occurrence.task.title}
                          </p>
                          {height > 30 && (
                            <p className="text-[9px] text-[#a3a3a3] truncate">{fmtTime(occurrence.time)}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Day agenda (shared by month + week) ── */}
      {view !== "focus" && (
        <section className="mt-6">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">
              {selected === today ? "Today" : fmtDateLong(selected)}
            </h2>
            <button onClick={() => openNew(selected)} className="text-[10px] text-[#525252] hover:text-white transition-colors">
              + add
            </button>
          </div>

          <div className="space-y-1.5">
            {selectedOccurrences.filter((o) => showDone || !o.done).map((occurrence) => {
              const accent = CATEGORY_COLOR[occurrence.task.category];
              return (
                <div
                  key={occurrence.key}
                  className="flex items-center gap-3 bg-[#141414] border border-[#262626] rounded-lg px-3 py-2.5"
                  style={{ opacity: occurrence.done ? 0.5 : 1 }}
                >
                  <button
                    onClick={() => toggleDone(occurrence)}
                    title={occurrence.done ? "Mark not done" : "Mark done"}
                    className="w-5 h-5 rounded-full border shrink-0 flex items-center justify-center transition-colors"
                    style={{
                      borderColor: occurrence.done ? "#22c55e" : "#404040",
                      background: occurrence.done ? "#22c55e" : "transparent",
                    }}
                  >
                    {occurrence.done && <Check size={12} className="text-black" />}
                  </button>

                  <button
                    onClick={() => setModal({ task: occurrence.task, date: selected })}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm truncate ${occurrence.done ? "text-[#737373] line-through" : "text-white"}`}
                      >
                        {occurrence.task.title}
                      </span>
                      {occurrence.isGate && !occurrence.done && (
                        <Flag size={11} className="text-[#f59e0b] shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#525252]">
                      <span style={{ color: accent }}>{CATEGORY_LABEL[occurrence.task.category]}</span>
                      <span>·</span>
                      <span>{fmtTime(occurrence.time)}</span>
                      <span>·</span>
                      <span>{fmtDuration(occurrence.task.estimate_minutes)}</span>
                      <span>·</span>
                      <span>P{occurrence.task.priority}</span>
                    </div>
                  </button>
                </div>
              );
            })}

            {!selectedOccurrences.filter((o) => showDone || !o.done).length && (
              <div className="bg-[#141414] border border-[#262626] rounded-lg py-8 text-center text-xs text-[#525252]">
                Nothing scheduled.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Focus ── */}
      {view === "focus" && (
        <FocusView
          queue={focusQueue}
          onComplete={(occurrence) => toggleDone(occurrence)}
        />
      )}

      {modal && (
        <TaskModal
          task={modal.task}
          defaultDate={modal.date}
          defaultTime={modal.time}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
          onDeleted={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
