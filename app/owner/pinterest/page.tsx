"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── Types ── */
type PostizIntegration = {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  disabled: boolean;
  profile?: string;
};

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

type AnalyticsMetric = {
  label: string;
  data: { date: string; total: number }[];
  percentageChange?: number;
};

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
  Engagement: "#e60023",
  Saves: "#f59e0b",
};

/* ── Page ── */
export default function PinterestPage() {
  const [accounts, setAccounts] = useState<PAccount[]>([]);
  const [integrations, setIntegrations] = useState<PostizIntegration[]>([]);
  const [pins, setPins] = useState<PPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  // Analytics
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
    setAccounts(Array.isArray(accs) ? accs : []);
    setPins(Array.isArray(pinData) ? pinData : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
    syncFromPostiz();
  }, [loadAll]);

  /* ── Sync from Postiz ── */
  const syncFromPostiz = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/pinterest/sync", { method: "POST" });
      const data = await res.json();
      if (data.integrations) setIntegrations(data.integrations);
      await loadAll();
    } catch {
      // silent fail
    }
    setSyncing(false);
  };

  /* ── Load Analytics ── */
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

  /* ── Pipeline Actions ── */
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
      loadAll();
    } catch {
      setRunResult("Pipeline failed");
    }
    setRunning(null);
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
  const generating = todayPins.filter((p) =>
    ["pending", "generating", "uploading"].includes(p.status)
  ).length;

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  const filteredPins = pins.filter((p) => {
    if (filterAccount !== "all" && p.account_id !== filterAccount) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Pinterest Automation</h1>
          <p className="text-sm text-[#525252]">Auto-synced from Postiz</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncFromPostiz}
            disabled={syncing}
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync"}
          </button>
          <button
            onClick={() => setLang(lang === "en" ? "vi" : "en")}
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
          >
            {lang === "en" ? "VN" : "EN"}
          </button>
          <Link
            href="/owner"
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
          >
            ← {t("home")}
          </Link>
        </div>
      </div>

      {/* Result Banner */}
      {runResult && (
        <div className="mb-6 p-3 bg-[#141414] border border-[#262626] rounded-xl flex items-center justify-between">
          <pre className="text-sm text-[#a3a3a3] whitespace-pre-wrap">{runResult}</pre>
          <button
            onClick={() => setRunResult(null)}
            className="text-[#525252] hover:text-white text-xs ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#e60023] text-[10px] uppercase tracking-wider">Accounts</p>
          <p className="text-white text-2xl font-bold mt-1">
            {accounts.filter((a) => a.status === "active").length}
          </p>
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

      {/* Run All */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => triggerPipeline()}
          disabled={running !== null}
          className="px-4 py-2 bg-[#e60023] text-white text-sm font-medium rounded-lg hover:bg-[#cc001f] disabled:opacity-50 transition-colors"
        >
          {running === "all" ? "Running Pipeline..." : "Run All"}
        </button>
      </div>

      {/* Account Cards */}
      <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider mb-4">
        Accounts
      </h2>
      {accounts.length === 0 ? (
        <p className="text-center text-[#525252] py-8">
          No Pinterest accounts synced. Connect Pinterest in Postiz, then click Sync.
        </p>
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
                  <div className="flex items-center gap-3">
                    <div>
                      <h3 className="text-white font-semibold">{acc.name}</h3>
                      {acc.pinterest_username && (
                        <p className="text-[#525252] text-xs">@{acc.pinterest_username}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] ${acc.status === "active" ? "text-[#22c55e]" : "text-[#f59e0b]"}`}
                  >
                    {acc.status}
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
                    <p
                      className={`text-lg font-bold ${accFailed > 0 ? "text-[#ef4444]" : "text-white"}`}
                    >
                      {accFailed}
                    </p>
                    <p className="text-[#525252] text-[10px]">Failed</p>
                  </div>
                </div>

                <div className="h-1.5 bg-[#262626] rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-[#22c55e] rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((accScheduled + accPosted) / acc.pins_per_day) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[#525252] text-[10px] mb-3">
                  {accScheduled + accPosted}/{acc.pins_per_day} pins today
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => triggerPipeline(acc.id)}
                    disabled={running !== null}
                    className="flex-1 px-3 py-1.5 text-xs bg-[#262626] text-white rounded-lg hover:bg-[#333] disabled:opacity-50 transition-colors"
                  >
                    {running === acc.id ? "Running..." : "Run"}
                  </button>
                  <button
                    onClick={() => loadAnalytics(acc)}
                    className="flex-1 px-3 py-1.5 text-xs bg-[#262626] text-[#3b82f6] rounded-lg hover:bg-[#333] transition-colors"
                  >
                    Analytics
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════ ANALYTICS PANEL ═══════════════ */}
      {selectedAccount && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">
              Analytics — {selectedAccount.name}
            </h2>
            <div className="flex gap-2 items-center">
              <select
                className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none"
                value={analyticsDays}
                onChange={(e) => {
                  setAnalyticsDays(e.target.value);
                  loadAnalytics(selectedAccount, e.target.value);
                }}
              >
                <option value="7">7 Days</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
              </select>
              <button
                onClick={() => setSelectedAccount(null)}
                className="text-[#525252] hover:text-white text-xs"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {loadingAnalytics ? (
            <p className="text-[#525252] text-sm py-4">Loading analytics...</p>
          ) : analytics.length === 0 ? (
            <p className="text-[#525252] text-sm py-4">No analytics data available</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {analytics.map((metric) => {
                const latest = metric.data[metric.data.length - 1]?.total ?? 0;
                const total = metric.data.reduce((sum, d) => sum + d.total, 0);
                const max = Math.max(...metric.data.map((d) => d.total), 1);
                const color = METRIC_COLORS[metric.label] || "#737373";

                return (
                  <div
                    key={metric.label}
                    className="bg-[#141414] border border-[#262626] rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium" style={{ color }}>
                        {metric.label}
                      </p>
                      {metric.percentageChange !== undefined && (
                        <span
                          className={`text-[10px] ${metric.percentageChange >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}
                        >
                          {metric.percentageChange >= 0 ? "+" : ""}
                          {metric.percentageChange.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    {/* Mini bar chart */}
                    <div className="flex items-end gap-[2px] h-12 mb-2">
                      {metric.data.map((d, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm transition-all"
                          style={{
                            height: `${Math.max(2, (d.total / max) * 100)}%`,
                            backgroundColor: color + "80",
                          }}
                          title={`${d.date}: ${typeof d.total === "number" ? d.total.toFixed(2) : d.total}`}
                        />
                      ))}
                    </div>

                    <div className="flex justify-between">
                      <p className="text-white text-lg font-bold">
                        {metric.label === "Pin click rate"
                          ? latest.toFixed(2) + "%"
                          : Math.round(total).toLocaleString()}
                      </p>
                      <p className="text-[#525252] text-[10px] self-end">
                        {metric.label === "Pin click rate" ? "latest" : "total"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ PIN HISTORY ═══════════════ */}
      <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider mt-8 mb-4">
        Pin History
      </h2>
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none"
          value={filterAccount}
          onChange={(e) => setFilterAccount(e.target.value)}
        >
          <option value="all">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
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
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">
                Scheduled
              </th>
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {filteredPins.slice(0, 50).map((pin) => (
              <tr key={pin.id} className="border-b border-[#262626]/50 hover:bg-[#141414]">
                <td className="py-2 px-3 text-xs text-[#a3a3a3]">
                  {accountMap[pin.account_id] || "—"}
                </td>
                <td className="py-2 px-3">
                  <p className="text-xs text-white truncate max-w-[250px]">{pin.title}</p>
                  {pin.error_message && (
                    <p className="text-[10px] text-[#ef4444] truncate max-w-[250px]">
                      {pin.error_message}
                    </p>
                  )}
                </td>
                <td className="py-2 px-3">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      color: STATUS_COLORS[pin.status],
                      backgroundColor: (STATUS_COLORS[pin.status] || "#525252") + "15",
                    }}
                  >
                    {pin.status}
                  </span>
                </td>
                <td className="py-2 px-3 text-xs text-[#525252]">
                  {pin.scheduled_at ? new Date(pin.scheduled_at).toLocaleString() : "—"}
                </td>
                <td className="py-2 px-3 text-xs text-[#525252]">
                  {new Date(pin.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredPins.length === 0 && (
        <p className="text-center text-[#525252] py-8">No pins yet</p>
      )}
      {filteredPins.length > 50 && (
        <p className="text-center text-[#525252] text-xs py-4">
          Showing latest 50 of {filteredPins.length} pins
        </p>
      )}
    </div>
  );
}
