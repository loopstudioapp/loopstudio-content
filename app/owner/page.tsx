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

  // Build time-series data for charts (aggregate by date across accounts)
  const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const dateSet = [...new Set(sorted.map((m) => m.date))].sort();
  const byDate = (field: keyof MetricsRow) =>
    dateSet.map((d) => sorted.filter((m) => m.date === d).reduce((s, m) => s + (Number(m[field]) || 0), 0));

  const tkLikesByDay = byDate("total_likes");
  const tkPostsByDay = byDate("posts");
  const lmLikesByDay = byDate("lm8_total_likes");
  const lmPostsByDay = byDate("lm8_posts");

  // Pinterest metric helpers
  const pinMetric = (label: string) => pinterestMetrics.find((m) => m.label.toLowerCase().includes(label));
  const pinValues = (label: string) => pinMetric(label)?.data.map((d) => d.total) || [];
  const pinTotal = (label: string) => pinValues(label).reduce((s, v) => s + v, 0);
  const pinDates = (label: string) => pinMetric(label)?.data.map((d) => d.date) || [];

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

      {/* ═══ TIKTOK ═══ */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff0050]" />
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">TikTok</h2>
        </div>
        {metricsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1].map((i) => <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl h-40 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* TikTok Likes */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#ff0050] text-xs font-semibold uppercase tracking-wider">Total Likes</p>
                <p className="text-white text-2xl font-bold">{fmtNum(tkLikes)}</p>
              </div>
              {tkLikesByDay.length >= 2 && (
                <>
                  <MiniChart data={tkLikesByDay} color="#ff0050" h={64} />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-[#525252]">{dateSet[0]?.slice(5)}</span>
                    <span className="text-[10px] text-[#525252]">{dateSet[dateSet.length - 1]?.slice(5)}</span>
                  </div>
                </>
              )}
            </div>

            {/* TikTok Posts */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#f472b6] text-xs font-semibold uppercase tracking-wider">Total Posts</p>
                <p className="text-white text-2xl font-bold">{fmtNum(tkPosts)}</p>
              </div>
              {tkPostsByDay.length >= 2 && (
                <>
                  <MiniChart data={tkPostsByDay} color="#f472b6" h={64} />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-[#525252]">{dateSet[0]?.slice(5)}</span>
                    <span className="text-[10px] text-[#525252]">{dateSet[dateSet.length - 1]?.slice(5)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ═══ LEMON8 ═══ */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">Lemon8</h2>
        </div>
        {metricsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1].map((i) => <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl h-40 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Lemon8 Likes */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#22c55e] text-xs font-semibold uppercase tracking-wider">Total Likes</p>
                <p className="text-white text-2xl font-bold">{fmtNum(lmLikes)}</p>
              </div>
              {lmLikesByDay.length >= 2 && (
                <>
                  <MiniChart data={lmLikesByDay} color="#22c55e" h={64} />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-[#525252]">{dateSet[0]?.slice(5)}</span>
                    <span className="text-[10px] text-[#525252]">{dateSet[dateSet.length - 1]?.slice(5)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Lemon8 Posts */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#4ade80] text-xs font-semibold uppercase tracking-wider">Total Posts</p>
                <p className="text-white text-2xl font-bold">{fmtNum(lmPosts)}</p>
              </div>
              {lmPostsByDay.length >= 2 && (
                <>
                  <MiniChart data={lmPostsByDay} color="#4ade80" h={64} />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-[#525252]">{dateSet[0]?.slice(5)}</span>
                    <span className="text-[10px] text-[#525252]">{dateSet[dateSet.length - 1]?.slice(5)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ═══ PINTEREST ═══ */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#e60023]" />
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">Pinterest</h2>
        </div>
        {pinterestLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="bg-[#141414] border border-[#262626] rounded-xl h-40 animate-pulse" />)}
          </div>
        ) : pinterestMetrics.length === 0 ? (
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-8 text-center text-[#525252] text-sm">No Pinterest analytics data yet</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Impressions */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#22c55e] text-xs font-semibold uppercase tracking-wider">Impressions</p>
                <p className="text-white text-2xl font-bold">{fmtNum(pinTotal("impression"))}</p>
              </div>
              {pinValues("impression").length >= 2 && (
                <>
                  <MiniChart data={pinValues("impression")} color="#22c55e" h={64} />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-[#525252]">{pinDates("impression")[0]?.slice(5)}</span>
                    <span className="text-[10px] text-[#525252]">{pinDates("impression").slice(-1)[0]?.slice(5)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Pin Clicks */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#3b82f6] text-xs font-semibold uppercase tracking-wider">Pin Clicks</p>
                <p className="text-white text-2xl font-bold">{fmtNum(pinTotal("click"))}</p>
              </div>
              {pinValues("click").length >= 2 && (
                <>
                  <MiniChart data={pinValues("click")} color="#3b82f6" h={64} />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-[#525252]">{pinDates("click")[0]?.slice(5)}</span>
                    <span className="text-[10px] text-[#525252]">{pinDates("click").slice(-1)[0]?.slice(5)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Saves */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[#f59e0b] text-xs font-semibold uppercase tracking-wider">Saves</p>
                <p className="text-white text-2xl font-bold">{fmtNum(pinTotal("save"))}</p>
              </div>
              {pinValues("save").length >= 2 && (
                <>
                  <MiniChart data={pinValues("save")} color="#f59e0b" h={64} />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-[#525252]">{pinDates("save")[0]?.slice(5)}</span>
                    <span className="text-[10px] text-[#525252]">{pinDates("save").slice(-1)[0]?.slice(5)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
