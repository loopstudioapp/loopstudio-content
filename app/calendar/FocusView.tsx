"use client";

import { Check, Flag, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  Occurrence,
  fmtDuration,
  fmtTime,
} from "@/lib/calendar/tasks";

function clock(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const abs = Math.abs(totalSeconds);
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${sign}${hours}:${mm}:${ss}` : `${sign}${mm}:${ss}`;
}

export default function FocusView({
  queue,
  onComplete,
}: {
  queue: Occurrence[];
  onComplete: (occurrence: Occurrence) => void;
}) {
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = queue[Math.min(index, Math.max(queue.length - 1, 0))];
  const currentKey = current?.key;

  // A different task means a fresh timer.
  useEffect(() => {
    setRunning(false);
    setElapsed(0);
  }, [currentKey]);

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [running]);

  // Keep the pointer inside the queue as tasks are completed out of it.
  useEffect(() => {
    if (index > 0 && index >= queue.length) setIndex(Math.max(0, queue.length - 1));
  }, [queue.length, index]);

  const finish = useCallback(() => {
    if (!current) return;
    setRunning(false);
    onComplete(current);
  }, [current, onComplete]);

  if (!queue.length) {
    return (
      <div className="bg-[#141414] border border-[#262626] rounded-xl py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-[#0f2419] flex items-center justify-center mx-auto mb-4">
          <Check size={20} className="text-[#22c55e]" />
        </div>
        <p className="text-white text-sm font-semibold">Everything is done</p>
        <p className="text-[#525252] text-xs mt-1">No tasks left for this day.</p>
      </div>
    );
  }

  const total = current.task.estimate_minutes * 60;
  const remaining = total - elapsed;
  const overtime = remaining < 0;
  const progress = Math.min(1, elapsed / Math.max(total, 1));
  const accent = CATEGORY_COLOR[current.task.category];

  // Ring geometry
  const radius = 92;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
        {current.task.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.task.image_url} alt="" className="w-full h-40 object-cover border-b border-[#262626]" />
        )}

        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md"
              style={{ color: accent, background: `${accent}1a` }}
            >
              {CATEGORY_LABEL[current.task.category]}
            </span>
            {current.isGate && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded-md">
                <Flag size={10} /> Must finish first
              </span>
            )}
            <span className="ml-auto text-[10px] text-[#525252]">
              P{current.task.priority} · {fmtTime(current.time)}
            </span>
          </div>

          <h2 className="text-xl font-bold text-white leading-snug">{current.task.title}</h2>
          {current.task.description && (
            <p className="text-sm text-[#a3a3a3] leading-6 mt-2 whitespace-pre-wrap">{current.task.description}</p>
          )}

          <div className="relative flex items-center justify-center my-8">
            <svg width="200" height="200" className="-rotate-90">
              <circle cx="100" cy="100" r={radius} fill="none" stroke="#262626" strokeWidth="6" />
              <circle
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={overtime ? "#ef4444" : accent}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p
                className="text-4xl font-bold tabular-nums"
                style={{ color: overtime ? "#ef4444" : "#ffffff" }}
              >
                {clock(remaining)}
              </p>
              <p className="text-[10px] text-[#525252] mt-1 uppercase tracking-wider">
                {overtime ? "Over estimate" : `of ${fmtDuration(current.task.estimate_minutes)}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setRunning((value) => !value)}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 text-sm font-semibold text-black rounded-lg transition-opacity hover:opacity-90"
              style={{ background: accent }}
            >
              {running ? <><Pause size={15} /> Pause</> : <><Play size={15} /> {elapsed > 0 ? "Resume" : "Start"}</>}
            </button>
            <button
              onClick={() => { setRunning(false); setElapsed(0); }}
              title="Reset timer"
              className="px-3 py-3 text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
            >
              <RotateCcw size={15} />
            </button>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={finish}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-[#22c55e] border border-[#22c55e]/30 rounded-lg hover:bg-[#22c55e]/10 transition-colors"
            >
              <Check size={14} /> Done
            </button>
            {queue.length > 1 && (
              <button
                onClick={() => setIndex((value) => (value + 1) % queue.length)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
              >
                <SkipForward size={14} /> Skip
              </button>
            )}
          </div>
        </div>
      </div>

      {queue.length > 1 && (
        <div className="mt-5">
          <p className="text-[10px] uppercase tracking-wider text-[#525252] font-semibold mb-2">
            Up next · {queue.length - 1} left
          </p>
          <div className="space-y-1.5">
            {queue.slice(index + 1, index + 5).map((occurrence) => (
              <div
                key={occurrence.key}
                className="flex items-center gap-2.5 bg-[#141414] border border-[#262626] rounded-lg px-3 py-2"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: CATEGORY_COLOR[occurrence.task.category] }}
                />
                <span className="text-xs text-[#a3a3a3] truncate flex-1">{occurrence.task.title}</span>
                {occurrence.isGate && <Flag size={11} className="text-[#f59e0b] shrink-0" />}
                <span className="text-[10px] text-[#525252] shrink-0">
                  {fmtDuration(occurrence.task.estimate_minutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
