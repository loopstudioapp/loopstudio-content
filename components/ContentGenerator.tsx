"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/lib/i18n";

interface Props {
  accountId: string;
  employeeId: string;
  angle: number;
}

type Status = "idle" | "generating_base" | "generating_transforms" | "sending_telegram" | "done" | "error";

export default function ContentGenerator({ accountId, employeeId, angle }: Props) {
  const { t } = useLang();
  const [status, setStatus] = useState<Status>("idle");
  const [used, setUsed] = useState(0);
  const [max] = useState(3);
  const [result, setResult] = useState<{ title: string; caption: string; imagesGenerated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch current usage on mount
  useEffect(() => {
    fetch(`/api/generate-content?account_id=${accountId}`)
      .then((r) => r.json())
      .then((data) => { if (typeof data.used === "number") setUsed(data.used); })
      .catch(() => {});
  }, [accountId]);

  const generate = useCallback(async () => {
    setStatus("generating_base");
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, employee_id: employeeId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate content");
        setStatus("error");
        if (typeof data.used === "number") setUsed(data.used);
        return;
      }

      setResult({
        title: data.title,
        caption: data.caption,
        imagesGenerated: data.imagesGenerated,
      });
      setUsed(data.used);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }, [accountId, employeeId]);

  const remaining = max - used;
  const isGenerating = status === "generating_base" || status === "generating_transforms" || status === "sending_telegram";

  const statusMessages: Record<string, string> = {
    generating_base: t("generatingBase"),
    generating_transforms: t("generatingTransforms"),
    sending_telegram: t("sendingToTelegram"),
  };

  return (
    <div>
      {/* Usage counter */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[#525252]">
          {t("generationsToday")}: {used}/{max}
        </p>
        {remaining > 0 && (
          <p className="text-xs text-[#22c55e]">
            {remaining} {t("remaining")}
          </p>
        )}
        {remaining <= 0 && (
          <p className="text-xs text-[#ef4444]">
            {t("dailyLimitReached")}
          </p>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={generate}
        disabled={isGenerating || remaining <= 0}
        className="w-full py-4 text-base font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: isGenerating ? "#1a1a1a" : remaining <= 0 ? "#1a1a1a" : "#22c55e",
          color: isGenerating ? "#a3a3a3" : remaining <= 0 ? "#525252" : "#000",
          border: isGenerating ? "1px solid #333" : "none",
        }}
      >
        {isGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {statusMessages[status] || t("generating")}
          </span>
        ) : remaining <= 0 ? (
          t("dailyLimitReached")
        ) : (
          t("generateContent")
        )}
      </button>

      {/* Error */}
      {status === "error" && error && (
        <div className="mt-4 p-4 bg-[#1a0a0a] border border-[#3b1111] rounded-xl">
          <p className="text-sm text-[#ef4444]">{error}</p>
        </div>
      )}

      {/* Success result */}
      {status === "done" && result && (
        <div className="mt-4 space-y-3">
          <div className="p-4 bg-[#0a1a0a] border border-[#113b11] rounded-xl">
            <p className="text-xs text-[#22c55e] uppercase tracking-wider mb-2">{t("contentSent")}</p>
            <p className="text-sm text-white font-medium mb-1">{result.title}</p>
            <p className="text-xs text-[#a3a3a3] leading-relaxed">{result.caption}</p>
            <p className="text-xs text-[#525252] mt-2">
              {result.imagesGenerated} {t("imagesSentToTelegram")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
