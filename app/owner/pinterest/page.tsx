"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

type PAccount = {
  id: string;
  name: string;
  pinterest_username: string | null;
  content_type: string;
  status: string;
  pins_per_day: number;
  created_at: string;
};

type PPin = {
  id: string;
  account_id: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
};

export default function PinterestDashboard() {
  const [accounts, setAccounts] = useState<PAccount[]>([]);
  const [todayPins, setTodayPins] = useState<PPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) { router.push("/"); return; }
  }, [router]);

  const load = async () => {
    const [accRes, pinRes] = await Promise.all([
      fetch("/api/pinterest/accounts"),
      fetch(`/api/pinterest/pins?date=${new Date().toISOString().split("T")[0]}`),
    ]);
    const accs = await accRes.json();
    const pins = await pinRes.json();
    setAccounts(Array.isArray(accs) ? accs : []);
    setTodayPins(Array.isArray(pins) ? pins : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const triggerPipeline = async (accountId?: string) => {
    setRunning(accountId || "all");
    setRunResult(null);
    try {
      const res = await fetch("/api/pinterest/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountId ? { account_id: accountId } : {}),
      });
      const data = await res.json();
      setRunResult(data.summary || `Scheduled: ${data.scheduled}, Failed: ${data.failed}`);
      load();
    } catch {
      setRunResult("Pipeline failed");
    }
    setRunning(null);
  };

  const seedTopics = async () => {
    const res = await fetch("/api/pinterest/topics", { method: "POST" });
    const data = await res.json();
    alert(`Seeded ${data.seeded} topics`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#737373]">{t("loading")}</div>
      </div>
    );
  }

  const scheduled = todayPins.filter((p) => p.status === "scheduled").length;
  const failed = todayPins.filter((p) => p.status === "failed").length;
  const posted = todayPins.filter((p) => p.status === "posted").length;
  const generating = todayPins.filter((p) => ["pending", "generating", "uploading"].includes(p.status)).length;

  const CONTENT_TYPE_LABELS: Record<string, string> = {
    before_after: "Before / After",
    listicle: "Listicle / Tips",
    visual_guide: "Visual Guide",
  };

  const CONTENT_TYPE_COLORS: Record<string, string> = {
    before_after: "#e60023",
    listicle: "#22c55e",
    visual_guide: "#3b82f6",
  };

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Pinterest Automation</h1>
          <p className="text-sm text-[#525252]">Automated pin generation & scheduling</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "vi" : "en")}
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
          >
            {lang === "en" ? "VN" : "EN"}
          </button>
          <Link href="/owner/pinterest/accounts" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            {t("accountsLink")}
          </Link>
          <Link href="/owner/pinterest/pins" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            Pin History
          </Link>
          <Link href="/owner/pinterest/topics" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            Topics
          </Link>
          <Link href="/owner" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            {t("home")}
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#e60023] text-[10px] uppercase tracking-wider">Accounts</p>
          <p className="text-white text-2xl font-bold mt-1">{accounts.filter((a) => a.status === "active").length}</p>
          <p className="text-[#525252] text-[10px]">{t("active")}</p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#22c55e] text-[10px] uppercase tracking-wider">Scheduled</p>
          <p className="text-white text-2xl font-bold mt-1">{scheduled}</p>
          <p className="text-[#525252] text-[10px]">today</p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#3b82f6] text-[10px] uppercase tracking-wider">Posted</p>
          <p className="text-white text-2xl font-bold mt-1">{posted}</p>
          <p className="text-[#525252] text-[10px]">today</p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#f59e0b] text-[10px] uppercase tracking-wider">In Progress</p>
          <p className="text-white text-2xl font-bold mt-1">{generating}</p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#ef4444] text-[10px] uppercase tracking-wider">Failed</p>
          <p className="text-white text-2xl font-bold mt-1">{failed}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => triggerPipeline()}
          disabled={running !== null}
          className="px-4 py-2 bg-[#e60023] text-white text-sm font-medium rounded-lg hover:bg-[#cc001f] disabled:opacity-50 transition-colors"
        >
          {running === "all" ? "Running Pipeline..." : "Run Pipeline Now"}
        </button>
        <button
          onClick={seedTopics}
          className="px-4 py-2 bg-[#262626] text-white text-sm font-medium rounded-lg hover:bg-[#333] transition-colors"
        >
          Seed Topics
        </button>
      </div>

      {runResult && (
        <div className="mb-8 p-4 bg-[#141414] border border-[#262626] rounded-xl">
          <pre className="text-sm text-[#a3a3a3] whitespace-pre-wrap">{runResult}</pre>
        </div>
      )}

      {/* Account Cards */}
      <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider mb-4">Accounts</h2>
      {accounts.length === 0 ? (
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-8 text-center">
          <p className="text-[#525252] mb-4">No Pinterest accounts yet</p>
          <Link
            href="/owner/pinterest/accounts"
            className="px-4 py-2 bg-[#e60023] text-white text-sm rounded-lg hover:bg-[#cc001f] transition-colors"
          >
            Add Account
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const accPins = todayPins.filter((p) => p.account_id === acc.id);
            const accScheduled = accPins.filter((p) => p.status === "scheduled").length;
            const accFailed = accPins.filter((p) => p.status === "failed").length;
            const accPosted = accPins.filter((p) => p.status === "posted").length;

            return (
              <div key={acc.id} className="bg-[#141414] border border-[#262626] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-white font-semibold">{acc.name}</h3>
                    {acc.pinterest_username && (
                      <p className="text-[#525252] text-xs">@{acc.pinterest_username}</p>
                    )}
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full border"
                    style={{
                      color: CONTENT_TYPE_COLORS[acc.content_type],
                      borderColor: CONTENT_TYPE_COLORS[acc.content_type] + "40",
                    }}
                  >
                    {CONTENT_TYPE_LABELS[acc.content_type]}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center">
                    <p className="text-white text-lg font-bold">{accScheduled}</p>
                    <p className="text-[#525252] text-[10px]">Scheduled</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white text-lg font-bold">{accPosted}</p>
                    <p className="text-[#525252] text-[10px]">Posted</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-lg font-bold ${accFailed > 0 ? "text-[#ef4444]" : "text-white"}`}>{accFailed}</p>
                    <p className="text-[#525252] text-[10px]">Failed</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-[#262626] rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-[#22c55e] rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((accScheduled + accPosted) / acc.pins_per_day) * 100)}%` }}
                  />
                </div>
                <p className="text-[#525252] text-[10px]">{accScheduled + accPosted}/{acc.pins_per_day} pins today</p>

                <button
                  onClick={() => triggerPipeline(acc.id)}
                  disabled={running !== null}
                  className="mt-3 w-full px-3 py-1.5 text-xs bg-[#262626] text-white rounded-lg hover:bg-[#333] disabled:opacity-50 transition-colors"
                >
                  {running === acc.id ? "Running..." : "Run Now"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
