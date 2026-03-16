"use client";

import { useLang } from "@/lib/i18n";

const STEP_KEYS = ["step1", "step2", "step3", "step4", "step5", "step6", "step7", "step8"] as const;

const STEP_ICONS = ["🎯", "🖼️", "🔄", "📱", "📝", "⬇️", "🎵", "🍋"];

export default function Tutorial({ onClose }: { onClose: () => void }) {
  const { t } = useLang();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-5">{t("tutorialTitle")}</h2>

        <div className="space-y-3">
          {STEP_KEYS.map((key, i) => (
            <div key={key} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-sm">
                {STEP_ICONS[i]}
              </div>
              <div className="flex-1 pt-1">
                <p className="text-sm text-[#d4d4d4]">
                  <span className="text-[#525252] font-mono mr-1.5">{i + 1}.</span>
                  {t(key)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-2.5 text-sm font-semibold rounded-lg bg-[#22c55e] text-black hover:bg-[#16a34a] transition-colors"
        >
          {t("tutorialClose")}
        </button>
      </div>
    </div>
  );
}
