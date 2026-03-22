"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── Types ── */

type RevenueCatOverview = {
  active_trials: number;
  active_subscriptions: number;
  revenue_30d: number;
  mrr: number;
};

type RevenueCatSubscriber = {
  country: string;
  app: string;
  plan: string;
  purchased: string;
  expires: string;
  revenue: number;
};

type MetricsRow = {
  account_id: string;
  total_likes: number;
  posts: number;
  followers: number;
  lm8_total_likes: number;
  lm8_posts: number;
  lm8_followers: number;
};

type PinterestAccount = {
  id: string;
  name: string;
  postiz_integration_id: string;
};

type PinterestAnalytics = {
  impressions: number;
  pin_clicks: number;
  saves: number;
};

/* ── Helpers ── */

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "\u{1F30D}";
  const codePoints = code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function formatCurrency(n: number): string {
  return "$" + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ── Main Component ── */

export default function OwnerDashboard() {
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  // RevenueCat state
  const [rcTab, setRcTab] = useState<"overall" | "roomy">("overall");
  const [rcOverview, setRcOverview] = useState<RevenueCatOverview | null>(null);
  const [rcLoading, setRcLoading] = useState(true);
  const [rcError, setRcError] = useState<string | null>(null);
  const [subscriberPanel, setSubscriberPanel] = useState<"trial" | "active" | null>(null);
  const [subscribers, setSubscribers] = useState<RevenueCatSubscriber[]>([]);
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [subscribersError, setSubscribersError] = useState<string | null>(null);

  // Platform metrics state
  const [metrics, setMetrics] = useState<MetricsRow[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // Pinterest state
  const [pinterestAnalytics, setPinterestAnalytics] = useState<PinterestAnalytics | null>(null);
  const [pinterestLoading, setPinterestLoading] = useState(true);

  // Auth check
  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) {
      router.push("/");
      return;
    }
  }, [router]);

  // Fetch RevenueCat overview
  useEffect(() => {
    setRcLoading(true);
    setRcError(null);
    fetch("/api/revenuecat?type=overview")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((data) => {
        setRcOverview(data);
        setRcLoading(false);
      })
      .catch((err) => {
        setRcError(err.message);
        setRcLoading(false);
      });
  }, []);

  // Fetch platform metrics
  useEffect(() => {
    setMetricsLoading(true);
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((data: MetricsRow[]) => {
        // Group by account_id and keep only the latest per account
        const latestMap = new Map<string, MetricsRow>();
        for (const row of data) {
          if (!latestMap.has(row.account_id)) {
            latestMap.set(row.account_id, row);
          }
        }
        setMetrics(Array.from(latestMap.values()));
        setMetricsLoading(false);
      })
      .catch(() => setMetricsLoading(false));
  }, []);

  // Fetch Pinterest analytics
  useEffect(() => {
    setPinterestLoading(true);
    fetch("/api/pinterest/accounts")
      .then((r) => r.json())
      .then(async (accounts: PinterestAccount[]) => {
        if (!accounts || accounts.length === 0) {
          setPinterestLoading(false);
          return;
        }
        let totalImpressions = 0;
        let totalClicks = 0;
        let totalSaves = 0;
        await Promise.all(
          accounts.map(async (acc) => {
            try {
              const res = await fetch(
                `/api/pinterest/analytics?integration_id=${acc.postiz_integration_id}&days=30`
              );
              if (!res.ok) return;
              const data = await res.json();
              if (Array.isArray(data)) {
                for (const metric of data) {
                  if (!metric.data) continue;
                  const sum = metric.data.reduce(
                    (s: number, d: { total: number }) => s + (d.total || 0),
                    0
                  );
                  const label = (metric.label || "").toLowerCase();
                  if (label.includes("impression")) totalImpressions += sum;
                  else if (label.includes("click")) totalClicks += sum;
                  else if (label.includes("save")) totalSaves += sum;
                }
              }
            } catch {
              // skip failed account
            }
          })
        );
        setPinterestAnalytics({
          impressions: totalImpressions,
          pin_clicks: totalClicks,
          saves: totalSaves,
        });
        setPinterestLoading(false);
      })
      .catch(() => setPinterestLoading(false));
  }, []);

  // Fetch subscribers list
  const fetchSubscribers = useCallback(async (filter: "trial" | "active") => {
    setSubscribersLoading(true);
    setSubscribersError(null);
    try {
      const res = await fetch(`/api/revenuecat?type=subscribers&filter=${filter}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ||
            "Add customer_information:customers:read permission to your RevenueCat API key"
        );
      }
      const data = await res.json();
      setSubscribers(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setSubscribersError(err instanceof Error ? err.message : "Failed to load subscribers");
    } finally {
      setSubscribersLoading(false);
    }
  }, []);

  const handleStatClick = (panel: "trial" | "active") => {
    if (subscriberPanel === panel) {
      setSubscriberPanel(null);
      return;
    }
    setSubscriberPanel(panel);
    fetchSubscribers(panel);
  };

  // Computed totals for TikTok / Lemon8
  const tkFollowers = metrics.reduce((s, m) => s + (m.followers || 0), 0);
  const tkLikes = metrics.reduce((s, m) => s + (m.total_likes || 0), 0);
  const tkPosts = metrics.reduce((s, m) => s + (m.posts || 0), 0);
  const lmFollowers = metrics.reduce((s, m) => s + (m.lm8_followers || 0), 0);
  const lmLikes = metrics.reduce((s, m) => s + (m.lm8_total_likes || 0), 0);
  const lmPosts = metrics.reduce((s, m) => s + (m.lm8_posts || 0), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-6 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Loop Content Generation</h1>
          <p className="text-sm text-[#525252]">Dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "vi" : "en")}
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
          >
            {lang === "en" ? "VN" : "EN"}
          </button>
          <Link
            href="/"
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
          >
            {t("logout")}
          </Link>
        </div>
      </div>

      {/* ── Navigation Row ── */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/owner/tiktok"
          className="px-4 py-2 text-sm text-[#737373] bg-[#141414] border border-[#262626] rounded-full hover:text-white hover:border-[#404040] transition-colors"
        >
          TikTok
        </Link>
        <Link
          href="/owner/pinterest"
          className="px-4 py-2 text-sm text-[#737373] bg-[#141414] border border-[#262626] rounded-full hover:text-white hover:border-[#404040] transition-colors"
        >
          Pinterest
        </Link>
      </div>

      {/* ── RevenueCat Section ── */}
      <div className="mb-8">
        {/* Tab Buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setRcTab("overall")}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              rcTab === "overall"
                ? "bg-[#e60023] text-white"
                : "bg-[#141414] text-[#737373] border border-[#262626] hover:text-white"
            }`}
          >
            Overall
          </button>
          <button
            onClick={() => setRcTab("roomy")}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              rcTab === "roomy"
                ? "bg-[#e60023] text-white"
                : "bg-[#141414] text-[#737373] border border-[#262626] hover:text-white"
            }`}
          >
            Roomy AI
          </button>
        </div>

        {/* Stat Cards */}
        {rcLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-[#141414] border border-[#262626] rounded-xl p-4 animate-pulse h-24"
              />
            ))}
          </div>
        ) : rcError ? (
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-4 text-[#737373] text-sm">
            Failed to load RevenueCat data
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => handleStatClick("trial")}
              className={`bg-[#141414] border rounded-xl p-4 text-left cursor-pointer hover:bg-[#1a1a1a] transition-colors ${
                subscriberPanel === "trial" ? "border-[#22c55e]/50" : "border-[#262626]"
              }`}
            >
              <p className="text-[#22c55e] text-[10px] uppercase tracking-wider font-semibold">
                Active Trials
              </p>
              <p className="text-white text-2xl font-bold mt-1">
                {rcOverview?.active_trials ?? 0}
              </p>
            </button>
            <button
              onClick={() => handleStatClick("active")}
              className={`bg-[#141414] border rounded-xl p-4 text-left cursor-pointer hover:bg-[#1a1a1a] transition-colors ${
                subscriberPanel === "active" ? "border-[#3b82f6]/50" : "border-[#262626]"
              }`}
            >
              <p className="text-[#3b82f6] text-[10px] uppercase tracking-wider font-semibold">
                Active Subs
              </p>
              <p className="text-white text-2xl font-bold mt-1">
                {rcOverview?.active_subscriptions ?? 0}
              </p>
            </button>
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
              <p className="text-[#8b5cf6] text-[10px] uppercase tracking-wider font-semibold">
                30-Day Revenue
              </p>
              <p className="text-white text-2xl font-bold mt-1">
                {formatCurrency(rcOverview?.revenue_30d ?? 0)}
              </p>
            </div>
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
              <p className="text-[#f59e0b] text-[10px] uppercase tracking-wider font-semibold">
                Current MRR
              </p>
              <p className="text-white text-2xl font-bold mt-1">
                {formatCurrency(rcOverview?.mrr ?? 0)}
              </p>
            </div>
          </div>
        )}

        {/* ── Customer List Panel ── */}
        {subscriberPanel && (
          <div className="mt-4 bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <h3 className="text-white text-sm font-semibold">
                  {subscriberPanel === "trial" ? "Active Trials" : "Active Subscriptions"}
                </h3>
                {!subscribersLoading && !subscribersError && (
                  <span className="text-[#737373] text-xs">({subscribers.length})</span>
                )}
              </div>
              <button
                onClick={() => setSubscriberPanel(null)}
                className="text-[#737373] hover:text-white text-lg leading-none transition-colors"
              >
                &#x2715;
              </button>
            </div>

            {subscribersLoading ? (
              <div className="p-6 text-center text-[#737373] text-sm">Loading...</div>
            ) : subscribersError ? (
              <div className="p-6 text-center text-[#ef4444] text-sm">{subscribersError}</div>
            ) : subscribers.length === 0 ? (
              <div className="p-6 text-center text-[#737373] text-sm">No subscribers found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-[#262626]">
                      <th className="text-left px-4 py-2.5 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">
                        Country
                      </th>
                      <th className="text-left px-4 py-2.5 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">
                        App
                      </th>
                      <th className="text-left px-4 py-2.5 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">
                        Plan
                      </th>
                      <th className="text-left px-4 py-2.5 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">
                        Purchased
                      </th>
                      <th className="text-left px-4 py-2.5 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">
                        Expires
                      </th>
                      <th className="text-right px-4 py-2.5 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">
                        Revenue
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((sub, i) => (
                      <tr
                        key={i}
                        className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors"
                      >
                        <td className="px-4 py-2.5 text-white">
                          {countryFlag(sub.country)}{" "}
                          <span className="text-[#737373] text-xs ml-1">
                            {sub.country?.toUpperCase() || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-white">{sub.app || "—"}</td>
                        <td className="px-4 py-2.5 text-white">{sub.plan || "—"}</td>
                        <td className="px-4 py-2.5 text-[#737373]">{formatDate(sub.purchased)}</td>
                        <td className="px-4 py-2.5 text-[#737373]">{formatDate(sub.expires)}</td>
                        <td className="px-4 py-2.5 text-right text-white">
                          {formatCurrency(sub.revenue || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Platform Overview Section ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* TikTok Overview */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
          <div className="h-1 bg-[#ff0050]" />
          <div className="p-5">
            <h3 className="text-white text-sm font-semibold mb-4">TikTok Overview</h3>
            {metricsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-5 bg-[#1a1a1a] rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[#737373] text-xs">Total Followers</span>
                  <span className="text-white font-semibold">{formatNumber(tkFollowers)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#737373] text-xs">Total Likes</span>
                  <span className="text-white font-semibold">{formatNumber(tkLikes)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#737373] text-xs">Total Posts</span>
                  <span className="text-white font-semibold">{formatNumber(tkPosts)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lemon8 Overview */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
          <div className="h-1 bg-[#22c55e]" />
          <div className="p-5">
            <h3 className="text-white text-sm font-semibold mb-4">Lemon8 Overview</h3>
            {metricsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-5 bg-[#1a1a1a] rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[#737373] text-xs">Total Followers</span>
                  <span className="text-white font-semibold">{formatNumber(lmFollowers)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#737373] text-xs">Total Likes</span>
                  <span className="text-white font-semibold">{formatNumber(lmLikes)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#737373] text-xs">Total Posts</span>
                  <span className="text-white font-semibold">{formatNumber(lmPosts)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pinterest Overview */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
          <div className="h-1 bg-[#e60023]" />
          <div className="p-5">
            <h3 className="text-white text-sm font-semibold mb-4">Pinterest Overview</h3>
            {pinterestLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-5 bg-[#1a1a1a] rounded animate-pulse" />
                ))}
              </div>
            ) : pinterestAnalytics ? (
              <div className="space-y-3">
                {pinterestAnalytics.impressions > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[#737373] text-xs">Impressions</span>
                    <span className="text-white font-semibold">
                      {formatNumber(pinterestAnalytics.impressions)}
                    </span>
                  </div>
                )}
                {pinterestAnalytics.pin_clicks > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[#737373] text-xs">Pin Clicks</span>
                    <span className="text-white font-semibold">
                      {formatNumber(pinterestAnalytics.pin_clicks)}
                    </span>
                  </div>
                )}
                {pinterestAnalytics.saves > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[#737373] text-xs">Saves</span>
                    <span className="text-white font-semibold">
                      {formatNumber(pinterestAnalytics.saves)}
                    </span>
                  </div>
                )}
                {pinterestAnalytics.impressions === 0 &&
                  pinterestAnalytics.pin_clicks === 0 &&
                  pinterestAnalytics.saves === 0 && (
                    <p className="text-[#525252] text-xs">No data yet</p>
                  )}
              </div>
            ) : (
              <p className="text-[#525252] text-xs">No Pinterest accounts configured</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
