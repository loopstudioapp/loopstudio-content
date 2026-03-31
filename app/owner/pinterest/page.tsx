"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── Types ── */
type PAccount = {
  id: string;
  name: string;
  pinterest_username: string | null;
  postiz_api_key: string;
  postiz_integration_id: string;
  board_id: string;
  content_type: string;
  status: string;
  pins_per_day: number;
  telegram_chat_id: string | null;
  app_store_url: string;
  running: boolean;
  ba_running: boolean;
  created_at: string;
};

type PPin = {
  id: string;
  account_id: string;
  topic_id: string;
  title: string;
  description: string;
  image_url: string | null;
  postiz_post_id: string | null;
  scheduled_at: string | null;
  status: string;
  error_message: string | null;
  retry_count: number;
  created_at: string;
};

type ScheduleEntry = {
  id: string;
  account_id: string;
  scheduled_at: string;
  pin_id: string | null;
  status: string;
  created_at: string;
};

type AnalyticsMetric = {
  label: string;
  data: { date: string; total: number }[];
  percentageChange?: number;
};

/* ── SVG Line Chart ── */
function LineChart({ data, color, height = 60 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const w = 200;
  const h = height;
  const pad = 4;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return { x, y };
  });

  const line = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const area = `${line} L${points[points.length - 1].x},${h} L${points[0].x},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${color.replace("#", "")})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) =>
        i === points.length - 1 ? (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
        ) : null
      )}
    </svg>
  );
}

/* ── Constants ── */
const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  generating: "#3b82f6",
  uploading: "#8b5cf6",
  scheduled: "#22c55e",
  posted: "#22c55e",
  failed: "#ef4444",
};

const METRIC_COLORS: Record<string, string> = {
  "Pin click rate": "#8b5cf6",
  Impressions: "#22c55e",
  "Pin Clicks": "#3b82f6",
  Saves: "#f59e0b",
};

/* ── Metric Card ── */
function MetricCard({ metric }: { metric: AnalyticsMetric }) {
  const color = METRIC_COLORS[metric.label] || "#737373";
  const values = metric.data.map((d) => d.total);
  const total = values.reduce((s, v) => s + v, 0);
  const latest = values[values.length - 1] ?? 0;
  const isRate = metric.label.toLowerCase().includes("rate");

  return (
    <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium" style={{ color }}>
          {metric.label}
        </p>
        {metric.percentageChange !== undefined && (
          <span className={`text-[10px] font-medium ${metric.percentageChange >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
            {metric.percentageChange >= 0 ? "+" : ""}
            {metric.percentageChange.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-white text-2xl font-bold mb-2">
        {isRate ? latest.toFixed(2) + "%" : Math.round(total).toLocaleString()}
      </p>
      <LineChart data={values} color={color} height={50} />
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-[#525252]">
          {metric.data[0]?.date?.slice(5) || ""}
        </span>
        <span className="text-[10px] text-[#525252]">
          {metric.data[metric.data.length - 1]?.date?.slice(5) || ""}
        </span>
      </div>
    </div>
  );
}

/* ── Page ── */
export default function PinterestPage() {
  const [accounts, setAccounts] = useState<PAccount[]>([]);
  const [pins, setPins] = useState<PPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  // Schedule data per account
  const [schedules, setSchedules] = useState<Record<string, ScheduleEntry[]>>({});

  // Overall analytics
  const [overallAnalytics, setOverallAnalytics] = useState<AnalyticsMetric[]>([]);
  const [overallDays, setOverallDays] = useState("7");
  const [loadingOverall, setLoadingOverall] = useState(false);

  // Per-account analytics
  const [selectedAccount, setSelectedAccount] = useState<PAccount | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsMetric[]>([]);
  const [analyticsDays, setAnalyticsDays] = useState("7");
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Pins filters
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) {
      router.push("/");
      return;
    }
  }, [router]);

  const loadAll = useCallback(async () => {
    const [accRes, pinRes] = await Promise.all([
      fetch("/api/pinterest/accounts"),
      fetch("/api/pinterest/pins"),
    ]);
    const accs = await accRes.json();
    const pinData = await pinRes.json();
    const accountList = Array.isArray(accs) ? accs : [];
    setAccounts(accountList);
    setPins(Array.isArray(pinData) ? pinData : []);
    setLoading(false);

    // Load schedules for all accounts
    loadSchedules(accountList);
  }, []);

  const loadSchedules = async (accountList: PAccount[]) => {
    const scheduleMap: Record<string, ScheduleEntry[]> = {};
    await Promise.all(
      accountList.map(async (acc) => {
        try {
          const res = await fetch(`/api/pinterest/schedule?account_id=${acc.id}`);
          const data = await res.json();
          scheduleMap[acc.id] = Array.isArray(data) ? data : [];
        } catch {
          scheduleMap[acc.id] = [];
        }
      })
    );
    setSchedules(scheduleMap);
  };

  useEffect(() => {
    loadAll();
    syncFromPostBridge();
  }, [loadAll]);

  // Load overall analytics when accounts are available
  useEffect(() => {
    if (accounts.length > 0) loadOverallAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  /* ── Sync from PostBridge ── */
  const syncFromPostBridge = async () => {
    setSyncing(true);
    try {
      await fetch("/api/pinterest/sync", { method: "POST" });
      await loadAll();
    } catch { /* silent */ }
    setSyncing(false);
  };

  /* ── Load Overall Analytics (aggregate all accounts) ── */
  const loadOverallAnalytics = async (days?: string) => {
    if (accounts.length === 0) return;
    setLoadingOverall(true);
    const d = days || overallDays;
    try {
      const results = await Promise.all(
        accounts.map(async (acc) => {
          const res = await fetch(
            `/api/pinterest/analytics?integration_id=${acc.postiz_integration_id}&days=${d}`
          );
          const data = await res.json();
          return Array.isArray(data) ? data as AnalyticsMetric[] : [];
        })
      );

      const merged: Record<string, AnalyticsMetric> = {};
      for (const accountMetrics of results) {
        for (const metric of accountMetrics) {
          if (!merged[metric.label]) {
            merged[metric.label] = {
              label: metric.label,
              data: metric.data.map((d) => ({ ...d })),
              percentageChange: metric.percentageChange,
            };
          } else {
            const existing = merged[metric.label];
            for (let i = 0; i < metric.data.length; i++) {
              if (existing.data[i]) {
                existing.data[i].total += metric.data[i].total;
              } else {
                existing.data.push({ ...metric.data[i] });
              }
            }
          }
        }
      }
      setOverallAnalytics(Object.values(merged));
    } catch {
      setOverallAnalytics([]);
    }
    setLoadingOverall(false);
  };

  /* ── Load Per-Account Analytics ── */
  const loadAnalytics = async (account: PAccount, days?: string) => {
    setSelectedAccount(account);
    setLoadingAnalytics(true);
    setAnalytics([]);
    try {
      const d = days || analyticsDays;
      const res = await fetch(
        `/api/pinterest/analytics?integration_id=${account.postiz_integration_id}&days=${d}`
      );
      const data = await res.json();
      setAnalytics(Array.isArray(data) ? data : []);
    } catch {
      setAnalytics([]);
    }
    setLoadingAnalytics(false);
  };

  /* ── Start/Stop Toggle ── */
  const toggleScheduler = async (account: PAccount) => {
    setToggling(account.id);
    try {
      const action = account.running ? "stop" : "start";
      const res = await fetch("/api/pinterest/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: account.id, action }),
      });
      if (res.ok) {
        await loadAll();
      }
    } catch { /* silent */ }
    setToggling(null);
  };

  /* ── Start/Stop B/A Toggle ── */
  const toggleBA = async (account: PAccount) => {
    setToggling(account.id + "-ba");
    try {
      const action = account.ba_running ? "stop_ba" : "start_ba";
      const res = await fetch("/api/pinterest/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: account.id, action }),
      });
      if (res.ok) {
        await loadAll();
      }
    } catch { /* silent */ }
    setToggling(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-[#737373]">{t("loading")}</div>
      </div>
    );
  }

  /* ── Computed Data ── */
  const today = new Date().toISOString().split("T")[0];
  const todayPins = pins.filter((p) => p.created_at.startsWith(today));
  const scheduled = todayPins.filter((p) => p.status === "scheduled").length;
  const failed = todayPins.filter((p) => p.status === "failed").length;
  const posted = todayPins.filter((p) => p.status === "posted").length;
  const generating = todayPins.filter((p) => ["pending", "generating", "uploading"].includes(p.status)).length;
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const runningCount = accounts.filter((a) => a.running).length;

  const filteredPins = pins.filter((p) => {
    if (filterAccount !== "all" && p.account_id !== filterAccount) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  /** Get the next pending schedule time for an account */
  const getNextScheduled = (accountId: string): string | null => {
    const entries = schedules[accountId] || [];
    const pending = entries.filter((e) => e.status === "pending");
    if (pending.length === 0) return null;
    return pending[0].scheduled_at;
  };

  /** Get count of pending entries for an account */
  const getPendingCount = (accountId: string): number => {
    const entries = schedules[accountId] || [];
    return entries.filter((e) => e.status === "pending").length;
  };

  /** Get count of done entries for today */
  const getDoneToday = (accountId: string): number => {
    const entries = schedules[accountId] || [];
    return entries.filter((e) => e.status === "done" && e.scheduled_at.startsWith(today)).length;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Pinterest Automation</h1>
          <p className="text-sm text-[#525252]">
            {runningCount > 0
              ? `${runningCount} account${runningCount > 1 ? "s" : ""} running`
              : "All accounts stopped"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={syncFromPostBridge} disabled={syncing} className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors disabled:opacity-50">
            {syncing ? "Syncing..." : "Sync"}
          </button>
          <button onClick={() => setLang(lang === "en" ? "vi" : "en")} className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            {lang === "en" ? "VN" : "EN"}
          </button>
          <Link href="/owner" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            ← {t("home")}
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#e60023] text-[10px] uppercase tracking-wider">Running</p>
          <p className="text-white text-2xl font-bold mt-1">{runningCount}</p>
          <p className="text-[#525252] text-[10px]">of {accounts.length}</p>
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

      {/* Pinterest analytics hidden — PostBridge has no analytics API */}

      {/* ═══════════════ ACCOUNTS ═══════════════ */}
      <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider mb-4">Accounts</h2>
      {accounts.length === 0 ? (
        <p className="text-center text-[#525252] py-8">No Pinterest accounts synced. Connect Pinterest in PostBridge, then click Sync.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const accPins = todayPins.filter((p) => p.account_id === acc.id);
            const accScheduled = accPins.filter((p) => p.status === "scheduled").length;
            const accFailed = accPins.filter((p) => p.status === "failed").length;
            const accPosted = accPins.filter((p) => p.status === "posted").length;
            const nextTime = getNextScheduled(acc.id);
            const pendingSlots = getPendingCount(acc.id);
            const doneToday = getDoneToday(acc.id);

            return (
              <div key={acc.id} className="bg-[#141414] border border-[#262626] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-white font-semibold">{acc.name}</h3>
                    {acc.pinterest_username && <p className="text-[#525252] text-xs">@{acc.pinterest_username}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      acc.running
                        ? "text-[#22c55e] bg-[#22c55e]/10"
                        : "text-[#737373] bg-[#737373]/10"
                    }`}>
                      {acc.running ? "Running" : "Stopped"}
                    </span>
                  </div>
                </div>

                {/* Schedule info */}
                {acc.running && (
                  <div className="mb-3 p-2.5 bg-[#0a0a0a] rounded-lg border border-[#262626]">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#525252]">Done today</span>
                      <span className="text-white font-medium">{doneToday}/{acc.pins_per_day || 5}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] mt-1">
                      <span className="text-[#525252]">Pending slots</span>
                      <span className="text-[#f59e0b] font-medium">{pendingSlots}</span>
                    </div>
                    {nextTime && (
                      <div className="flex items-center justify-between text-[10px] mt-1">
                        <span className="text-[#525252]">Next post</span>
                        <span className="text-[#3b82f6] font-medium">
                          {new Date(nextTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

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

                <div className="h-1.5 bg-[#262626] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-[#22c55e] rounded-full transition-all" style={{ width: `${Math.min(100, ((accScheduled + accPosted) / (acc.pins_per_day || 5)) * 100)}%` }} />
                </div>
                <p className="text-[#525252] text-[10px] mb-3">{accScheduled + accPosted}/{acc.pins_per_day || 5} pins today</p>

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleScheduler(acc)}
                    disabled={toggling !== null}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                      acc.running
                        ? "bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 border border-[#ef4444]/30"
                        : "bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20 border border-[#22c55e]/30"
                    }`}
                  >
                    {toggling === acc.id
                      ? (acc.running ? "Stopping..." : "Starting...")
                      : (acc.running ? "■ Stop" : "▶ Start")}
                  </button>
                  <button
                    onClick={() => toggleBA(acc)}
                    disabled={toggling !== null}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                      acc.ba_running
                        ? "bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 border border-[#ef4444]/30"
                        : "bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20 border border-[#22c55e]/30"
                    }`}
                  >
                    {toggling === acc.id + "-ba"
                      ? (acc.ba_running ? "Stopping..." : "Starting...")
                      : (acc.ba_running ? "■ Stop B/A" : "▶ Start B/A")}
                  </button>
                  <button onClick={() => loadAnalytics(acc)} className="flex-1 px-3 py-1.5 text-xs bg-[#262626] text-[#3b82f6] rounded-lg hover:bg-[#333] transition-colors">
                    Analytics
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════ PER-ACCOUNT ANALYTICS ═══════════════ */}
      {selectedAccount && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">
              {selectedAccount.name} — Analytics
            </h2>
            <div className="flex gap-2 items-center">
              <select
                className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none"
                value={analyticsDays}
                onChange={(e) => { setAnalyticsDays(e.target.value); loadAnalytics(selectedAccount, e.target.value); }}
              >
                <option value="7">7 Days</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
              </select>
              <button onClick={() => setSelectedAccount(null)} className="text-[#525252] hover:text-white text-xs">✕ Close</button>
            </div>
          </div>

          {loadingAnalytics ? (
            <p className="text-[#525252] text-sm py-4">Loading analytics...</p>
          ) : analytics.length === 0 ? (
            <p className="text-[#525252] text-sm py-4">No analytics data available</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {analytics.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ PIN HISTORY ═══════════════ */}
      <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider mt-8 mb-4">Pin History</h2>
      <div className="flex flex-wrap gap-3 mb-4">
        <select className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
          <option value="all">All Accounts</option>
          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
        </select>
        <select className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="generating">Generating</option>
          <option value="uploading">Uploading</option>
          <option value="scheduled">Scheduled</option>
          <option value="posted">Posted</option>
          <option value="failed">Failed</option>
        </select>
        <span className="text-xs text-[#525252] self-center">{filteredPins.length} pins</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-[#262626]">
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Account</th>
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Title</th>
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Status</th>
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Scheduled</th>
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {filteredPins.slice(0, 50).map((pin) => (
              <tr key={pin.id} className="border-b border-[#262626]/50 hover:bg-[#141414]">
                <td className="py-2 px-3 text-xs text-[#a3a3a3]">{accountMap[pin.account_id] || "—"}</td>
                <td className="py-2 px-3">
                  <p className="text-xs text-white truncate max-w-[250px]">{pin.title}</p>
                  {pin.error_message && <p className="text-[10px] text-[#ef4444] truncate max-w-[250px]">{pin.error_message}</p>}
                </td>
                <td className="py-2 px-3">
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: STATUS_COLORS[pin.status], backgroundColor: (STATUS_COLORS[pin.status] || "#525252") + "15" }}>
                    {pin.status}
                  </span>
                </td>
                <td className="py-2 px-3 text-xs text-[#525252]">{pin.scheduled_at ? new Date(pin.scheduled_at).toLocaleString() : "—"}</td>
                <td className="py-2 px-3 text-xs text-[#525252]">{new Date(pin.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredPins.length === 0 && <p className="text-center text-[#525252] py-8">No pins yet</p>}
      {filteredPins.length > 50 && <p className="text-center text-[#525252] text-xs py-4">Showing latest 50 of {filteredPins.length} pins</p>}
    </div>
  );
}
