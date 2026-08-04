"use client";

import { Check, Flag, Pause, Play } from "lucide-react";
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
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = queue[0];
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

  const finish = useCallback(() => {
    if (!current) return;
    setRunning(false);
    onComplete(current);
  }, [current, onComplete]);

  if (!queue.length) {
    return (
      <div className="bg-[#1f1f1f] border border-[#3a3a3a] rounded-xl py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-[#0f2419] flex items-center justify-center mx-auto mb-4">
          <Check size={20} className="text-[#22c55e]" />
        </div>
        <p className="text-white text-sm font-semibold">Everything is done</p>
        <p className="text-[#8f8f8f] text-xs mt-1">No tasks left for this day.</p>
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
      <div className="bg-[#1f1f1f] border border-[#3a3a3a] rounded-xl overflow-hidden">
        {current.task.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.task.image_url} alt="" className="w-full h-40 object-cover border-b border-[#3a3a3a]" />
        )}

        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md"
              style={{ color: accent, background: `${accent}1a` }}
            >
              {CATEGORY_LABEL[current.task.category]}
            </span>
            {current.rolledFrom && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded-md">
                ↷ Carried over
              </span>
            )}
            {current.isGate && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded-md">
                <Flag size={10} /> Must finish first
              </span>
            )}
            <span className="ml-auto text-[11px] text-[#8f8f8f]">
              P{current.task.priority} · {fmtTime(current.time)}
            </span>
          </div>

          <h2 className="text-xl font-bold text-white leading-snug">{current.task.title}</h2>
          {current.task.description && (
            <p className="text-sm text-[#d4d4d4] leading-6 mt-2 whitespace-pre-wrap">{current.task.description}</p>
          )}

          <div className="relative flex items-center justify-center my-8">
            <svg width="200" height="200" className="-rotate-90">
              <circle cx="100" cy="100" r={radius} fill="none" stroke="#3a3a3a" strokeWidth="6" />
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
              <p className="text-[11px] text-[#8f8f8f] mt-1 uppercase tracking-wider">
                {overtime ? "Over estimate" : `of ${fmtDuration(current.task.estimate_minutes)}`}
              </p>
            </div>
          </div>

          <button
            onClick={() => setRunning((value) => !value)}
            className="w-full inline-flex items-center justify-center gap-2 py-3 text-sm font-semibold text-black rounded-lg transition-opacity hover:opacity-90"
            style={{ background: accent }}
          >
            {running ? <><Pause size={15} /> Pause</> : <><Play size={15} /> {elapsed > 0 ? "Resume" : "Start"}</>}
          </button>

          <button
            onClick={finish}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 mt-2 text-xs font-semibold text-[#22c55e] border border-[#22c55e]/30 rounded-lg hover:bg-[#22c55e]/10 transition-colors"
          >
            <Check size={14} /> Done
          </button>
        </div>
      </div>

    </div>
  );
}
