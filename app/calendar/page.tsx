"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FocusView from "./FocusView";
import TaskModal from "./TaskModal";
import {
  CATEGORY_COLOR,
  MONTHS,
  Occurrence,
  Task,
  WEEKDAYS,
  addDays,
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

  // Open the week grid on the working day, not on midnight. Waits for `ready`
  // because the grid is not mounted until the first load resolves.
  useEffect(() => {
    if (ready && view === "week" && gridRef.current) {
      gridRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, [view, ready]);

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

  const focusQueue = useMemo(
    () => dayQueue(occurrencesOn(tasks, selected, done)),
    [tasks, selected, done],
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
    const raw = ((clientY - rect.top) / HOUR_HEIGHT) * 60;
    return Math.max(0, Math.min(24 * 60, Math.round(raw / SNAP) * SNAP));
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
          {(["week", "focus"] as View[]).map((value) => (
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
          <button
            onClick={() => openNew(selected)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-black bg-[#22c55e] rounded-lg hover:bg-[#16a34a] transition-colors"
          >
            <Plus size={13} /> Task
          </button>
        </div>
      </div>

      {!ready && (
        <div className="bg-[#141414] border border-[#262626] rounded-xl h-64 animate-pulse" />
      )}

      {/* ── Week ── */}
      {ready && view === "week" && (
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
                const items = (byDate[date] || []).filter((o) => !o.done);
                const placed = placeDay(items);

                const dragging = drag?.date === date;
                const dragStart = dragging ? Math.min(drag.from, drag.to) : 0;
                const dragSpan = dragging ? Math.max(Math.abs(drag.to - drag.from), MIN_DRAG) : 0;

                return (
                  <div
                    key={date}
                    className="relative border-l border-[#1f1f1f] cursor-pointer select-none"
                    onPointerDown={(event) => startDrag(event, date)}
                    onPointerMove={extendDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <div key={hour} style={{ height: HOUR_HEIGHT }} className="border-b border-[#1a1a1a]" />
                    ))}

                    {dragging && (
                      <div
                        className="absolute left-0.5 right-0.5 rounded-md border border-[#22c55e] bg-[#22c55e]/20 pointer-events-none z-20 px-1.5 py-0.5"
                        style={{ top: (dragStart / 60) * HOUR_HEIGHT, height: (dragSpan / 60) * HOUR_HEIGHT }}
                      >
                        <p className="text-[9px] font-semibold text-[#22c55e] leading-tight">
                          {fmtTime(minutesToTime(dragStart))} – {fmtTime(minutesToTime(dragStart + dragSpan))}
                        </p>
                        <p className="text-[9px] text-[#22c55e]/70 leading-tight">{fmtDuration(dragSpan)}</p>
                      </div>
                    )}

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
                          data-task-block
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
