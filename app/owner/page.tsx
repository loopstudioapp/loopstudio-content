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
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}
function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

  // Load saved RevenueCat data from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rc_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.overview) { setRc(parsed.overview); setRcLoaded(true); }
        if (parsed.trials) setTrialSubs(parsed.trials);
        if (parsed.active) setActiveSubs(parsed.active);
      }
    } catch { /* ignore */ }
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
      if (!d.error) { trials = d.subscribers || []; setTrialSubs(trials); }
      else setTrialsError(d.error);
    } catch { setTrialsError("Failed to load"); }
    finally { setTrialsLoading(false); }

    try {
      const r = await fetch("/api/revenuecat?type=subscribers&filter=active");
      const d = await r.json();
      if (!d.error) { active = d.subscribers || []; setActiveSubs(active); }
      else setActiveError(d.error);
    } catch { setActiveError("Failed to load"); }
    finally { setActiveLoading(false); }

    // Save to localStorage
    try {
      localStorage.setItem("rc_data", JSON.stringify({ overview, trials, active, ts: Date.now() }));
    } catch { /* ignore */ }
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

  // Subscriber table renderer
  const SubTable = ({ items, loading, error, label, color }: { items: Subscriber[]; loading: boolean; error: string | null; label: string; color: string }) => (
    <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[#262626]">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-white text-sm font-semibold">{label}</h3>
        {!loading && !error && <span className="text-[#525252] text-xs">({items.length})</span>}
      </div>
      {loading ? (
        <div className="p-6 text-center text-[#525252] text-sm">Loading...</div>
      ) : error ? (
        <div className="p-6 text-center text-[#ef4444] text-sm">{error}</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-center text-[#525252] text-sm">None</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px]">
            <thead>
              <tr className="border-b border-[#262626]">
                {["Country", "App", "Plan", "Purchased", "Expires", "Revenue"].map((h, i) => (
                  <th key={h} className={`px-5 py-2.5 text-[10px] text-[#525252] uppercase tracking-wider font-semibold ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <tr key={i} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                  <td className="px-5 py-2.5 text-sm">{countryFlag(s.country)} <span className="text-[#737373] text-xs ml-1">{countryName(s.country)}</span></td>
                  <td className="px-5 py-2.5 text-sm text-white">{s.app || "—"}</td>
                  <td className="px-5 py-2.5 text-sm text-white">{s.plan || "—"}</td>
                  <td className="px-5 py-2.5 text-xs text-[#737373]">{fmtDate(s.purchase_date)}</td>
                  <td className="px-5 py-2.5 text-xs text-[#737373]">{fmtDate(s.expiry_date)}</td>
                  <td className="px-5 py-2.5 text-sm text-right text-white font-medium">{fmtCur(s.revenue || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

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

      {/* ═══ ROOMY AI REVENUE ═══ */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">Roomy AI</h2>
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
            {/* Stat Cards */}
            {rcLoading && !rc ? skeleton(4, "grid-cols-2 sm:grid-cols-4") : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
                  <p className="text-[#22c55e] text-[10px] uppercase tracking-wider font-semibold mb-1">Active Trials</p>
                  <p className="text-white text-3xl font-bold">{trialSubs.length || rc?.active_trials || 0}</p>
                  <p className="text-[#525252] text-[10px] mt-1">non-cancelled</p>
                </div>
                <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
                  <p className="text-[#3b82f6] text-[10px] uppercase tracking-wider font-semibold mb-1">Active Subs</p>
                  <p className="text-white text-3xl font-bold">{activeSubs.length || rc?.active_subs || 0}</p>
                  <p className="text-[#525252] text-[10px] mt-1">non-cancelled</p>
                </div>
                <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
                  <p className="text-[#8b5cf6] text-[10px] uppercase tracking-wider font-semibold mb-1">28-Day Revenue</p>
                  <p className="text-white text-3xl font-bold">{fmtCur(rc?.revenue_30d ?? 0)}</p>
                  <p className="text-[#525252] text-[10px] mt-1">last 28 days</p>
                </div>
                <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
                  <p className="text-[#f59e0b] text-[10px] uppercase tracking-wider font-semibold mb-1">Current MRR</p>
                  <p className="text-white text-3xl font-bold">{fmtCur(rc?.mrr ?? 0)}</p>
                  <p className="text-[#525252] text-[10px] mt-1">monthly recurring</p>
                </div>
              </div>
            )}

            {/* Always-visible Active Trials table */}
            <div className="mb-4">
              <SubTable items={trialSubs} loading={trialsLoading} error={trialsError} label="Active Trials" color="#22c55e" />
            </div>

            {/* Always-visible Active Subscriptions table */}
            <div>
              <SubTable items={activeSubs} loading={activeLoading} error={activeError} label="Active Subscriptions" color="#3b82f6" />
            </div>
          </>
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

      {/* ═══ PINTEREST ═══ */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#e60023]" />
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">Pinterest</h2>
        </div>
        {pinterestLoading ? skeleton(3, "grid-cols-1 sm:grid-cols-3") : pinterestMetrics.length === 0 ? (
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-8 text-center text-[#525252] text-sm">No Pinterest analytics data yet</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label="Impressions" value={fmtNum(pinTotal("impression"))} color="#22c55e" data={pinValues("impression")} dates={pinDates("impression")} />
            <MetricCard label="Pin Clicks" value={fmtNum(pinTotal("click"))} color="#3b82f6" data={pinValues("click")} dates={pinDates("click")} />
            <MetricCard label="Saves" value={fmtNum(pinTotal("save"))} color="#f59e0b" data={pinValues("save")} dates={pinDates("save")} />
          </div>
        )}
      </section>
    </div>
  );
}
