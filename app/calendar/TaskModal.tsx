"use client";

import { ImagePlus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  Category,
  DEFAULT_TIME,
  MONTHS,
  Recurrence,
  Task,
  WEEKDAYS,
  daysInMonth,
  vnToday,
} from "@/lib/calendar/tasks";

const REPEATS: { value: Recurrence; label: string }[] = [
  { value: "none", label: "Once" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const MAX_IMAGE_EDGE = 1400;

/** Downscale before upload so a phone photo does not become a 6 MB row. */
function readAndShrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not decode that image"));
      image.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const inputCls =
  "w-full bg-[#0f0f0f] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#404040] transition-colors";
const labelCls = "block text-[10px] uppercase tracking-wider text-[#737373] font-semibold mb-1.5";

export default function TaskModal({
  task,
  defaultDate,
  defaultTime,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: Task | null;
  defaultDate: string;
  defaultTime?: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [category, setCategory] = useState<Category>(task?.category || "other");
  const [priority, setPriority] = useState(task?.priority ?? 5);
  const [estimate, setEstimate] = useState(String(task?.estimate_minutes ?? 30));
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence || "none");
  const [date, setDate] = useState(task?.start_date || defaultDate);
  const [time, setTime] = useState(task?.start_time || defaultTime || DEFAULT_TIME);
  const [weeklyTimes, setWeeklyTimes] = useState<Record<string, string>>(task?.weekly_times || {});
  const [monthlyDay, setMonthlyDay] = useState(String(task?.monthly_day ?? Number(defaultDate.slice(8, 10))));
  const [yearlyMonth, setYearlyMonth] = useState(String(task?.yearly_month ?? Number(defaultDate.slice(5, 7))));
  const [yearlyDay, setYearlyDay] = useState(String(task?.yearly_day ?? Number(defaultDate.slice(8, 10))));
  const [image, setImage] = useState<string | null>(task?.image_url || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleWeekday = (index: number) => {
    setWeeklyTimes((current) => {
      const next = { ...current };
      if (next[String(index)]) delete next[String(index)];
      else next[String(index)] = time || DEFAULT_TIME;
      return next;
    });
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImage(await readAndShrink(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image");
    }
  };

  const save = async () => {
    if (!title.trim()) return setError("Give the task a title");
    if (recurrence === "weekly" && Object.keys(weeklyTimes).length === 0) {
      return setError("Pick at least one weekday");
    }

    setSaving(true);
    setError(null);
    try {
      let imageUrl = image;
      if (image?.startsWith("data:")) {
        const upload = await fetch("/api/calendar/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data_url: image }),
        });
        const uploaded = await upload.json();
        if (!upload.ok) throw new Error(uploaded.error || "Image upload failed");
        imageUrl = uploaded.url;
      }

      const payload = {
        id: task?.id,
        title: title.trim(),
        description,
        image_url: imageUrl,
        category,
        priority,
        estimate_minutes: Number(estimate) || 30,
        recurrence,
        // Recurring tasks keep the date as a "starts from" anchor.
        start_date: date,
        start_time: time,
        weekly_times: weeklyTimes,
        monthly_day: Number(monthlyDay) || 1,
        yearly_month: Number(yearlyMonth) || 1,
        yearly_day: Number(yearlyDay) || 1,
      };

      const response = await fetch("/api/calendar/tasks", {
        method: task ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the task");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the task");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/calendar/tasks?id=${task.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete the task");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the task");
      setSaving(false);
    }
  };

  const yearlyDayMax = daysInMonth(Number(vnToday().slice(0, 4)), Number(yearlyMonth) || 1);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-[#141414] border border-[#262626] rounded-xl w-full max-w-lg my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#262626]">
          <h2 className="text-sm font-semibold text-white">{task ? "Edit task" : "New task"}</h2>
          <button onClick={onClose} className="text-[#737373] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Title</label>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs doing?"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Optional detail"
              className={`${inputCls} resize-none`}
            />
          </div>

          <div>
            <label className={labelCls}>Category</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((value) => (
                <button
                  key={value}
                  onClick={() => setCategory(value)}
                  className="py-2 text-xs rounded-lg border transition-colors"
                  style={
                    category === value
                      ? { borderColor: CATEGORY_COLOR[value], color: CATEGORY_COLOR[value], background: `${CATEGORY_COLOR[value]}14` }
                      : { borderColor: "#262626", color: "#737373" }
                  }
                >
                  {CATEGORY_LABEL[value]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Priority · {priority}</label>
              <input
                type="range"
                min={1}
                max={10}
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="w-full accent-[#22c55e]"
              />
            </div>
            <div>
              <label className={labelCls}>Estimate (min)</label>
              <input
                type="number"
                min={1}
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Repeat</label>
            <div className="grid grid-cols-4 gap-2">
              {REPEATS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setRecurrence(option.value)}
                  className={`py-2 text-xs rounded-lg border transition-colors ${
                    recurrence === option.value
                      ? "border-[#404040] text-white bg-[#1c1c1c]"
                      : "border-[#262626] text-[#737373] hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {recurrence === "none" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Time</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {recurrence === "weekly" && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Days</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((day, index) => {
                    const on = Boolean(weeklyTimes[String(index)]);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleWeekday(index)}
                        className={`py-2 text-[11px] rounded-lg border transition-colors ${
                          on ? "border-[#22c55e] text-[#22c55e] bg-[#22c55e]/10" : "border-[#262626] text-[#737373]"
                        }`}
                      >
                        {day[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Each selected day carries its own time — 6am Monday, 6pm Tuesday. */}
              {Object.keys(weeklyTimes)
                .sort()
                .map((day) => (
                  <div key={day} className="flex items-center gap-3">
                    <span className="text-xs text-[#a3a3a3] w-10">{WEEKDAYS[Number(day)]}</span>
                    <input
                      type="time"
                      value={weeklyTimes[day]}
                      onChange={(event) =>
                        setWeeklyTimes((current) => ({ ...current, [day]: event.target.value }))
                      }
                      className={inputCls}
                    />
                  </div>
                ))}

              <div>
                <label className={labelCls}>Starts from</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {recurrence === "monthly" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Day of month</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={monthlyDay}
                  onChange={(event) => setMonthlyDay(event.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Time</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {recurrence === "yearly" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Month</label>
                <select
                  value={yearlyMonth}
                  onChange={(event) => setYearlyMonth(event.target.value)}
                  className={inputCls}
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Day</label>
                <input
                  type="number"
                  min={1}
                  max={yearlyDayMax}
                  value={yearlyDay}
                  onChange={(event) => setYearlyDay(event.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Time</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Image</label>
            {image ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Task attachment" className="w-full max-h-44 object-cover rounded-lg border border-[#262626]" />
                <button
                  onClick={() => setImage(null)}
                  className="absolute top-2 right-2 bg-black/70 border border-[#333] rounded-lg p-1.5 text-[#a3a3a3] hover:text-white transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 h-20 border border-dashed border-[#262626] rounded-lg text-xs text-[#525252] hover:text-[#a3a3a3] hover:border-[#404040] cursor-pointer transition-colors">
                <ImagePlus size={15} />
                Attach an image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => pickImage(event.target.files?.[0])}
                />
              </label>
            )}
          </div>

          {error && <p className="text-xs text-[#ef4444]">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#262626]">
          {task ? (
            <button
              onClick={remove}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-[#ef4444] border border-[#ef4444]/25 rounded-lg hover:bg-[#ef4444]/10 transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-black bg-[#22c55e] rounded-lg hover:bg-[#16a34a] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : task ? "Save" : "Add task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
