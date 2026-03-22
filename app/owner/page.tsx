"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── Types ── */
type RCOverview = {
  active_trials: number;
  active_subs: number;
  revenue_30d: number;
  mrr: number;
  new_customers: number;
  active_users: number;
};

type Subscriber = {
  id: string;
  country: string;
  app: string;
  plan: string;
  purchase_date: string;
  expiry_date: string;
  revenue: number;
};

type MetricsRow = {
  account_id: string;
  date: string;
  total_likes: number;
  posts: number;
  followers: number;
  lm8_total_likes: number;
  lm8_posts: number;
  lm8_followers: number;
};

type AnalyticsMetric = {
  label: string;
  data: { date: string; total: number }[];
};

/* ── SVG Line Chart ── */
function MiniChart({ data, color, h = 48 }: { data: number[]; color: string; h?: number }) {
  if (data.length < 2) return <div style={{ height: h }} />;
  const w = 200;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pad = 4;
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }));
  const line = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ");
  const area = `${line} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;
  const gid = `g-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3" fill={color} />
    </svg>
  );
}

/* ── Helpers ── */
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

function fmtCur(n: number): string {
  return "$" + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ── Main ── */
export default function OwnerDashboard() {
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  const [rcTab, setRcTab] = useState<"overall" | "roomy">("overall");
  const [rc, setRc] = useState<RCOverview | null>(null);
  const [rcLoading, setRcLoading] = useState(true);
  const [rcError, setRcError] = useState<string | null>(null);
  const [subPanel, setSubPanel] = useState<"trial" | "active" | null>(null);
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<MetricsRow[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [pinterestMetrics, setPinterestMetrics] = useState<AnalyticsMetric[]>([]);
  const [pinterestLoading, setPinterestLoading] = useState(true);

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) { router.push("/"); return; }
  }, [router]);

  // RevenueCat overview
  useEffect(() => {
    setRcLoading(true);
    fetch("/api/revenuecat?type=overview")
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setRc(d); })
      .catch((e) => setRcError(e.message))
      .finally(() => setRcLoading(false));
  }, []);

  // TikTok/Lemon8 metrics
  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((data: MetricsRow[]) => setMetrics(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setMetricsLoading(false));
  }, []);

  // Pinterest analytics
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
        // Merge metrics across accounts
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

  const fetchSubs = useCallback(async (filter: "trial" | "active") => {
    setSubsLoading(true); setSubsError(null);
    try {
      const r = await fetch(`/api/revenuecat?type=subscribers&filter=${filter}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setSubs(d.subscribers || []);
    } catch (e: unknown) { setSubsError(e instanceof Error ? e.message : "Failed"); }
    finally { setSubsLoading(false); }
  }, []);

  const togglePanel = (p: "trial" | "active") => {
    if (subPanel === p) { setSubPanel(null); return; }
    setSubPanel(p); fetchSubs(p);
  };

  // Computed TikTok / Lemon8 stats
  // Get latest metrics per account
  const latestByAccount = new Map<string, MetricsRow>();
  for (const m of metrics) {
    const existing = latestByAccount.get(m.account_id);
    if (!existing || m.date > existing.date) latestByAccount.set(m.account_id, m);
  }
  const latest = Array.from(latestByAccount.values());
  const tkFollowers = latest.reduce((s, m) => s + (m.followers || 0), 0);
  const tkLikes = latest.reduce((s, m) => s + (m.total_likes || 0), 0);
  const tkPosts = latest.reduce((s, m) => s + (m.posts || 0), 0);
  const lmFollowers = latest.reduce((s, m) => s + (m.lm8_followers || 0), 0);
  const lmLikes = latest.reduce((s, m) => s + (m.lm8_total_likes || 0), 0);
  const lmPosts = latest.reduce((s, m) => s + (m.lm8_posts || 0), 0);

  // Get last 7 days of metrics for charts
  const last7 = metrics
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-21); // 3 accounts × 7 days
  const dateSet = [...new Set(last7.map((m) => m.date))].sort();
  const tkFollowersByDay = dateSet.map((d) => last7.filter((m) => m.date === d).reduce((s, m) => s + (m.followers || 0), 0));
  const lmFollowersByDay = dateSet.map((d) => last7.filter((m) => m.date === d).reduce((s, m) => s + (m.lm8_followers || 0), 0));

  const METRIC_COLORS: Record<string, string> = {
    "Pin click rate": "#8b5cf6",
    Impressions: "#22c55e",
    "Pin Clicks": "#3b82f6",
    Saves: "#f59e0b",
  };

  const btnCls = "px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors";
  const tabCls = (active: boolean) => `px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${active ? "bg-white/10 text-white" : "text-[#525252] hover:text-white"}`;

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
          <button onClick={() => setLang(lang === "en" ? "vi" : "en")} className={btnCls}>
            {lang === "en" ? "VN" : "EN"}
          </button>
          <Link href="/" className={btnCls}>{t("logout")}</Link>
        </div>
      </div>

      {/* ═══ REVENUE ═══ */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">Revenue</h2>
          <div className="flex bg-[#141414] rounded-lg p-0.5 border border-[#262626]">
            <button onClick={() => setRcTab("overall")} className={tabCls(rcTab === "overall")}>Overall</button>
            <button onClick={() => setRcTab("roomy")} className={tabCls(rcTab === "roomy")}>Roomy AI</button>
          </div>
        </div>

        {rcLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl p-5 h-28 animate-pulse" />
            ))}
          </div>
        ) : rcError ? (
          <div className="bg-[#141414] border border-[#ef4444]/20 rounded-xl p-5 text-[#ef4444] text-sm">{rcError}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Active Trials */}
            <button onClick={() => togglePanel("trial")} className={`bg-[#141414] border rounded-xl p-5 text-left transition-all hover:bg-[#1a1a1a] ${subPanel === "trial" ? "border-[#22c55e]/40 ring-1 ring-[#22c55e]/20" : "border-[#262626]"}`}>
              <p className="text-[#22c55e] text-[10px] uppercase tracking-wider font-semibold mb-1">Active Trials</p>
              <p className="text-white text-3xl font-bold">{rc?.active_trials ?? 0}</p>
              <p className="text-[#525252] text-[10px] mt-1">click to view</p>
            </button>

            {/* Active Subs */}
            <button onClick={() => togglePanel("active")} className={`bg-[#141414] border rounded-xl p-5 text-left transition-all hover:bg-[#1a1a1a] ${subPanel === "active" ? "border-[#3b82f6]/40 ring-1 ring-[#3b82f6]/20" : "border-[#262626]"}`}>
              <p className="text-[#3b82f6] text-[10px] uppercase tracking-wider font-semibold mb-1">Active Subs</p>
              <p className="text-white text-3xl font-bold">{rc?.active_subs ?? 0}</p>
              <p className="text-[#525252] text-[10px] mt-1">click to view</p>
            </button>

            {/* 30-Day Revenue */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <p className="text-[#8b5cf6] text-[10px] uppercase tracking-wider font-semibold mb-1">28-Day Revenue</p>
              <p className="text-white text-3xl font-bold">{fmtCur(rc?.revenue_30d ?? 0)}</p>
              <p className="text-[#525252] text-[10px] mt-1">last 28 days</p>
            </div>

            {/* MRR */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <p className="text-[#f59e0b] text-[10px] uppercase tracking-wider font-semibold mb-1">Current MRR</p>
              <p className="text-white text-3xl font-bold">{fmtCur(rc?.mrr ?? 0)}</p>
              <p className="text-[#525252] text-[10px] mt-1">monthly recurring</p>
            </div>
          </div>
        )}

        {/* Subscriber Panel */}
        {subPanel && (
          <div className="mt-4 bg-[#141414] border border-[#262626] rounded-xl overflow-hidden animate-in fade-in duration-200">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${subPanel === "trial" ? "bg-[#22c55e]" : "bg-[#3b82f6]"}`} />
                <h3 className="text-white text-sm font-semibold">
                  {subPanel === "trial" ? "Active Trials" : "Active Subscriptions"}
                </h3>
                {!subsLoading && !subsError && <span className="text-[#525252] text-xs">({subs.length})</span>}
              </div>
              <button onClick={() => setSubPanel(null)} className="text-[#525252] hover:text-white text-sm">✕</button>
            </div>
            {subsLoading ? (
              <div className="p-8 text-center text-[#525252] text-sm">Loading subscribers...</div>
            ) : subsError ? (
              <div className="p-8 text-center text-[#ef4444] text-sm">{subsError}</div>
            ) : subs.length === 0 ? (
              <div className="p-8 text-center text-[#525252] text-sm">No subscribers found</div>
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
                    {subs.map((s, i) => (
                      <tr key={i} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                        <td className="px-5 py-2.5 text-sm">{countryFlag(s.country)} <span className="text-[#737373] text-xs ml-1">{s.country?.toUpperCase() || "—"}</span></td>
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
        )}
      </section>

      {/* ═══ PLATFORM ANALYTICS ═══ */}
      <section>
        <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider mb-5">Platform Analytics</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* TikTok */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-[#262626]">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff0050]" />
                <h3 className="text-white text-sm font-semibold">TikTok</h3>
              </div>
            </div>
            <div className="p-5">
              {metricsLoading ? (
                <div className="space-y-4">{[0,1,2].map(i => <div key={i} className="h-10 bg-[#1a1a1a] rounded animate-pulse" />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div>
                      <p className="text-[#525252] text-[10px] uppercase">Followers</p>
                      <p className="text-white text-lg font-bold">{fmtNum(tkFollowers)}</p>
                    </div>
                    <div>
                      <p className="text-[#525252] text-[10px] uppercase">Likes</p>
                      <p className="text-white text-lg font-bold">{fmtNum(tkLikes)}</p>
                    </div>
                    <div>
                      <p className="text-[#525252] text-[10px] uppercase">Posts</p>
                      <p className="text-white text-lg font-bold">{fmtNum(tkPosts)}</p>
                    </div>
                  </div>
                  {tkFollowersByDay.length >= 2 && (
                    <div>
                      <p className="text-[#525252] text-[10px] mb-1">Followers Trend</p>
                      <MiniChart data={tkFollowersByDay} color="#ff0050" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Lemon8 */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-[#262626]">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />
                <h3 className="text-white text-sm font-semibold">Lemon8</h3>
              </div>
            </div>
            <div className="p-5">
              {metricsLoading ? (
                <div className="space-y-4">{[0,1,2].map(i => <div key={i} className="h-10 bg-[#1a1a1a] rounded animate-pulse" />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div>
                      <p className="text-[#525252] text-[10px] uppercase">Followers</p>
                      <p className="text-white text-lg font-bold">{fmtNum(lmFollowers)}</p>
                    </div>
                    <div>
                      <p className="text-[#525252] text-[10px] uppercase">Likes</p>
                      <p className="text-white text-lg font-bold">{fmtNum(lmLikes)}</p>
                    </div>
                    <div>
                      <p className="text-[#525252] text-[10px] uppercase">Posts</p>
                      <p className="text-white text-lg font-bold">{fmtNum(lmPosts)}</p>
                    </div>
                  </div>
                  {lmFollowersByDay.length >= 2 && (
                    <div>
                      <p className="text-[#525252] text-[10px] mb-1">Followers Trend</p>
                      <MiniChart data={lmFollowersByDay} color="#22c55e" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Pinterest */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-[#262626]">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e60023]" />
                <h3 className="text-white text-sm font-semibold">Pinterest</h3>
              </div>
            </div>
            <div className="p-5">
              {pinterestLoading ? (
                <div className="space-y-4">{[0,1,2].map(i => <div key={i} className="h-10 bg-[#1a1a1a] rounded animate-pulse" />)}</div>
              ) : pinterestMetrics.length === 0 ? (
                <p className="text-[#525252] text-xs">No analytics data yet</p>
              ) : (
                <div className="space-y-4">
                  {pinterestMetrics.map((m) => {
                    const values = m.data.map((d) => d.total);
                    const total = values.reduce((s, v) => s + v, 0);
                    if (total === 0) return null;
                    const color = METRIC_COLORS[m.label] || "#737373";
                    return (
                      <div key={m.label}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] uppercase" style={{ color }}>{m.label}</p>
                          <p className="text-white text-sm font-bold">{fmtNum(total)}</p>
                        </div>
                        <MiniChart data={values} color={color} h={36} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
