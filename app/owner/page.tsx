"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── Types ── */
type RCOverview = { active_trials: number; active_subs: number; revenue_30d: number; mrr: number };
type Subscriber = { id: string; country: string; app: string; plan: string; purchase_date: string; expiry_date: string; revenue: number };
type MetricsRow = { account_id: string; date: string; total_likes: number; posts: number; followers: number; lm8_total_likes: number; lm8_posts: number; lm8_followers: number };
type AnalyticsMetric = { label: string; data: { date: string; total: number }[] };
type FabiDay = { date: string; revenue_net: number; revenue_gross: number; discount_amount: number; invoice_count: number };
type FabiData = { today: FabiDay | null; daily: FabiDay[] };
type TodayPerApp = { today_revenue: number; new_revenue: number; new_subs: number; mrr: number };
type TodayTxn = { id: string; country: string; app: string; plan: string; product_id: string; store: string; occurred_at: string; expires_at: string; revenue: number; type: "NEW_SUB" | "RENEWAL" };
type MetaSpend = { configured: boolean; spend_native: number; spend_usd: number; currency: string; usd_rate: number; date: string; error?: string };
type ProfitSummary = { total_revenue: number; new_revenue: number; new_subs: number; adspend_usd: number; total_profit: number; new_profit: number; cost_per_new_sub: number };
type TodayStats = { today_vn: string; per_app: Record<string, TodayPerApp>; transactions: TodayTxn[]; ads?: MetaSpend; profit?: ProfitSummary };

/* ── Interactive Chart with Hover Tooltip ── */
function Chart({ data, dates, color, label, h = 80 }: { data: number[]; dates: string[]; color: string; label: string; h?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <div style={{ height: h }} className="flex items-center justify-center text-[#525252] text-xs">No data</div>;
  const w = 400;
  const pad = 8;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / range) * (h - pad * 2),
    val: v,
    date: dates[i] || "",
  }));
  const line = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const area = `${line} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;
  const gid = `g-${color.replace("#", "")}-${label.replace(/\s/g, "")}`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full cursor-crosshair"
        style={{ height: h }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * w;
          let closest = 0;
          let minDist = Infinity;
          pts.forEach((p, i) => { const d = Math.abs(p.x - x); if (d < minDist) { minDist = d; closest = i; } });
          setHover(closest);
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : i === pts.length - 1 ? 3 : 0} fill={color} className="transition-all duration-100" />
        ))}
        {hover !== null && (
          <line x1={pts[hover].x} y1={0} x2={pts[hover].x} y2={h} stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
        )}
      </svg>
      {/* Tooltip */}
      {hover !== null && (
        <div
          className="absolute top-0 pointer-events-none bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 shadow-xl z-10"
          style={{ left: `${(pts[hover].x / w) * 100}%`, transform: "translateX(-50%)" }}
        >
          <p className="text-white text-sm font-bold">{typeof pts[hover].val === "number" && pts[hover].val % 1 !== 0 ? pts[hover].val.toFixed(2) : fmtNum(pts[hover].val)}</p>
          <p className="text-[#737373] text-[10px]">{pts[hover].date.slice(5)}</p>
        </div>
      )}
      {/* Date labels */}
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-[#525252]">{dates[0]?.slice(5)}</span>
        <span className="text-[10px] text-[#525252]">{dates[dates.length - 1]?.slice(5)}</span>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}
function countryName(code: string): string {
  if (!code) return "—";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code.toUpperCase(); }
  catch { return code.toUpperCase(); }
}
function fmtCur(n: number): string { return "$" + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
// Currency with 2 decimals + sign-aware (for profit which can be negative)
function fmtCur2(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-$" : "$") + abs;
}
function fmtVnd(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M₫";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K₫";
  return n.toLocaleString("en-US") + "₫";
}
function fmtVndFull(n: number): string {
  return n.toLocaleString("en-US") + "₫";
}
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}
function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
// YYYY-MM-DD in Vietnam timezone (GMT+7) — used to bucket Loop Studio subs to "today"
function vnDate(input: Date | string): string {
  if (!input) return "";
  const d = typeof input === "string" ? new Date(input) : input;
  const ms = d.getTime();
  if (Number.isNaN(ms)) return "";
  // GMT+7: add 7h then read UTC calendar date
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
// Format date+time for the Today Subscriptions table (HH:mm in Vietnam tz)
function fmtVnTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/* ── Metric Card ── */
function MetricCard({ label, value, color, data, dates }: { label: string; value: string; color: string; data: number[]; dates: string[] }) {
  return (
    <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</p>
        <p className="text-white text-2xl font-bold">{value}</p>
      </div>
      <Chart data={data} dates={dates} color={color} label={label} h={72} />
    </div>
  );
}

/* ── Profit Grid (combined across apps: Total Profit, New Profit, Cost/New Sub, Total Adspend) ── */
function ProfitGrid({ profit, ads, loading }: { profit: ProfitSummary | undefined; ads: MetaSpend | undefined; loading: boolean }) {
  const totalProfit = profit?.total_profit ?? 0;
  const newProfit = profit?.new_profit ?? 0;
  const cpns = profit?.cost_per_new_sub ?? 0;
  const adspend = profit?.adspend_usd ?? 0;
  const profitColor = (n: number) => (n >= 0 ? "text-white" : "text-[#ef4444]");
  // Subtitle for adspend showing native VND amount + rate
  const adsSub = ads?.configured
    ? ads.currency !== "USD"
      ? `${ads.spend_native.toLocaleString("en-US")}${ads.currency === "VND" ? "₫" : " " + ads.currency} @ ${ads.usd_rate.toLocaleString("en-US")}`
      : "today's spend"
    : "Meta not connected";
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-[#10b981]" />
        <h3 className="text-white text-sm font-semibold">Profit</h3>
        <span className="text-[#525252] text-xs">all apps · today GMT+7</span>
        {ads?.error && <span className="text-[#ef4444] text-[10px]">⚠ {ads.error.slice(0, 60)}</span>}
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <p className="text-[#10b981] text-[10px] uppercase tracking-wider font-semibold mb-1">Total Profit</p>
            <p className={`text-3xl font-bold ${profitColor(totalProfit)}`}>{fmtCur2(totalProfit)}</p>
            <p className="text-[#525252] text-[10px] mt-1">all revenue − adspend</p>
          </div>
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <p className="text-[#10b981] text-[10px] uppercase tracking-wider font-semibold mb-1">New Profit</p>
            <p className={`text-3xl font-bold ${profitColor(newProfit)}`}>{fmtCur2(newProfit)}</p>
            <p className="text-[#525252] text-[10px] mt-1">new revenue − adspend</p>
          </div>
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <p className="text-[#f59e0b] text-[10px] uppercase tracking-wider font-semibold mb-1">Cost / New Sub</p>
            <p className="text-white text-3xl font-bold">{cpns > 0 ? fmtCur2(cpns) : "—"}</p>
            <p className="text-[#525252] text-[10px] mt-1">adspend ÷ new subs</p>
          </div>
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <p className="text-[#ef4444] text-[10px] uppercase tracking-wider font-semibold mb-1">Total Adspend</p>
            <p className="text-white text-3xl font-bold">{fmtCur2(adspend)}</p>
            <p className="text-[#525252] text-[10px] mt-1 truncate">{adsSub}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── App Stat Grid (4 boxes: Today Revenue, New Revenue, New Subs, MRR) ── */
function AppStatGrid({ appName, accent, stats, loading }: { appName: string; accent: string; stats: TodayPerApp | undefined; loading: boolean }) {
  const tr = stats?.today_revenue ?? 0;
  const nr = stats?.new_revenue ?? 0;
  const ns = stats?.new_subs ?? 0;
  const mrr = stats?.mrr ?? 0;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
        <h3 className="text-white text-sm font-semibold">{appName}</h3>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <p className="text-[#22c55e] text-[10px] uppercase tracking-wider font-semibold mb-1">Today Revenue</p>
            <p className="text-white text-3xl font-bold">{fmtCur(tr)}</p>
            <p className="text-[#525252] text-[10px] mt-1">new + renewal</p>
          </div>
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <p className="text-[#06b6d4] text-[10px] uppercase tracking-wider font-semibold mb-1">New Revenue</p>
            <p className="text-white text-3xl font-bold">{fmtCur(nr)}</p>
            <p className="text-[#525252] text-[10px] mt-1">new subs only</p>
          </div>
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <p className="text-[#8b5cf6] text-[10px] uppercase tracking-wider font-semibold mb-1">New Subs</p>
            <p className="text-white text-3xl font-bold">{ns.toLocaleString()}</p>
            <p className="text-[#525252] text-[10px] mt-1">new today</p>
          </div>
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <p className="text-[#f59e0b] text-[10px] uppercase tracking-wider font-semibold mb-1">MRR</p>
            <p className="text-white text-3xl font-bold">{fmtCur(mrr)}</p>
            <p className="text-[#525252] text-[10px] mt-1">monthly recurring</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Today Subscriptions table (new + renewals across visible apps) ── */
function TodayTxnTable({ txns, loading, todayVn }: { txns: TodayTxn[]; loading: boolean; todayVn: string }) {
  const planFor = (t: TodayTxn) => t.plan || "—";
  return (
    <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#262626]">
        <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
        <h3 className="text-white text-sm font-semibold">Today Subscriptions</h3>
        <span className="text-[#525252] text-xs">({todayVn} • GMT+7)</span>
        {!loading && <span className="text-[#525252] text-xs ml-1">· {txns.length}</span>}
      </div>
      {loading ? (
        <div className="p-6 text-center text-[#525252] text-sm">Loading...</div>
      ) : txns.length === 0 ? (
        <div className="p-6 text-center text-[#525252] text-sm">None</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-[#262626]">
                {["Country", "App", "Plan", "Time", "Revenue", "Type"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-2.5 text-[10px] text-[#525252] uppercase tracking-wider font-semibold ${i >= 4 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txns.map((t, i) => (
                <tr key={`${t.id}-${t.occurred_at}-${i}`} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                  <td className="px-5 py-2.5 text-sm">
                    {countryFlag(t.country)} <span className="text-[#737373] text-xs ml-1">{countryName(t.country)}</span>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-[#a3a3a3]">{t.app || "—"}</td>
                  <td className="px-5 py-2.5 text-sm text-white">{planFor(t)}</td>
                  <td className="px-5 py-2.5 text-xs text-[#737373]">{fmtVnTime(t.occurred_at)}</td>
                  <td className="px-5 py-2.5 text-sm text-right text-white font-medium">{fmtCur(t.revenue || 0)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                        t.type === "NEW_SUB"
                          ? "bg-[#3b82f6]/20 text-[#3b82f6]"
                          : "bg-[#22c55e]/20 text-[#22c55e]"
                      }`}
                    >
                      {t.type === "NEW_SUB" ? "New Sub" : "Renewal"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Main ── */
export default function OwnerDashboard() {
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  const [rc, setRc] = useState<RCOverview | null>(null);
  const [rcLoading, setRcLoading] = useState(false);
  const [rcLoaded, setRcLoaded] = useState(false);
  const [rcError, setRcError] = useState<string | null>(null);
  const [trialSubs, setTrialSubs] = useState<Subscriber[]>([]);
  const [activeSubs, setActiveSubs] = useState<Subscriber[]>([]);
  const [trialsLoading, setTrialsLoading] = useState(false);
  const [activeLoading, setActiveLoading] = useState(false);
  const [trialsError, setTrialsError] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);

  // Coffee shop (FABi)
  const [fabi, setFabi] = useState<FabiData | null>(null);
  const [fabiLoading, setFabiLoading] = useState(false);
  const [fabiError, setFabiError] = useState<string | null>(null);

  // Per-app today stats + today transactions (Loop Studio section)
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [todayStatsLoading, setTodayStatsLoading] = useState(false);

  // Load saved RevenueCat data from DB on mount
  useEffect(() => {
    fetch("/api/revenuecat/cache")
      .then((r) => r.json())
      .then((d) => {
        if (d.cached) {
          if (d.overview) { setRc(d.overview); setRcLoaded(true); }
          if (d.trials) setTrialSubs(d.trials);
          if (d.active) setActiveSubs(d.active);
        }
      })
      .catch(() => {});
  }, []);

  // Load cached coffee shop data on mount (read-only, no fresh API call)
  useEffect(() => {
    fetch("/api/fabi/sync?cached=1")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setFabi({ today: d.today || null, daily: d.daily || [] });
      })
      .catch(() => {});
  }, []);

  // Load today's Loop Studio stats on mount
  useEffect(() => {
    fetch("/api/revenuecat?type=today_stats")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) setTodayStats(d);
      })
      .catch(() => {});
  }, []);
  const [metrics, setMetrics] = useState<MetricsRow[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [pinterestMetrics, setPinterestMetrics] = useState<AnalyticsMetric[]>([]);
  const [pinterestLoading, setPinterestLoading] = useState(true);

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) { router.push("/"); return; }
  }, [router]);

  const loadRevenueCat = useCallback(async () => {
    setRcLoading(true); setRcError(null);
    setTrialsLoading(true); setActiveLoading(true);
    setTrialsError(null); setActiveError(null);
    setFabiLoading(true); setFabiError(null);
    setTodayStatsLoading(true);

    // Kick off coffee shop sync in parallel with RevenueCat fetches
    const fabiPromise = (async () => {
      try {
        const r = await fetch("/api/fabi/sync");
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || "Failed");
        setFabi({ today: d.today || null, daily: d.daily || [] });
      } catch (e: unknown) {
        setFabiError(e instanceof Error ? e.message : "Coffee shop sync failed");
      } finally {
        setFabiLoading(false);
      }
    })();

    // Per-app today stats — runs in parallel too
    const todayStatsPromise = (async () => {
      try {
        const r = await fetch("/api/revenuecat?type=today_stats");
        const d = await r.json();
        if (d && !d.error) setTodayStats(d);
      } catch { /* ignore */ }
      finally { setTodayStatsLoading(false); }
    })();

    let overview: RCOverview | null = null;
    let trials: Subscriber[] = [];
    let active: Subscriber[] = [];

    try {
      const r = await fetch("/api/revenuecat?type=overview");
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      overview = d;
      setRc(d);
      setRcLoaded(true);
    } catch (e: unknown) { setRcError(e instanceof Error ? e.message : "Failed"); }
    finally { setRcLoading(false); }

    try {
      const r = await fetch("/api/revenuecat?type=subscribers&filter=trial");
      const d = await r.json();
      if (!d.error) { trials = (d.subscribers || []).sort((a: Subscriber, b: Subscriber) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime()); setTrialSubs(trials); }
      else setTrialsError(d.error);
    } catch { setTrialsError("Failed to load"); }
    finally { setTrialsLoading(false); }

    try {
      const r = await fetch("/api/revenuecat?type=subscribers&filter=active");
      const d = await r.json();
      if (!d.error) { active = (d.subscribers || []).sort((a: Subscriber, b: Subscriber) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime()); setActiveSubs(active); }
      else setActiveError(d.error);
    } catch { setActiveError("Failed to load"); }
    finally { setActiveLoading(false); }

    // Save to DB (accessible across all devices)
    try {
      await fetch("/api/revenuecat/cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overview, trials, active }),
      });
    } catch { /* ignore */ }

    // Wait for parallel work to settle
    await Promise.all([fabiPromise, todayStatsPromise]);
  }, []);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((data: MetricsRow[]) => setMetrics(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setMetricsLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/pinterest/accounts")
      .then((r) => r.json())
      .then(async (accounts: { postiz_integration_id: string }[]) => {
        if (!accounts?.length) { setPinterestLoading(false); return; }
        const results = await Promise.all(
          accounts.map(async (a) => {
            try {
              const r = await fetch(`/api/pinterest/analytics?integration_id=${a.postiz_integration_id}&days=7`);
              return r.ok ? ((await r.json()) as AnalyticsMetric[]) : [];
            } catch { return []; }
          })
        );
        const merged: Record<string, AnalyticsMetric> = {};
        for (const arr of results) {
          for (const m of arr) {
            if (!merged[m.label]) { merged[m.label] = { ...m, data: m.data.map((d) => ({ ...d })) }; }
            else { m.data.forEach((d, i) => { if (merged[m.label].data[i]) merged[m.label].data[i].total += d.total; }); }
          }
        }
        setPinterestMetrics(Object.values(merged));
      })
      .catch(() => {})
      .finally(() => setPinterestLoading(false));
  }, []);

  // (SubTable removed — replaced by TodayTxnTable which handles new + renewal types)

  // TikTok / Lemon8 computed
  const latestByAccount = new Map<string, MetricsRow>();
  for (const m of metrics) {
    const existing = latestByAccount.get(m.account_id);
    if (!existing || m.date > existing.date) latestByAccount.set(m.account_id, m);
  }
  const latest = Array.from(latestByAccount.values());
  const tkLikes = latest.reduce((s, m) => s + (m.total_likes || 0), 0);
  const tkPosts = latest.reduce((s, m) => s + (m.posts || 0), 0);
  const lmLikes = latest.reduce((s, m) => s + (m.lm8_total_likes || 0), 0);
  const lmPosts = latest.reduce((s, m) => s + (m.lm8_posts || 0), 0);

  const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const dateSet = [...new Set(sorted.map((m) => m.date))].sort();
  const byDate = (field: keyof MetricsRow) =>
    dateSet.map((d) => sorted.filter((m) => m.date === d).reduce((s, m) => s + (Number(m[field]) || 0), 0));

  const pinMetric = (key: string) => {
    const exact: Record<string, string> = { impression: "Impressions", click: "Pin Clicks", save: "Saves" };
    return pinterestMetrics.find((m) => m.label === exact[key]);
  };
  const pinValues = (key: string) => pinMetric(key)?.data.map((d) => d.total) || [];
  const pinTotal = (key: string) => pinValues(key).reduce((s, v) => s + v, 0);
  const pinDates = (key: string) => pinMetric(key)?.data.map((d) => d.date) || [];

  const btnCls = "px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors";
  const skeleton = (count: number, cols: string) => (
    <div className={`grid ${cols} gap-4`}>
      {Array.from({ length: count }).map((_, i) => <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl h-44 animate-pulse" />)}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Loop Content Generation</h1>
          <p className="text-xs text-[#525252]">Dashboard Overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/owner/tiktok" className={btnCls}>TikTok</Link>
          <Link href="/owner/pinterest" className={btnCls}>Pinterest</Link>
          <button onClick={() => setLang(lang === "en" ? "vi" : "en")} className={btnCls}>{lang === "en" ? "VN" : "EN"}</button>
          <Link href="/" className={btnCls}>{t("logout")}</Link>
        </div>
      </div>

      {/* ═══ REVENUE ═══ */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">Loop Studio</h2>
          <button
            onClick={loadRevenueCat}
            disabled={rcLoading}
            className="px-3 py-1 text-[10px] text-[#737373] border border-[#262626] rounded-lg hover:text-white hover:border-[#404040] transition-colors disabled:opacity-50"
          >
            {rcLoading ? "Loading..." : rcLoaded ? "↻ Refresh" : "Load Data"}
          </button>
        </div>

        {!rcLoaded && !rcLoading && !rcError && (
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-8 text-center text-[#525252] text-sm">
            Click &quot;Load Data&quot; to fetch RevenueCat metrics
          </div>
        )}

        {rcError && (
          <div className="bg-[#141414] border border-[#ef4444]/20 rounded-xl p-5 text-[#ef4444] text-sm mb-4">{rcError}</div>
        )}

        {(rcLoaded || rcLoading) && (
          <>
            {/* ── Profit (top, combined across apps) ── */}
            <ProfitGrid
              profit={todayStats?.profit}
              ads={todayStats?.ads}
              loading={todayStatsLoading && !todayStats}
            />

            {/* ── GrailScan ── */}
            <AppStatGrid
              appName="GrailScan"
              accent="#a855f7"
              stats={todayStats?.per_app["GrailScan"]}
              loading={todayStatsLoading && !todayStats}
            />

            {/* ── Roomy AI (lower) ── */}
            <AppStatGrid
              appName="Roomy AI"
              accent="#3b82f6"
              stats={todayStats?.per_app["Roomy AI"]}
              loading={todayStatsLoading && !todayStats}
            />

            {/* ── Today Subscriptions (both apps, new + renewal) ── */}
            <TodayTxnTable
              txns={todayStats?.transactions || []}
              loading={todayStatsLoading && !todayStats}
              todayVn={todayStats?.today_vn || vnDate(new Date())}
            />
          </>
        )}
      </section>

      {/* ═══ COFFEE SHOP ═══ */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]" />
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">Ket Coffee</h2>
          {fabiLoading && <span className="text-[10px] text-[#525252]">syncing…</span>}
        </div>

        {fabiError && (
          <div className="bg-[#141414] border border-[#ef4444]/20 rounded-xl p-5 text-[#ef4444] text-sm mb-4">{fabiError}</div>
        )}

        {!fabi && !fabiLoading && !fabiError && (
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-8 text-center text-[#525252] text-sm">
            Click &quot;Refresh&quot; above to load coffee shop data
          </div>
        )}

        {fabi && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Today revenue */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <p className="text-[#d97706] text-[10px] uppercase tracking-wider font-semibold mb-1">Today Revenue</p>
              <p className="text-white text-3xl font-bold">{fmtVndFull(fabi.today?.revenue_net || 0)}</p>
              <p className="text-[#525252] text-[10px] mt-1">{fabi.today?.invoice_count || 0} invoices</p>
            </div>
            {/* 30-day chart */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#d97706] text-[10px] uppercase tracking-wider font-semibold">30-Day Revenue</p>
                <p className="text-white text-2xl font-bold">{fmtVnd(fabi.daily.reduce((s, d) => s + (d.revenue_net || 0), 0))}</p>
              </div>
              <Chart
                data={fabi.daily.map((d) => d.revenue_net)}
                dates={fabi.daily.map((d) => d.date)}
                color="#d97706"
                label="Coffee Revenue"
                h={72}
              />
            </div>
          </div>
        )}
      </section>

      {/* ═══ TIKTOK ═══ */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff0050]" />
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">TikTok</h2>
        </div>
        {metricsLoading ? skeleton(2, "grid-cols-1 sm:grid-cols-2") : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard label="Total Likes" value={fmtNum(tkLikes)} color="#ff0050" data={byDate("total_likes")} dates={dateSet} />
            <MetricCard label="Total Posts" value={fmtNum(tkPosts)} color="#f472b6" data={byDate("posts")} dates={dateSet} />
          </div>
        )}
      </section>

      {/* ═══ LEMON8 ═══ */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">Lemon8</h2>
        </div>
        {metricsLoading ? skeleton(2, "grid-cols-1 sm:grid-cols-2") : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard label="Total Likes" value={fmtNum(lmLikes)} color="#22c55e" data={byDate("lm8_total_likes")} dates={dateSet} />
            <MetricCard label="Total Posts" value={fmtNum(lmPosts)} color="#4ade80" data={byDate("lm8_posts")} dates={dateSet} />
          </div>
        )}
      </section>

      {/* Pinterest analytics hidden — PostBridge has no analytics API */}
    </div>
  );
}
