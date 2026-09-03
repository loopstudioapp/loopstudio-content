"use client";

import { Clock3, Repeat2, Sparkles, X } from "lucide-react";
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  Occurrence,
  fmtDuration,
  fmtTime,
} from "@/lib/calendar/tasks";

export function MostImportantPrompt({
  conflicting,
  onChoose,
}: {
  conflicting: boolean;
  onChoose: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto rounded-xl border border-[#3a3a3a] bg-[#1f1f1f] px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#22c55e]/10">
        <Sparkles size={20} className="text-[#22c55e]" />
      </div>
      <p className="text-sm font-semibold text-white">Choose your most important task</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-[#8f8f8f]">
        {conflicting
          ? "More than one task is P10. Choose one and the others will move to P9."
          : "Pick the one task to focus on. It will become P10 and stay here until it is done."}
      </p>
      <button
        type="button"
        onClick={onChoose}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#22c55e] px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#16a34a]"
      >
        <Sparkles size={15} /> Choose Most Important
      </button>
    </div>
  );
}

export default function MostImportantChooser({
  candidates,
  savingId,
  error,
  onChoose,
  onClose,
}: {
  candidates: Occurrence[];
  savingId: string | null;
  error: string | null;
  onChoose: (occurrence: Occurrence) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#3a3a3a] bg-[#1f1f1f] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#333] px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-white">Choose Most Important</h2>
            <p className="mt-1 text-xs text-[#8f8f8f]">This task becomes P10. Any other P10 task becomes P9.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={savingId !== null}
            aria-label="Close"
            className="rounded-lg p-2 text-[#8f8f8f] hover:bg-[#2a2a2a] hover:text-white disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-3">
          {error && (
            <div className="mb-3 rounded-lg border border-[#ef4444]/20 bg-[#ef4444]/5 px-3 py-2 text-xs text-[#ef4444]">
              {error}
            </div>
          )}
          <div className="space-y-2">
            {candidates.map((occurrence) => {
              const accent = CATEGORY_COLOR[occurrence.task.category];
              const saving = savingId === occurrence.task.id;
              return (
                <button
                  key={occurrence.key}
                  type="button"
                  onClick={() => onChoose(occurrence)}
                  disabled={savingId !== null}
                  className="flex w-full items-center gap-3 rounded-xl border border-[#333] bg-[#242424] px-4 py-3 text-left transition-colors hover:border-[#555] hover:bg-[#2a2a2a] disabled:opacity-50"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ color: accent, background: `${accent}1a` }}
                  >
                    P{occurrence.task.priority}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {occurrence.task.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#8f8f8f]">
                      <span style={{ color: accent }}>{CATEGORY_LABEL[occurrence.task.category]}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={11} />
                        {occurrence.timed ? fmtTime(occurrence.time) : "Anytime"}
                      </span>
                      <span>{fmtDuration(occurrence.task.estimate_minutes)}</span>
                      {occurrence.task.recurrence !== "none" && (
                        <span className="inline-flex items-center gap-1" style={{ color: accent }}>
                          <Repeat2 size={11} /> Recurring
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-[#22c55e]">
                    {saving ? "Choosing…" : "Choose"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
