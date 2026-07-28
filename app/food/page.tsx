"use client";

import {
  ArrowRight,
  Brain,
  Camera,
  Check,
  ChevronLeft,
  ImagePlus,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FoodDecision,
  FoodDetection,
  FoodMemory,
  normalizeFoodKey,
  titleCaseFoodName,
} from "@/lib/food";

type Analysis =
  | { status: "known"; detection: FoodDetection; memory: FoodMemory }
  | { status: "unknown"; detection: FoodDetection }
  | { status: "no_food"; detection: FoodDetection };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function decisionCopy(decision: FoodDecision) {
  return decision === "eat"
    ? {
        eyebrow: "Good to go",
        title: "Eat it",
        accent: "#22c55e",
        soft: "bg-[#0d2115]",
        border: "border-[#22c55e]/25",
        icon: Check,
      }
    : {
        eyebrow: "Not this time",
        title: "Skip it",
        accent: "#ef4444",
        soft: "bg-[#251010]",
        border: "border-[#ef4444]/25",
        icon: X,
      };
}

async function prepareImage(file: File): Promise<File> {
  if (file.type === "image/gif" && file.size <= MAX_IMAGE_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the photo.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob) throw new Error("This browser could not prepare the photo.");
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("That photo is still too large. Try a smaller image.");
  }
  return new File([blob], "food.jpg", { type: "image/jpeg" });
}

export default function FoodPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [foodName, setFoodName] = useState("");
  const [history, setHistory] = useState<FoodMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [correctingName, setCorrectingName] = useState(false);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<FoodDecision | null>(null);
  const [reasons, setReasons] = useState("");
  const [dragging, setDragging] = useState(false);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/food/memory", { cache: "no-store" });
    if (response.status === 401) {
      router.push("/");
      return;
    }
    if (!response.ok) return;
    const data = (await response.json()) as { memories?: FoodMemory[] };
    setHistory(data.memories || []);
  }, [router]);

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=1(?:;|$)/);
    if (!hasAdmin) {
      router.push("/");
      return;
    }
    void loadHistory();
  }, [loadHistory, router]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const resetResult = () => {
    setAnalysis(null);
    setFoodName("");
    setDecision(null);
    setReasons("");
    setError("");
  };

  const chooseImage = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError("Use a JPG, PNG, WebP, or GIF image.");
      return;
    }

    try {
      setError("");
      const prepared = await prepareImage(file);
      if (preview) URL.revokeObjectURL(preview);
      setImage(prepared);
      setPreview(URL.createObjectURL(prepared));
      resetResult();
    } catch (imageError) {
      setError(
        imageError instanceof Error ? imageError.message : "I couldn't prepare that photo.",
      );
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void chooseImage(event.target.files?.[0]);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void chooseImage(event.dataTransfer.files?.[0]);
  };

  const removeImage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setImage(null);
    setPreview(null);
    resetResult();
  };

  const analyze = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() && !image) {
      setError("Describe a food or add a photo.");
      return;
    }

    setLoading(true);
    resetResult();
    try {
      const form = new FormData();
      if (text.trim()) form.set("text", text.trim());
      if (image) form.set("image", image);
      const response = await fetch("/api/food/analyze", { method: "POST", body: form });
      const data = (await response.json()) as Analysis & { error?: string };
      if (response.status === 401) {
        router.push("/");
        return;
      }
      if (!response.ok) throw new Error(data.error || "I couldn't check that food.");
      setAnalysis(data);
      setFoodName(data.detection?.food_name || "");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "I couldn't check that food.",
      );
    } finally {
      setLoading(false);
    }
  };

  const saveDecision = async () => {
    if (analysis?.status !== "unknown" || !decision) return;
    const finalFoodName = titleCaseFoodName(foodName);
    if (!finalFoodName) {
      setError("Add the correct food name before saving.");
      return;
    }
    const cleanReason = reasons.trim();
    if (!cleanReason) {
      setError("Add a reason so this memory is useful next time.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/food/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          food_name: finalFoodName,
          normalized_name: finalFoodName,
          aliases: [
            ...analysis.detection.aliases,
            analysis.detection.normalized_name,
          ],
          decision,
          reasons: cleanReason
            .split(/\n|;/)
            .map((reason) => reason.trim())
            .filter(Boolean),
        }),
      });
      const data = (await response.json()) as { memory?: FoodMemory; error?: string };
      if (!response.ok || !data.memory) {
        throw new Error(data.error || "I couldn't save that decision.");
      }
      setAnalysis({
        status: "known",
        detection: {
          ...analysis.detection,
          food_name: data.memory.food_name,
          normalized_name: data.memory.normalized_name,
        },
        memory: data.memory,
      });
      setFoodName(data.memory.food_name);
      setDecision(null);
      setReasons("");
      await loadHistory();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "I couldn't save that decision.");
    } finally {
      setSaving(false);
    }
  };

  const applyFoodNameCorrection = async () => {
    if (!analysis || analysis.status === "no_food") return;
    const correctedName = titleCaseFoodName(foodName);
    const normalizedName = normalizeFoodKey(correctedName);
    if (!correctedName || !normalizedName) {
      setError("Enter the correct food name.");
      return;
    }

    setCorrectingName(true);
    setError("");
    try {
      const response = await fetch(
        `/api/food/memory?name=${encodeURIComponent(correctedName)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        memory?: FoodMemory | null;
        error?: string;
      };
      if (response.status === 401) {
        router.push("/");
        return;
      }
      if (!response.ok) throw new Error(data.error || "I couldn't check that name.");

      const resolvedName = data.memory?.food_name || correctedName;
      const detection: FoodDetection = {
        ...analysis.detection,
        food_name: resolvedName,
        normalized_name: data.memory?.normalized_name || normalizedName,
        aliases: Array.from(
          new Set([
            ...analysis.detection.aliases,
            analysis.detection.normalized_name,
          ]),
        ).filter((alias) => alias !== normalizedName),
        description: "Food name corrected manually.",
        confidence: 1,
      };
      setFoodName(resolvedName);
      setDecision(null);
      setReasons("");
      setAnalysis(
        data.memory
          ? { status: "known", detection, memory: data.memory }
          : { status: "unknown", detection },
      );
      if (data.memory) await loadHistory();
    } catch (correctionError) {
      setError(
        correctionError instanceof Error
          ? correctionError.message
          : "I couldn't check that name.",
      );
    } finally {
      setCorrectingName(false);
    }
  };

  const startOver = () => {
    setText("");
    removeImage();
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-5 text-[#e5e5e5] sm:px-6 sm:py-7">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#a855f7] text-black">
              <Utensils size={17} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">Food memory</h1>
              <p className="text-[11px] text-[#525252]">Your rules, remembered.</p>
            </div>
          </div>
          <Link
            href="/owner"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#262626] px-3 py-1.5 text-xs text-[#737373] transition-colors hover:border-[#404040] hover:text-white"
          >
            <ChevronLeft size={13} />
            Dashboard
          </Link>
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section>
            <div className="mb-7">
              <div className="mb-3 flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#22c55e]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#737373]">
                  Ask before you eat
                </span>
              </div>
              <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                Should I eat this?
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-[#737373]">
                Describe it or take a photo. I&apos;ll identify the food and check what
                you decided last time.
              </p>
            </div>

            <form onSubmit={analyze} className="rounded-2xl border border-[#262626] bg-[#111] p-3">
              <textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  resetResult();
                }}
                maxLength={600}
                rows={3}
                aria-label="Describe the food"
                placeholder="What are you about to eat?"
                className="w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-white outline-none placeholder:text-[#404040]"
              />

              {preview ? (
                <div className="relative mt-2 overflow-hidden rounded-xl border border-[#262626] bg-[#0a0a0a]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Selected food"
                    className="h-52 w-full object-cover sm:h-64"
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    aria-label="Remove photo"
                    className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white backdrop-blur transition-colors hover:bg-black"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`mt-2 flex items-center justify-between rounded-xl border border-dashed px-4 py-3 transition-colors ${
                    dragging
                      ? "border-[#a855f7] bg-[#a855f7]/5"
                      : "border-[#2a2a2a] bg-[#0d0d0d]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#191919] text-[#737373]">
                      <ImagePlus size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs text-[#a3a3a3]">Drop a food photo here</p>
                      <p className="text-[10px] text-[#404040]">JPG, PNG, WebP or GIF</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="ml-3 shrink-0 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-[11px] text-[#a3a3a3] transition-colors hover:border-[#404040] hover:text-white"
                  >
                    Choose
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="environment"
                onChange={onFileChange}
                className="hidden"
              />

              <div className="mt-3 flex items-center justify-between border-t border-[#222] pt-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-2 py-2 text-xs text-[#737373] transition-colors hover:text-white"
                >
                  <Camera size={15} />
                  Photo
                </button>
                <button
                  type="submit"
                  disabled={loading || (!text.trim() && !image)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-black transition-all hover:bg-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={14} className="animate-spin" />
                      Looking…
                    </>
                  ) : (
                    <>
                      Check food
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>

            {error && (
              <div className="mt-4 rounded-xl border border-[#ef4444]/20 bg-[#251010] px-4 py-3 text-xs text-[#ef4444]">
                {error}
              </div>
            )}

            {analysis?.status === "known" && (
              <KnownResult
                detection={analysis.detection}
                memory={analysis.memory}
                foodName={foodName}
                onFoodNameChange={setFoodName}
                onApplyFoodName={applyFoodNameCorrection}
                correctingName={correctingName}
                onReset={startOver}
              />
            )}

            {analysis?.status === "unknown" && (
              <section className="mt-5 overflow-hidden rounded-2xl border border-[#262626] bg-[#111]">
                <div className="border-b border-[#222] p-5 sm:p-6">
                  <div className="mb-4 flex items-center gap-2 text-[#a855f7]">
                    <Sparkles size={14} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                      New food
                    </span>
                  </div>
                  <FoodNameEditor
                    value={foodName}
                    currentName={analysis.detection.food_name}
                    onChange={setFoodName}
                    onApply={applyFoodNameCorrection}
                    busy={correctingName}
                  />
                  <p className="mt-2 text-sm leading-6 text-[#737373]">
                    {analysis.detection.description ||
                      "I found the food, but you haven't made a rule for it yet."}
                  </p>
                </div>

                <div className="p-5 sm:p-6">
                  <p className="mb-3 text-xs font-medium text-[#a3a3a3]">
                    Is this good or bad for you?
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDecision("eat")}
                      className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors ${
                        decision === "eat"
                          ? "border-[#22c55e]/60 bg-[#0d2115] text-[#22c55e]"
                          : "border-[#2a2a2a] text-[#737373] hover:border-[#3a3a3a] hover:text-white"
                      }`}
                    >
                      <Check size={15} />
                      Good for me
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecision("skip")}
                      className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors ${
                        decision === "skip"
                          ? "border-[#ef4444]/60 bg-[#251010] text-[#ef4444]"
                          : "border-[#2a2a2a] text-[#737373] hover:border-[#3a3a3a] hover:text-white"
                      }`}
                    >
                      <X size={15} />
                      Better skip
                    </button>
                  </div>

                  <label className="mt-5 block text-xs font-medium text-[#a3a3a3]">
                    Why?
                    <textarea
                      value={reasons}
                      onChange={(event) => setReasons(event.target.value)}
                      rows={3}
                      maxLength={700}
                      placeholder="One reason per line — e.g. makes me feel good, too much sugar…"
                      className="mt-2 w-full resize-none rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] px-3.5 py-3 text-sm leading-6 text-white outline-none transition-colors placeholder:text-[#404040] focus:border-[#525252]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={saveDecision}
                    disabled={!decision || !reasons.trim() || !foodName.trim() || saving}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-semibold text-black transition-colors hover:bg-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {saving ? (
                      <>
                        <LoaderCircle size={14} className="animate-spin" />
                        Remembering…
                      </>
                    ) : (
                      <>
                        <Brain size={14} />
                        Save to memory
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}

            {analysis?.status === "no_food" && (
              <section className="mt-5 rounded-2xl border border-[#262626] bg-[#111] p-6">
                <p className="text-sm font-medium text-white">I couldn&apos;t find a food.</p>
                <p className="mt-2 text-sm leading-6 text-[#737373]">
                  Try a closer photo, or add a short description of what you&apos;re eating.
                </p>
              </section>
            )}
          </section>

          <aside className="lg:border-l lg:border-[#222] lg:pl-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain size={13} className="text-[#a855f7]" />
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#737373]">
                  Recent memory
                </h2>
              </div>
              <span className="text-[10px] tabular-nums text-[#404040]">{history.length}</span>
            </div>

            <div className="divide-y divide-[#222] border-y border-[#222]">
              {history.map((memory) => (
                <button
                  key={memory.id}
                  type="button"
                  onClick={() => {
                    setText(memory.food_name);
                    setAnalysis(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="group flex w-full items-center justify-between gap-4 py-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[#a3a3a3] transition-colors group-hover:text-white">
                      {memory.food_name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#404040]">
                      Checked {memory.hit_count} {memory.hit_count === 1 ? "time" : "times"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${
                      memory.decision === "eat"
                        ? "bg-[#0d2115] text-[#22c55e]"
                        : "bg-[#251010] text-[#ef4444]"
                    }`}
                  >
                    {memory.decision}
                  </span>
                </button>
              ))}
              {!history.length && (
                <div className="py-7">
                  <p className="text-xs text-[#525252]">Nothing remembered yet.</p>
                  <p className="mt-1 text-[11px] leading-5 text-[#404040]">
                    Your first decision will appear here.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-[#222] bg-[#0d0d0d] p-4">
              <p className="text-[11px] leading-5 text-[#525252]">
                Xiaomi MiMo identifies the food. Your saved rules make the decision.
                Photos are not stored.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function KnownResult({
  detection,
  memory,
  foodName,
  onFoodNameChange,
  onApplyFoodName,
  correctingName,
  onReset,
}: {
  detection: FoodDetection;
  memory: FoodMemory;
  foodName: string;
  onFoodNameChange: (value: string) => void;
  onApplyFoodName: () => void;
  correctingName: boolean;
  onReset: () => void;
}) {
  const copy = decisionCopy(memory.decision);
  const Icon = copy.icon;

  return (
    <section className={`mt-5 overflow-hidden rounded-2xl border ${copy.border} ${copy.soft}`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-4 flex items-center gap-2" style={{ color: copy.accent }}>
              <Icon size={14} strokeWidth={2.5} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                {copy.eyebrow}
              </span>
            </div>
            <FoodNameEditor
              value={foodName}
              currentName={detection.food_name}
              onChange={onFoodNameChange}
              onApply={onApplyFoodName}
              busy={correctingName}
              compact
            />
            <h3 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-white">
              {copy.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onReset}
            aria-label="Check another food"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[#737373] transition-colors hover:text-white"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#525252]">
            Why you decided this
          </p>
          <ul className="space-y-2.5">
            {memory.reasons.map((reason) => (
              <li key={reason} className="flex gap-3 text-sm leading-6 text-[#b3b3b3]">
                <span
                  className="mt-[10px] size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: copy.accent }}
                />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[10px] text-[#525252] sm:px-6">
        <span>From your food memory</span>
        <span className="tabular-nums">
          Seen {memory.hit_count} {memory.hit_count === 1 ? "time" : "times"}
        </span>
      </div>
    </section>
  );
}

function FoodNameEditor({
  value,
  currentName,
  onChange,
  onApply,
  busy,
  compact = false,
}: {
  value: string;
  currentName: string;
  onChange: (value: string) => void;
  onApply: () => void;
  busy: boolean;
  compact?: boolean;
}) {
  const changed =
    normalizeFoodKey(value) !== normalizeFoodKey(currentName) && Boolean(value.trim());

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (changed && !busy) onApply();
      }}
    >
      <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#525252]">
        <Pencil size={10} />
        Food identified · editable
      </label>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(titleCaseFoodName(value))}
          maxLength={100}
          aria-label="Correct food name"
          className={`min-w-0 flex-1 border-b border-[#333] bg-transparent pb-1 text-white outline-none transition-colors placeholder:text-[#404040] focus:border-[#737373] ${
            compact ? "text-sm" : "text-xl font-semibold"
          }`}
        />
        {changed && (
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#404040] px-2.5 text-[10px] font-semibold text-[#a3a3a3] transition-colors hover:border-[#525252] hover:text-white disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={11} className="animate-spin" /> : <Check size={11} />}
            Use name
          </button>
        )}
      </div>
      {!compact && (
        <p className="mt-2 text-[10px] text-[#525252]">
          Change this if the AI identified the wrong food.
        </p>
      )}
    </form>
  );
}
