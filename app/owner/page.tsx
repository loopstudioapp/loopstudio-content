"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── Types ── */
type FabiDay = { date: string; revenue_net: number; revenue_gross: number; discount_amount: number; invoice_count: number };
type FabiData = { today: FabiDay | null; daily: FabiDay[] };
type TodayPerApp = { today_revenue: number; new_revenue: number; new_subs: number; mrr: number };
type TodayTxn = { id: string; country: string; app: string; plan: string; product_id: string; store: string; occurred_at: string; expires_at: string; revenue: number; type: "NEW_SUB" | "RENEWAL" };
type MetaSpend = { configured: boolean; spend_native: number; spend_usd: number; currency: string; usd_rate: number; date: string; error?: string };
type ProfitSummary = { total_revenue: number; new_revenue: number; new_subs: number; apple_commission_rate: number; meta_vat_rate: number; net_revenue: number; net_new_revenue: number; adspend_usd: number; adspend_with_vat: number; total_profit: number; new_profit: number; cost_per_new_sub: number };
type DailyPoint = {
  date: string;
  revenue: number;
  profit: number;
  new_subs?: number;
  adspend_with_vat?: number;
  cost_per_sub?: number;
  openrouter_cost?: number;
  revenuecat_cost?: number;
};
type TodayStats = { today_vn: string; per_app: Record<string, TodayPerApp>; transactions: TodayTxn[]; ads?: MetaSpend; profit?: ProfitSummary; daily?: DailyPoint[] };
const META_VAT_RATE = 0.10;
const OWNER_APP = "GrailScan";
const TODAY_STATS_URL = `/api/revenuecat?type=today_stats&app=${encodeURIComponent(OWNER_APP)}`;

function mergeChartStats(prev: TodayStats | null, next: TodayStats): TodayStats {
  if (!prev) return next;
  return { ...prev, daily: next.daily || prev.daily };
}

/* ── Interactive Chart with Hover Tooltip ── */
function Chart({ data, dates, color, label, h = 80, zeroLine = false }: { data: number[]; dates: string[]; color: string; label: string; h?: number; zeroLine?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <div style={{ height: h }} className="flex items-center justify-center text-[#525252] text-xs">No data</div>;
  const w = 400;
  const pad = 8;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const yOf = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: yOf(v),
    val: v,
    date: dates[i] || "",
  }));
  const y0 = yOf(0); // y-coordinate of the $0 baseline
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
        {zeroLine && (
          <>
            <line x1={pad} y1={y0} x2={w - pad} y2={y0} stroke="#737373" strokeWidth="1" strokeDasharray="4,3" opacity="0.6" />
            <text x={pad} y={y0 - 3} fill="#737373" fontSize="9" opacity="0.8">$0</text>
          </>
        )}
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

/* ── Labeled daily bars for metrics that need exact day-by-day scanning ── */
function DailyBarChart({
  data,
  dates,
  color,
  negativeColor,
  label,
  valueLabel,
  tooltipValue,
}: {
  data: number[];
  dates: string[];
  color: string;
  negativeColor?: string;
  label: string;
  valueLabel: (value: number) => string;
  tooltipValue: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) return <div className="h-40 flex items-center justify-center text-[#525252] text-xs">No data</div>;

  const w = 960;
  const h = 150;
  const pad = { top: 25, right: 8, bottom: 26, left: 38 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const niceCeil = (value: number) => {
    const safeValue = Math.max(value, 1);
    const magnitude = 10 ** Math.floor(Math.log10(safeValue));
    return (Math.ceil((safeValue / magnitude) * 2) / 2) * magnitude;
  };
  const rawMin = Math.min(...data, 0);
  const rawMax = Math.max(...data, 0);
  const chartMin = rawMin < 0 ? -niceCeil(Math.abs(rawMin)) : 0;
  const chartMax = niceCeil(rawMax);
  const chartRange = chartMax - chartMin || 1;
  const slot = plotW / data.length;
  const barW = Math.max(8, Math.min(22, slot * 0.62));
  const yOf = (value: number) => pad.top + ((chartMax - value) / chartRange) * plotH;
  const zeroY = yOf(0);
  const gridValues = chartMin < 0 ? [chartMax, 0, chartMin] : [chartMax, chartMax / 2, 0];

  return (
    <div className="relative overflow-x-auto pb-1 [direction:rtl] sm:[direction:ltr]">
      <div dir="ltr" className="relative min-w-[960px]">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="block w-full cursor-crosshair"
          role="img"
          aria-label={`${label} by day for the last 30 days`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * w;
            const index = Math.floor((x - pad.left) / slot);
            setHover(Math.max(0, Math.min(data.length - 1, index)));
          }}
        >
          {gridValues.map((value) => {
            const y = yOf(value);
            const isZeroLine = value === 0 && chartMin < 0;
            return (
              <g key={value}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={w - pad.right}
                  y2={y}
                  stroke={isZeroLine ? "#737373" : "#2f2f2f"}
                  strokeWidth="1"
                  strokeDasharray={isZeroLine ? "4,3" : undefined}
                />
                <text x={pad.left - 5} y={y + 3} textAnchor="end" fill="#666" fontSize="8">{valueLabel(value)}</text>
              </g>
            );
          })}
          {data.map((value, i) => {
            const x = pad.left + i * slot + slot / 2;
            const valueY = yOf(value);
            const barY = value === 0 ? zeroY - 2 : Math.min(valueY, zeroY);
            const barHeight = Math.max(2, Math.abs(zeroY - valueY));
            const labelY = value < 0 ? Math.min(h - 17, valueY + 11) : Math.max(10, valueY - 5);
            const active = hover === i;
            const barColor = value < 0 ? negativeColor || color : color;
            return (
              <g key={`${dates[i]}-${i}`}>
                {active && <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill={color} opacity="0.08" />}
                <rect
                  x={x - barW / 2}
                  y={barY}
                  width={barW}
                  height={barHeight}
                  rx="2"
                  fill={barColor}
                  opacity={active ? 1 : 0.78}
                />
                <text x={x} y={labelY} textAnchor="middle" fill={active ? "#fff" : "#d4d4d4"} fontSize="9" fontWeight="600">
                  {valueLabel(value)}
                </text>
                <text x={x} y={h - 7} textAnchor="middle" fill={active ? "#d4d4d4" : "#666"} fontSize="8">
                  {dates[i]?.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="absolute top-0 pointer-events-none bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5 shadow-xl z-10"
            style={{
              left: `${((pad.left + hover * slot + slot / 2) / w) * 100}%`,
              transform: hover < 2 ? "translateX(0)" : hover > data.length - 3 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            <p className="text-white text-sm font-bold whitespace-nowrap">{tooltipValue(data[hover])}</p>
            <p className="text-[#737373] text-[10px] whitespace-nowrap">{dates[hover]}</p>
          </div>
        )}
      </div>
    </div>
  );
}

type DailyCostBreakdown = {
  meta: number;
  apple: number;
  revenueCat: number;
  openRouter: number;
};

const COST_SEGMENTS = [
  { key: "meta", label: "Meta", color: "#0082fb" },
  { key: "apple", label: "Apple", color: "#f5f5f7" },
  { key: "revenueCat", label: "RevenueCat", color: "#f2545b" },
  { key: "openRouter", label: "OpenRouter", color: "#c8ff00" },
] as const;

function StackedCostChart({ data, dates }: { data: DailyCostBreakdown[]; dates: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) return <div className="h-40 flex items-center justify-center text-[#525252] text-xs">No data</div>;

  const w = 960;
  const h = 165;
  const pad = { top: 25, right: 8, bottom: 26, left: 38 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const totals = data.map((day) => COST_SEGMENTS.reduce((sum, segment) => sum + day[segment.key], 0));
  const rawMax = Math.max(...totals, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const chartMax = (Math.ceil((rawMax / magnitude) * 2) / 2) * magnitude;
  const slot = plotW / data.length;
  const barW = Math.max(8, Math.min(22, slot * 0.62));
  const yOf = (value: number) => pad.top + ((chartMax - value) / chartMax) * plotH;
  const gridValues = [chartMax, chartMax / 2, 0];

  return (
    <div className="relative overflow-x-auto pb-1 [direction:rtl] sm:[direction:ltr]">
      <div dir="ltr" className="relative min-w-[960px]">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="block w-full cursor-crosshair"
          role="img"
          aria-label="Meta, Apple, RevenueCat, and OpenRouter costs by day for the last 30 days"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * w;
            const index = Math.floor((x - pad.left) / slot);
            setHover(Math.max(0, Math.min(data.length - 1, index)));
          }}
        >
          {gridValues.map((value) => {
            const y = yOf(value);
            return (
              <g key={value}>
                <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#2f2f2f" strokeWidth="1" />
                <text x={pad.left - 5} y={y + 3} textAnchor="end" fill="#666" fontSize="8">{fmtCompactCur(value)}</text>
              </g>
            );
          })}
          {data.map((day, i) => {
            const x = pad.left + i * slot + slot / 2;
            const active = hover === i;
            let cumulative = 0;
            return (
              <g key={`${dates[i]}-${i}`}>
                {active && <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill="#f59e0b" opacity="0.08" />}
                {COST_SEGMENTS.map((segment) => {
                  const value = day[segment.key];
                  const bottom = yOf(cumulative);
                  cumulative += value;
                  const top = yOf(cumulative);
                  return value > 0 ? (
                    <rect
                      key={segment.key}
                      x={x - barW / 2}
                      y={top}
                      width={barW}
                      height={Math.max(1, bottom - top)}
                      fill={segment.color}
                      opacity={active ? 1 : 0.86}
                    />
                  ) : null;
                })}
                <text x={x} y={Math.max(10, yOf(totals[i]) - 5)} textAnchor="middle" fill={active ? "#fff" : "#d4d4d4"} fontSize="9" fontWeight="600">
                  {fmtCompactCur(totals[i])}
                </text>
                <text x={x} y={h - 7} textAnchor="middle" fill={active ? "#d4d4d4" : "#666"} fontSize="8">
                  {dates[i]?.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="absolute top-0 pointer-events-none bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 shadow-xl z-10 min-w-36"
            style={{
              left: `${((pad.left + hover * slot + slot / 2) / w) * 100}%`,
              transform: hover < 2 ? "translateX(0)" : hover > data.length - 3 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            <div className="flex items-center justify-between gap-5 mb-1.5">
              <p className="text-[#a3a3a3] text-[10px] whitespace-nowrap">{dates[hover]}</p>
              <p className="text-white text-xs font-bold whitespace-nowrap">{fmtCur2(totals[hover])}</p>
            </div>
            {COST_SEGMENTS.map((segment) => (
              <div key={segment.key} className="flex items-center justify-between gap-5 text-[10px] leading-5">
                <span className="flex items-center gap-1.5 text-[#a3a3a3] whitespace-nowrap">
                  <span className="w-2 h-2" style={{ backgroundColor: segment.color }} />
                  {segment.label}
                </span>
                <span className="text-white font-medium">{fmtApiCost(data[hover][segment.key])}</span>
              </div>
            ))}
          </div>
        )}
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
function fmtCompactCur(n: number): string {
  const rounded = Math.round(n);
  return `${rounded < 0 ? "-" : ""}$${Math.abs(rounded).toLocaleString("en-US")}`;
}
// Currency with 2 decimals + sign-aware (for profit which can be negative)
function fmtCur2(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-$" : "$") + abs;
}
function fmtApiCost(n: number): string {
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: n > 0 && n < 1 ? 4 : 2,
    maximumFractionDigits: n > 0 && n < 1 ? 4 : 2,
  });
}
// Like fmtCur2 but always shows an explicit + / − sign (for profit boxes)
function fmtSignedCur(n: number): string {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (n < 0 ? "-$" : "+$") + abs;
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
// YYYY-MM-DD in Vietnam timezone (GMT+7) — used to bucket GrailScan subs to "today"
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

/* ── Profit Grid (Total Profit, New Profit, Cost/New Sub, Total Adspend) ── */
type TaxMode = "normal" | "personal" | "corporate";
function ProfitGrid({ profit, ads, daily, loading }: { profit: ProfitSummary | undefined; ads: MetaSpend | undefined; daily: DailyPoint[] | undefined; loading: boolean }) {
  const [taxMode, setTaxMode] = useState<TaxMode>("normal");
  // Apply the selected tax to a profit figure given its revenue base.
  // - personal: 7% of revenue is taxed (deducted from profit)
  // - corporate: 20% of profit (only when profitable; no tax on a loss)
  const applyTax = (profitVal: number, revenueVal: number): number => {
    if (taxMode === "personal") return profitVal - 0.07 * revenueVal;
    if (taxMode === "corporate") return profitVal > 0 ? profitVal * 0.8 : profitVal;
    return profitVal;
  };

  const totalProfit = applyTax(profit?.total_profit ?? 0, profit?.total_revenue ?? 0);
  const newProfit = applyTax(profit?.new_profit ?? 0, profit?.new_revenue ?? 0);
  const cpns = profit?.cost_per_new_sub ?? 0;
  const adspend = profit?.adspend_with_vat ?? 0;
  const applePct = Math.round((profit?.apple_commission_rate ?? 0.15) * 100);
  const vatPct = Math.round((profit?.meta_vat_rate ?? META_VAT_RATE) * 100);
  const profitColor = (n: number) => (n >= 0 ? "text-[#22c55e]" : "text-[#ef4444]");
  const taxNote =
    taxMode === "personal" ? " · −7% personal tax" : taxMode === "corporate" ? " · −20% corporate tax" : "";
  const taxBtns: { key: TaxMode; label: string }[] = [
    { key: "normal", label: "Normal" },
    { key: "personal", label: "Personal 7%" },
    { key: "corporate", label: "Corporate 20%" },
  ];
  // Per-day profit with tax applied (for the 30-day profit chart)
  const taxedProfit = (daily || []).map((d) => applyTax(d.profit, d.revenue));
  const totalRevenue30 = (daily || []).reduce((sum, day) => sum + day.revenue, 0);
  const totalProfit30 = taxedProfit.reduce((sum, value) => sum + value, 0);
  const openRouterCost30 = (daily || []).reduce((sum, day) => sum + (day.openrouter_cost || 0), 0);
  const revenueCatCost30 = (daily || []).reduce((sum, day) => sum + (day.revenuecat_cost || 0), 0);
  const appleCost30 = (daily || []).reduce(
    (sum, day) => sum + day.revenue * (profit?.apple_commission_rate ?? 0.15),
    0
  );
  const metaCost30 = (daily || []).reduce((sum, day) => sum + (day.adspend_with_vat || 0), 0);
  const totalCost30 = metaCost30 + appleCost30 + revenueCatCost30 + openRouterCost30;
  const dailyCosts = (daily || []).map((day) => ({
    meta: day.adspend_with_vat || 0,
    apple: day.revenue * (profit?.apple_commission_rate ?? 0.15),
    revenueCat: day.revenuecat_cost || 0,
    openRouter: day.openrouter_cost || 0,
  }));
  const usdToVnd = ads?.usd_rate ?? 0;
  const totalNewSubs30 = (daily || []).reduce((s, d) => s + (d.new_subs || 0), 0);
  const totalSubCost30 = (daily || []).reduce(
    (s, d) => s + (d.adspend_with_vat ?? ((d.cost_per_sub || 0) * (d.new_subs || 0))),
    0
  );
  const costPerSub30 = totalNewSubs30 > 0 ? totalSubCost30 / totalNewSubs30 : 0;
  // Subtitle for adspend showing native VND (incl VAT) + rate
  const nativeWithVat = ads?.configured ? ads.spend_native * (1 + (profit?.meta_vat_rate ?? META_VAT_RATE)) : 0;
  const adsSub = ads?.configured
    ? ads.currency !== "USD"
      ? `${Math.round(nativeWithVat).toLocaleString("en-US")}${ads.currency === "VND" ? "₫" : " " + ads.currency} incl ${vatPct}% VAT`
      : `incl ${vatPct}% VAT`
    : "Meta not connected";
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-[#10b981]" />
          <h3 className="text-white text-sm font-semibold">Profit</h3>
          <span className="text-[#525252] text-xs">GrailScan · today GMT+7 · net of {applePct}% Apple{taxNote}</span>
          {ads?.error && <span className="text-[#ef4444] text-[10px]">⚠ {ads.error.slice(0, 60)}</span>}
        </div>
        <div className="flex items-center gap-1">
          {taxBtns.map((b) => (
            <button
              key={b.key}
              onClick={() => setTaxMode(b.key)}
              className={`px-2.5 py-1 text-[10px] rounded-lg border transition-colors ${
                taxMode === b.key
                  ? "text-white border-[#10b981] bg-[#10b981]/10"
                  : "text-[#737373] border-[#262626] hover:text-white hover:border-[#404040]"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
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
            <p className={`text-3xl font-bold ${profitColor(totalProfit)}`}>{fmtSignedCur(totalProfit)}</p>
            <p className="text-[#525252] text-[10px] mt-1">net rev − adspend</p>
          </div>
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
            <p className="text-[#10b981] text-[10px] uppercase tracking-wider font-semibold mb-1">New Profit</p>
            <p className={`text-3xl font-bold ${profitColor(newProfit)}`}>{fmtSignedCur(newProfit)}</p>
            <p className="text-[#525252] text-[10px] mt-1">net new rev − adspend</p>
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

      {/* 30-day charts */}
      {!loading && daily && daily.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="sm:col-span-2 bg-[#141414] border border-[#262626] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#22c55e] text-[10px] uppercase tracking-wider font-semibold">30-Day Revenue</p>
              <div className="text-right">
                <p className="text-white text-2xl font-bold">{fmtCur2(totalRevenue30)}</p>
                {usdToVnd > 0 && (
                  <p className="text-[#737373] text-[11px] mt-0.5">≈ {fmtVndFull(Math.round(totalRevenue30 * usdToVnd))}</p>
                )}
              </div>
            </div>
            <DailyBarChart
              data={daily.map((d) => d.revenue)}
              dates={daily.map((d) => d.date)}
              color="#22c55e"
              label="Revenue"
              valueLabel={fmtCompactCur}
              tooltipValue={fmtCur2}
            />
          </div>
          <div className="sm:col-span-2 bg-[#141414] border border-[#262626] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#10b981] text-[10px] uppercase tracking-wider font-semibold">30-Day Profit</p>
              <div className="text-right">
                <p className="text-white text-2xl font-bold">{fmtCur2(totalProfit30)}</p>
                {usdToVnd > 0 && (
                  <p className="text-[#737373] text-[11px] mt-0.5">≈ {fmtVndFull(Math.round(totalProfit30 * usdToVnd))}</p>
                )}
              </div>
            </div>
            <DailyBarChart
              data={taxedProfit}
              dates={daily.map((d) => d.date)}
              color="#10b981"
              negativeColor="#ef4444"
              label="Profit"
              valueLabel={fmtCompactCur}
              tooltipValue={fmtCur2}
            />
          </div>
          <div className="sm:col-span-2 bg-[#141414] border border-[#262626] rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-[#f59e0b] text-[10px] uppercase tracking-wider font-semibold">30-Day Cost</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {COST_SEGMENTS.map((segment) => {
                    const values = { meta: metaCost30, apple: appleCost30, revenueCat: revenueCatCost30, openRouter: openRouterCost30 };
                    return (
                      <span key={segment.key} className="flex items-center gap-1.5 text-[10px] text-[#a3a3a3]">
                        <span className="w-2 h-2" style={{ backgroundColor: segment.color }} />
                        {segment.label} <span className="text-white font-medium">{fmtCur2(values[segment.key])}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-white text-2xl font-bold">{fmtCur2(totalCost30)}</p>
                {usdToVnd > 0 && (
                  <p className="text-[#737373] text-[11px] mt-0.5">≈ {fmtVndFull(Math.round(totalCost30 * usdToVnd))}</p>
                )}
              </div>
            </div>
            <StackedCostChart data={dailyCosts} dates={daily.map((d) => d.date)} />
            <p className="text-[#525252] text-[10px] mt-2">Meta includes 10% VAT · OpenRouter uses official UTC activity</p>
          </div>
          <div className="sm:col-span-2 bg-[#141414] border border-[#262626] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#d946ef] text-[10px] uppercase tracking-wider font-semibold">30-Day New Subs</p>
              <p className="text-white text-2xl font-bold">{fmtNum(totalNewSubs30)}</p>
            </div>
            <DailyBarChart
              data={daily.map((d) => d.new_subs || 0)}
              dates={daily.map((d) => d.date)}
              color="#d946ef"
              label="New subscriptions"
              valueLabel={(value) => value.toFixed(0)}
              tooltipValue={(value) => `${value.toFixed(0)} new ${value === 1 ? "sub" : "subs"}`}
            />
          </div>
          <div className="sm:col-span-2 bg-[#141414] border border-[#262626] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#f59e0b] text-[10px] uppercase tracking-wider font-semibold">30-Day Subs Cost</p>
              <p className="text-white text-2xl font-bold">{costPerSub30 > 0 ? fmtCur2(costPerSub30) : "—"}</p>
            </div>
            <DailyBarChart
              data={daily.map((d) => d.cost_per_sub || 0)}
              dates={daily.map((d) => d.date)}
              color="#f59e0b"
              label="Cost per subscription"
              valueLabel={(value) => `$${value.toFixed(1)}`}
              tooltipValue={(value) => fmtCur2(value)}
            />
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

/* ── Today Subscriptions table (new + renewals) ── */
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

  // GrailScan-only stats and transactions for the owner dashboard.
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [todayStatsLoading, setTodayStatsLoading] = useState(true);
  const [todayStatsError, setTodayStatsError] = useState<string | null>(null);
  const [fabi, setFabi] = useState<FabiData | null>(null);
  const [fabiLoading, setFabiLoading] = useState(false);
  const [fabiError, setFabiError] = useState<string | null>(null);

  // Ket Coffee stays independent from the GrailScan-only app metrics.
  useEffect(() => {
    fetch("/api/fabi/sync?cached=1")
      .then((response) => response.json())
      .then((data) => {
        if (data.ok) setFabi({ today: data.today || null, daily: data.daily || [] });
      })
      .catch(() => {});
  }, []);

  // Load today's GrailScan stats on mount.
  useEffect(() => {
    let cancelled = false;

    async function loadInitialTodayStats() {
      setTodayStatsLoading(true);
      setTodayStatsError(null);
      let fastLoaded = false;
      try {
        const cached = await fetch(`${TODAY_STATS_URL}&cached=1`);
        if (cached.ok) {
          const d = await cached.json();
          if (!cancelled && d && !d.error) setTodayStats(d);
          return;
        }

        const fast = await fetch(`${TODAY_STATS_URL}&fast=1`);
        if (fast.ok) {
          const d = await fast.json();
          if (!cancelled && d && !d.error) {
            setTodayStats(d);
            fastLoaded = true;
            setTodayStatsLoading(false);
          }
        }

        const full = await fetch(`${TODAY_STATS_URL}&refresh=1`);
        const d = await full.json();
        if (!full.ok || d.error) throw new Error(d.error || "Failed to rebuild GrailScan charts");
        if (!cancelled) setTodayStats((prev) => mergeChartStats(prev, d));
      } catch (error) {
        if (!cancelled) setTodayStatsError(error instanceof Error ? error.message : "Failed to load GrailScan data");
      } finally {
        if (!cancelled && !fastLoaded) setTodayStatsLoading(false);
      }
    }

    loadInitialTodayStats();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) { router.push("/"); return; }
  }, [router]);

  const loadRevenueCat = useCallback(async () => {
    setTodayStatsLoading(true);
    setTodayStatsError(null);
    setFabiLoading(true);
    setFabiError(null);

    const fabiPromise = (async () => {
      try {
        const response = await fetch("/api/fabi/sync");
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Coffee shop sync failed");
        setFabi({ today: data.today || null, daily: data.daily || [] });
      } catch (error) {
        setFabiError(error instanceof Error ? error.message : "Coffee shop sync failed");
      } finally {
        setFabiLoading(false);
      }
    })();

    let fastLoaded = false;
    try {
      const fast = await fetch(`${TODAY_STATS_URL}&fast=1`);
      const data = await fast.json();
      if (!fast.ok || data.error) throw new Error(data.error || "Fast refresh failed");
      setTodayStats(data);
      fastLoaded = true;
      setTodayStatsLoading(false);
    } catch (error) {
      setTodayStatsError(error instanceof Error ? error.message : "Failed to refresh GrailScan data");
    }

    try {
      const full = await fetch(`${TODAY_STATS_URL}&refresh=1`);
      const data = await full.json();
      if (!full.ok || data.error) throw new Error(data.error || "Chart refresh failed");
      setTodayStats((prev) => mergeChartStats(prev, data));
      setTodayStatsError(null);
    } catch (error) {
      setTodayStatsError(error instanceof Error ? error.message : "Failed to rebuild GrailScan charts");
    } finally {
      if (!fastLoaded) setTodayStatsLoading(false);
    }
    await fabiPromise;
  }, []);

  // (SubTable removed — replaced by TodayTxnTable which handles new + renewal types)

  const btnCls = "px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors";

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
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider">GrailScan</h2>
          <button
            onClick={loadRevenueCat}
            disabled={todayStatsLoading}
            className="px-3 py-1 text-[10px] text-[#737373] border border-[#262626] rounded-lg hover:text-white hover:border-[#404040] transition-colors disabled:opacity-50"
          >
            {todayStatsLoading ? "Loading..." : todayStats ? "↻ Refresh" : "Load Data"}
          </button>
        </div>

        {todayStatsError && (
          <div className="bg-[#141414] border border-[#ef4444]/20 rounded-xl p-5 text-[#ef4444] text-sm mb-4">{todayStatsError}</div>
        )}

        <ProfitGrid
          profit={todayStats?.profit}
          ads={todayStats?.ads}
          daily={todayStats?.daily}
          loading={todayStatsLoading && !todayStats}
        />

        <AppStatGrid
          appName={OWNER_APP}
          accent="#a855f7"
          stats={todayStats?.per_app[OWNER_APP]}
          loading={todayStatsLoading && !todayStats}
        />

        <TodayTxnTable
          txns={(todayStats?.transactions || []).filter((transaction) => transaction.app === OWNER_APP)}
          loading={todayStatsLoading && !todayStats}
          todayVn={todayStats?.today_vn || vnDate(new Date())}
        />
      </section>

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
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <p className="text-[#d97706] text-[10px] uppercase tracking-wider font-semibold mb-1">Today Revenue</p>
              <p className="text-white text-3xl font-bold">{fmtVndFull(fabi.today?.revenue_net || 0)}</p>
              <p className="text-[#525252] text-[10px] mt-1">{fabi.today?.invoice_count || 0} invoices</p>
            </div>
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#d97706] text-[10px] uppercase tracking-wider font-semibold">30-Day Revenue</p>
                <p className="text-white text-2xl font-bold">{fmtVnd(fabi.daily.reduce((sum, day) => sum + (day.revenue_net || 0), 0))}</p>
              </div>
              <Chart
                data={fabi.daily.map((day) => day.revenue_net)}
                dates={fabi.daily.map((day) => day.date)}
                color="#d97706"
                label="Coffee Revenue"
                h={72}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
