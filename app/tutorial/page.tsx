"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n";

const STEP_KEYS = ["step1", "step2", "step3", "step4", "step5", "step6", "step7", "step8"] as const;
const STEP_ICONS = ["\uD83C\uDFAF", "\uD83D\uDDBC\uFE0F", "\uD83D\uDD04", "\uD83D\uDCF1", "\uD83D\uDCDD", "\u2B07\uFE0F", "\uD83C\uDFB5", "\uD83C\uDF4B"];

export default function TutorialPage() {
  const { t } = useLang();
  const router = useRouter();

  useEffect(() => {
    const match = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!match) { router.push("/"); return; }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <h1 className="text-xl font-bold text-white mb-6">{t("tutorialTitle")}</h1>

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
      </div>
    </div>
  );
}
