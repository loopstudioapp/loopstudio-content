"use client";

import { useState, useCallback } from "react";
import { pick, pickN } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { SPACE_TYPES, HOME_STYLES as A1_HOME_STYLES, FLOORINGS, LIGHTINGS as A1_LIGHTINGS, VIBES, A1_TITLES, A1_CAPTIONS } from "@/lib/prompts/angle1";
import { ROOM_TYPES, ROOM_CONDITIONS, ROOM_DETAILS, REMODEL_STYLES, A2_TITLES, A2_CAPTIONS, HOME_STYLES as A2_HOME_STYLES, LIGHTINGS as A2_LIGHTINGS } from "@/lib/prompts/angle2";
import { HASHTAGS } from "@/lib/prompts/shared";

type Prompt = { text: string; tags: { label: string; color: string }[] };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useLang();
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={copy}
      className="w-full mt-2 py-2.5 text-sm font-semibold rounded-lg transition-colors border"
      style={{
        background: copied ? "#16a34a" : "#1a1a1a",
        color: copied ? "#fff" : "#a3a3a3",
        borderColor: "#333",
      }}
    >
      {copied ? t("copied") : t("copyToClipboard")}
    </button>
  );
}

function PromptDisplay({ prompt }: { prompt: Prompt }) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {prompt.tags.map((tag, i) => (
          <span
            key={i}
            className="text-[11px] px-2 py-0.5 rounded"
            style={{
              background: tag.color + "18",
              color: tag.color,
              border: `1px solid ${tag.color}33`,
            }}
          >
            {tag.label}
          </span>
        ))}
      </div>
      <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap text-[#d4d4d4]">
        {prompt.text}
      </div>
      <CopyButton text={prompt.text} />
    </div>
  );
}

function GenButton({ onClick, label, color, textColor }: { onClick: () => void; label: string; color: string; textColor?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3.5 text-[15px] font-semibold rounded-lg transition-opacity hover:opacity-90"
      style={{ background: color, color: textColor || "#000" }}
    >
      {label}
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-[#525252] uppercase tracking-[1px] mb-2">{label}</p>
      {children}
    </div>
  );
}

function addHashtags(caption: string): string {
  const n = Math.floor(Math.random() * 4);
  const tags = n > 0 ? " " + pickN(HASHTAGS, n).join(" ") : "";
  return caption + tags;
}

function Angle1Generator() {
  const [base, setBase] = useState<Prompt | null>(null);
  const [transform, setTransform] = useState<Prompt[] | null>(null);
  const [title, setTitle] = useState<Prompt | null>(null);
  const [desc, setDesc] = useState<Prompt | null>(null);
  const { t } = useLang();

  const genBase = useCallback(() => {
    const space = pick(SPACE_TYPES);
    const style = pick(A1_HOME_STYLES);
    const floor = pick(FLOORINGS);
    const light = pick(A1_LIGHTINGS);
    setBase({
      text: `Generate a realistic iPhone-style photo of an awkward, empty, unused small space inside an American suburban home.\n\nSpace: ${space}\nHome style: ${style}\nFlooring: ${floor}\nLighting: ${light}\n\nCasual candid angle as if a homeowner is filming a TikTok. Aspect ratio 9:16, 1080x1920 pixels.`,
      tags: [
        { label: space, color: "#3b82f6" },
        { label: style, color: "#a855f7" },
        { label: floor, color: "#f59e0b" },
        { label: light, color: "#ec4899" },
      ],
    });
  }, []);

  const genTransform = useCallback(() => {
    setTransform(pickN(VIBES, 5).map((vibe, i) => ({
      text: `Redesign this empty space in the photo.\n\nTurn it into ${vibe}.\n\nOnly redesign that one area, don't touch anything else in the room. Keep the dimensions and sizing of the space the same. Keep it clean.`,
      tags: [{ label: `${i + 1}. ${vibe}`, color: "#22d3ee" }],
    })));
  }, []);

  return (
    <div className="space-y-6">
      <Section label={t("titleOverlay")}>
        <GenButton onClick={() => setTitle({ text: pick(A1_TITLES), tags: [{ label: "title", color: "#f59e0b" }] })} label={t("generateTitle")} color="#f59e0b" />
        {title && <PromptDisplay prompt={title} />}
      </Section>
      <Section label={t("descriptionCaption")}>
        <GenButton onClick={() => setDesc({ text: addHashtags(pick(A1_CAPTIONS)), tags: [{ label: "description", color: "#f59e0b" }] })} label={t("generateDescription")} color="#f59e0b" />
        {desc && <PromptDisplay prompt={desc} />}
      </Section>
      <Section label={t("basePromptA1")}>
        <GenButton onClick={genBase} label={t("generateBasePrompt")} color="#22c55e" />
        {base && <PromptDisplay prompt={base} />}
      </Section>
      <Section label={t("transformPrompt")}>
        <GenButton onClick={genTransform} label={t("generateTransformPrompt")} color="#a855f7" textColor="#fff" />
        {transform?.map((p, i) => <PromptDisplay key={i} prompt={p} />)}
      </Section>
    </div>
  );
}

function Angle2Generator() {
  const [base, setBase] = useState<Prompt | null>(null);
  const [transform, setTransform] = useState<Prompt[] | null>(null);
  const [title, setTitle] = useState<Prompt | null>(null);
  const [desc, setDesc] = useState<Prompt | null>(null);
  const { t } = useLang();

  const genBase = useCallback(() => {
    const room = pick(ROOM_TYPES);
    const condition = pick(ROOM_CONDITIONS);
    const details = pick(ROOM_DETAILS);
    const style = pick(A2_HOME_STYLES);
    const light = pick(A2_LIGHTINGS);
    setBase({
      text: `Generate a realistic iPhone-style photo of a ${condition} ${room} in an American suburban home.\n\nHome style: ${style}\nDetails: ${details}\nLighting: ${light}\n\nThe room is tidy but outdated — no trash, no clutter, no mess. Casual candid angle as if a homeowner is filming a TikTok. Aspect ratio 9:16, 1080x1920 pixels.`,
      tags: [
        { label: room, color: "#3b82f6" },
        { label: condition, color: "#ef4444" },
        { label: style, color: "#a855f7" },
      ],
    });
  }, []);

  const genTransform = useCallback(() => {
    setTransform(pickN(REMODEL_STYLES, 5).map((style, i) => ({
      text: `Completely remodel this room.\n\nMake it ${style}.\n\nKeep the same room layout and dimensions. Keep it clean.`,
      tags: [{ label: `${i + 1}. ${style}`, color: "#22d3ee" }],
    })));
  }, []);

  return (
    <div className="space-y-6">
      <Section label={t("titleOverlay")}>
        <GenButton onClick={() => setTitle({ text: pick(A2_TITLES), tags: [{ label: "title", color: "#f59e0b" }] })} label={t("generateTitle")} color="#f59e0b" />
        {title && <PromptDisplay prompt={title} />}
      </Section>
      <Section label={t("descriptionCaption")}>
        <GenButton onClick={() => setDesc({ text: addHashtags(pick(A2_CAPTIONS)), tags: [{ label: "description", color: "#f59e0b" }] })} label={t("generateDescription")} color="#f59e0b" />
        {desc && <PromptDisplay prompt={desc} />}
      </Section>
      <Section label={t("basePromptA2")}>
        <GenButton onClick={genBase} label={t("generateBasePrompt")} color="#22c55e" />
        {base && <PromptDisplay prompt={base} />}
      </Section>
      <Section label={t("remodelPrompt")}>
        <GenButton onClick={genTransform} label={t("generateRemodelPrompt")} color="#a855f7" textColor="#fff" />
        {transform?.map((p, i) => <PromptDisplay key={i} prompt={p} />)}
      </Section>
    </div>
  );
}

export default function PromptGenerator({ angle }: { angle: number }) {
  const { t } = useLang();
  if (angle === 1) return <Angle1Generator />;
  if (angle === 2) return <Angle2Generator />;
  return (
    <div className="text-[#525252] text-sm italic py-4">
      {t("comingSoon", { angle: String(angle) })}
    </div>
  );
}
