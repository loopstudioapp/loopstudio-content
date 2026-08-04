"use client";

import { ChevronLeft, ChevronRight, Flag, Plus } from "lucide-react";
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
  anytimeQueue,
  dayQueue,
  expandRange,
  fmtDateLong,
  fmtDuration,
  fmtTime,
  minutesToTime,
  normalizeTask,
  occurrencesOn,
  startOfWeek,
  vnNowMinutes,
  vnToday,
} from "@/lib/calendar/tasks";

type View = "week" | "focus";

const HOUR_HEIGHT = 60;
// The grid starts at 07:00 — the small hours are sleep time and just added
// dead space. Everything vertical is measured from here.
const DAY_START_HOUR = 7;
const DAY_START_MIN = DAY_START_HOUR * 60;
const GRID_HOURS = 24 - DAY_START_HOUR;
/** Minute of day -> pixels from the top of the grid. */
const yOf = (minutes: number) => ((minutes - DAY_START_MIN) / 60) * HOUR_HEIGHT;
const BLOCK_GAP = 4; // vertical breathing room between back-to-back blocks
const btnCls =
  "px-3 py-1.5 text-xs text-[#b0b0b0] border border-[#3a3a3a] rounded-lg hover:text-white transition-colors";

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
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(vnToday());
  const [selected, setSelected] = useState(vnToday());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Only the very first load gets a skeleton. Later refetches (switching views,
  // paging weeks) keep the current content on screen instead of flashing.
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [modal, setModal] = useState<{ task: Task | null; date: string; time?: string; estimate?: number } | null>(null);
  const [nowMinutes, setNowMinutes] = useState(vnNowMinutes());
  // Live drag-to-create selection on the week grid. The ref is the source of
  // truth so a fast drag cannot outrun a state commit; the state only drives
  // the preview render.
  type DragSel = { date: string; from: number; to: number };
  const [drag, setDrag] = useState<DragSel | null>(null);
  const dragRef = useRef<DragSel | null>(null);
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
      setReady(true);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    load();
  }, [load]);

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
              `/api/calendar/complete?task_id=${occurrence.task.id}&occurrence_date=${occurrence.completionDate}`,
              { method: "DELETE" },
            )
          : await fetch("/api/calendar/complete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ task_id: occurrence.task.id, occurrence_date: occurrence.completionDate }),
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
    () => expandRange(tasks, rangeFrom, rangeTo, done, today),
    [tasks, rangeFrom, rangeTo, done, today],
  );

  const anytimeList = useMemo(
    () => anytimeQueue(occurrencesOn(tasks, selected, done, today)).filter((o) => !o.done),
    [tasks, selected, done, today],
  );

  const focusQueue = useMemo(
    () => dayQueue(occurrencesOn(tasks, selected, done, today)),
    [tasks, selected, done, today],
  );

  const step = (direction: number) => {
    if (view === "week") setCursor(addDays(cursor, direction * 7));
    else setSelected(addDays(selected, direction));
  };

  const goToday = () => {
    setCursor(today);
    setSelected(today);
  };

  const title =
    view === "focus"
      ? fmtDateLong(selected)
      : `${MONTHS[Number(startOfWeek(cursor).slice(5, 7)) - 1]} ${startOfWeek(cursor).slice(0, 4)}`;

  /* ── Drag-to-create on the week grid ── */
  const SNAP = 15; // minutes
  const MIN_DRAG = 15;

  /** Pointer Y within a day column -> minute of day, snapped to the grid. */
  const minuteAt = (element: HTMLElement, clientY: number) => {
    const rect = element.getBoundingClientRect();
    const raw = DAY_START_MIN + ((clientY - rect.top) / HOUR_HEIGHT) * 60;
    return Math.max(DAY_START_MIN, Math.min(24 * 60, Math.round(raw / SNAP) * SNAP));
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>, date: string) => {
    // Let touch scroll the grid, and never hijack a click on an existing block.
    if (event.pointerType === "touch") return;
    if ((event.target as HTMLElement).closest("[data-task-block]")) return;
    const at = minuteAt(event.currentTarget, event.clientY);
    // Keeps events flowing to this column even if the cursor drifts out of it.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer already released; the drag still works without capture.
    }
    const next = { date, from: at, to: at };
    dragRef.current = next;
    setDrag(next);
  };

  const extendDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const next = { ...dragRef.current, to: minuteAt(event.currentTarget, event.clientY) };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const start = Math.min(current.from, current.to);
    const span = Math.abs(current.to - current.from);
    const date = current.date;
    dragRef.current = null;
    setDrag(null);
    // A tap with no movement keeps the default estimate.
    openNew(date, start, span >= MIN_DRAG ? span : undefined);
  };

  /**
   * Seeds the form from the grid. A drag supplies both the start minute and the
   * duration; a plain click supplies only the start and keeps the default
   * estimate.
   */
  const openNew = (date: string, startMinutes?: number, durationMinutes?: number) => {
    setSelected(date);
    setModal({
      task: null,
      date,
      time: startMinutes === undefined ? undefined : minutesToTime(startMinutes),
      estimate: durationMinutes,
    });
  };

  return (
    <div className="min-h-screen bg-[#161616] p-4 sm:p-6 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Calendar</h1>
          <p className="text-xs text-[#8f8f8f]">Tasks &amp; schedule · GMT+7</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/owner" className={btnCls}>Owner</Link>
          <Link href="/portfolio" className={btnCls}>Portfolio</Link>
        </div>
      </div>

      {setupNeeded && (
        <div className="bg-[#1f1f1f] border border-[#f59e0b]/25 rounded-xl p-4 mb-5">
          <p className="text-[#f59e0b] text-sm font-semibold">Database setup required</p>
          <p className="text-[#d4d4d4] text-xs mt-1 leading-5">
            Run <code className="text-white">supabase/migrations/20260804_calendar_tasks.sql</code> in the Supabase SQL editor, then reload.
          </p>
        </div>
      )}

      {error && !setupNeeded && (
        <div className="bg-[#1f1f1f] border border-[#ef4444]/20 rounded-xl p-4 text-[#ef4444] text-sm mb-5">
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center border border-[#3a3a3a] rounded-lg overflow-hidden">
          {(["week", "focus"] as View[]).map((value) => (
            <button
              key={value}
              onClick={() => setView(value)}
              className={`px-3 py-1.5 text-xs capitalize transition-colors ${
                view === value ? "bg-[#2a2a2a] text-white" : "text-[#b0b0b0] hover:text-white"
              }`}
            >
              {value === "focus" ? "Task" : value}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="p-1.5 text-[#b0b0b0] border border-[#3a3a3a] rounded-lg hover:text-white transition-colors">
            <ChevronLeft size={14} />
          </button>
          <button onClick={goToday} className={btnCls}>Today</button>
          <button onClick={() => step(1)} className="p-1.5 text-[#b0b0b0] border border-[#3a3a3a] rounded-lg hover:text-white transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>

        <h2 className="text-sm font-semibold text-white ml-1">{title}</h2>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => openNew(selected)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-black bg-[#22c55e] rounded-lg hover:bg-[#16a34a] transition-colors"
          >
            <Plus size={13} /> Task
          </button>
        </div>
      </div>

      {!ready && (
        <div className="bg-[#1f1f1f] border border-[#3a3a3a] rounded-xl h-64 animate-pulse" />
      )}

      {/* ── Week ── */}
      {ready && view === "week" && (
        <div className="bg-[#1f1f1f] border border-[#3a3a3a] rounded-xl overflow-hidden">
          <div className="grid border-b border-[#3a3a3a]" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            <div />
            {Array.from({ length: 7 }, (_, offset) => {
              const date = addDays(rangeFrom, offset);
              const isToday = date === today;
              return (
                <button
                  key={date}
                  onClick={() => setSelected(date)}
                  className={`py-2 text-center transition-colors hover:bg-[#282828] ${date === selected ? "bg-[#282828]" : ""}`}
                >
                  <p className="text-[11px] uppercase tracking-wider text-[#8f8f8f]">{WEEKDAYS[offset]}</p>
                  <p className={`text-sm font-semibold ${isToday ? "text-[#22c55e]" : "text-white"}`}>
                    {Number(date.slice(8, 10))}
                  </p>
                </button>
              );
            })}
          </div>

          <div ref={gridRef} className="overflow-y-auto h-[calc(100vh-19rem)] min-h-[420px]">
            <div className="grid relative" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              {/* Hour gutter */}
              <div>
                {Array.from({ length: GRID_HOURS }, (_, index) => index + DAY_START_HOUR).map((hour) => (
                  <div key={hour} style={{ height: HOUR_HEIGHT }} className="relative">
                    <span className="absolute -top-1.5 right-1.5 text-[10px] text-[#8f8f8f]">
                      {hour === 0 ? "" : `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "am" : "pm"}`}
                    </span>
                  </div>
                ))}
              </div>

              {Array.from({ length: 7 }, (_, offset) => {
                const date = addDays(rangeFrom, offset);
                const items = (byDate[date] || []).filter((o) => !o.done && o.timed);
                const placed = placeDay(items);

                const dragging = drag?.date === date;
                const dragStart = dragging ? Math.min(drag.from, drag.to) : 0;
                const dragSpan = dragging ? Math.max(Math.abs(drag.to - drag.from), MIN_DRAG) : 0;

                return (
                  <div
                    key={date}
                    className="relative border-l border-[#333] cursor-pointer select-none"
                    onPointerDown={(event) => startDrag(event, date)}
                    onPointerMove={extendDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
                  >
                    {Array.from({ length: GRID_HOURS }, (_, hour) => (
                      <div key={hour} style={{ height: HOUR_HEIGHT }} className="border-b border-[#2e2e2e]" />
                    ))}

                    {dragging && (
                      <div
                        className="absolute left-0.5 right-0.5 rounded-md border border-[#22c55e] bg-[#22c55e]/20 pointer-events-none z-20 px-1.5 py-0.5"
                        style={{ top: yOf(dragStart), height: (dragSpan / 60) * HOUR_HEIGHT }}
                      >
                        <p className="text-[10px] font-semibold text-[#22c55e] leading-tight">
                          {fmtTime(minutesToTime(dragStart))} – {fmtTime(minutesToTime(dragStart + dragSpan))}
                        </p>
                        <p className="text-[10px] text-[#22c55e]/70 leading-tight">{fmtDuration(dragSpan)}</p>
                      </div>
                    )}

                    {date === today && nowMinutes >= DAY_START_MIN && (
                      <div
                        className="absolute left-0 right-0 pointer-events-none z-10"
                        style={{ top: yOf(nowMinutes) }}
                      >
                        <div className="h-px bg-[#ef4444]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444] -mt-[3px]" />
                      </div>
                    )}

                    {placed.map(({ occurrence, col, cols }) => {
                      const accent = CATEGORY_COLOR[occurrence.task.category];
                      const startY = yOf(occurrence.minutes);
                      const fullHeight = (occurrence.task.estimate_minutes / 60) * HOUR_HEIGHT;
                      // A task that runs into the hidden pre-dawn hours is
                      // clipped to the visible part; one that ends before the
                      // grid starts is left off it entirely and lives in the
                      // task view instead.
                      if (startY + fullHeight <= 0) return null;
                      const top = Math.max(0, startY);
                      const height = Math.max(18, startY + fullHeight - top - BLOCK_GAP);
                      return (
                        <button
                          key={occurrence.key}
                          data-task-block
                          onClick={() => { setSelected(date); setModal({ task: occurrence.task, date }); }}
                          className="absolute rounded-md px-1.5 py-0.5 flex flex-col items-start text-left overflow-hidden transition-[filter] hover:brightness-125"
                          style={{
                            top,
                            height,
                            left: `calc(${(col / cols) * 100}% + 2px)`,
                            width: `calc(${100 / cols}% - 4px)`,
                            // Sits on #141414, so the fill stays dark and the
                            // outline does the work of separating neighbours.
                            background: `${accent}3d`,
                            border: `1px solid ${accent}cc`,
                            borderLeft: `3px solid ${accent}`,
                            boxShadow: "0 1px 4px rgba(0,0,0,0.55)",
                            opacity: occurrence.done ? 0.4 : 1,
                          }}
                        >
                          <p
                            className={`w-full text-[11px] font-medium leading-tight truncate ${
                              occurrence.done ? "text-[#b0b0b0] line-through" : "text-white"
                            }`}
                          >
                            {occurrence.rolledFrom && <span className="text-[#f59e0b]">↷ </span>}
                            {occurrence.task.title}
                          </p>
                          {height > 30 && (
                            <p className="w-full text-[10px] text-[#d4d4d4] truncate">{fmtTime(occurrence.time)}</p>
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

      {/* ── Anytime tasks for the selected day ── */}
      {ready && view === "week" && (
        <section className="mt-6">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold text-[#8a8a8a] uppercase tracking-wider">
              Anytime · {selected === today ? "today" : fmtDateLong(selected)}
            </h2>
            <span className="text-[11px] text-[#6b6b6b]">by priority</span>
          </div>

          {anytimeList.length ? (
            <div className="space-y-1.5">
              {anytimeList.map((occurrence) => {
                const accent = CATEGORY_COLOR[occurrence.task.category];
                return (
                  <div
                    key={occurrence.key}
                    className="flex items-center gap-3 bg-[#2a2a2a] border border-[#333] rounded-lg px-3 py-2.5"
                  >
                    <button
                      onClick={() => toggleDone(occurrence)}
                      title="Mark done"
                      className="w-5 h-5 rounded-full border border-[#555] shrink-0 hover:border-[#22c55e] transition-colors"
                    />
                    <button
                      onClick={() => setModal({ task: occurrence.task, date: selected })}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white truncate">
                          {occurrence.rolledFrom && <span className="text-[#fbbf24]">↷ </span>}
                          {occurrence.task.title}
                        </span>
                        {occurrence.isGate && <Flag size={12} className="text-[#fbbf24] shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#8a8a8a]">
                        <span style={{ color: accent }}>{CATEGORY_LABEL[occurrence.task.category]}</span>
                        <span>·</span>
                        <span>{fmtDuration(occurrence.task.estimate_minutes)}</span>
                        <span>·</span>
                        <span>P{occurrence.task.priority}</span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#2a2a2a] border border-[#333] rounded-lg py-6 text-center text-xs text-[#6b6b6b]">
              No anytime tasks.
            </div>
          )}
        </section>
      )}

      {/* ── Focus ── */}
      {ready && view === "focus" && (
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
          defaultEstimate={modal.estimate}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
          onDeleted={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
