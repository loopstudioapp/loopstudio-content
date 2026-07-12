"use client";

import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  ExternalLink,
  KeyRound,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type PriceObservation = {
  price_usd: number | string;
  method: string;
  source_urls: string[];
  model: string;
  observed_at: string;
};

type CardIdentity = {
  id: string;
  canonical_key: string;
  identity: Record<string, unknown>;
  confidence: string | null;
  created_at: string;
  updated_at: string;
  prices: PriceObservation[];
};

type ScanRequest = {
  id: string;
  user_id: string;
  status: "processing" | "completed" | "failed_retryable" | "failed_permanent";
  stage: string;
  app_version: string;
  locale: string;
  identity: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  pricing_method: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type DailyCall = {
  date: string;
  calls: number;
  tokens: number;
  cost_usd: number | string;
};

type OperationCall = {
  operation: string;
  calls: number;
  tokens: number;
  cost_usd: number | string;
};

type DashboardData = {
  generated_at: string;
  summary: {
    cards: number;
    total_scans: number;
    scans_today: number;
    processing: number;
    ai_calls_today: number;
    ai_cost_today: number | string;
  };
  cards: CardIdentity[];
  recent_requests: ScanRequest[];
  daily_calls: DailyCall[];
  calls_by_operation: OperationCall[];
};

const REFRESH_INTERVAL = 5_000;

function text(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: unknown, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number(value));
}

function formatDate(value: string, includeTime = true): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit", second: "2-digit" } : {}),
  }).format(date);
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function cardTitle(identity: Record<string, unknown> | null): string {
  if (!identity) return "Identifying card…";
  const player = text(identity.playerName, "Unknown player");
  const cardNumber = text(identity.cardNumber, "");
  return `${player}${cardNumber ? ` ${cardNumber}` : ""}`;
}

function cardSubtitle(identity: Record<string, unknown> | null): string {
  if (!identity) return "Waiting for AI identification";
  return [text(identity.year, ""), text(identity.setName, "")].filter(Boolean).join(" · ") || "Card details unavailable";
}

function maskedUser(value: string): string {
  return value ? `user_${value.slice(-6)}` : "anonymous";
}

function Login({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/grailscan/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError("Incorrect password");
        return;
      }
      setPassword("");
      onAuthenticated();
    } catch {
      setError("Could not connect");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-[#0a0a0a]">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="w-14 h-14 bg-[#00b894] text-black flex items-center justify-center mb-6 rounded-lg">
          <ShieldCheck size={26} strokeWidth={2.4} />
        </div>
        <p className="text-[#00b894] text-xs font-semibold uppercase tracking-[0.18em] mb-2">GrailScan</p>
        <h1 className="text-2xl font-bold text-white mb-2">Analytics dashboard</h1>
        <p className="text-sm text-[#737373] mb-7">Private Loop Studio access</p>
        <label htmlFor="dashboard-password" className="block text-xs font-semibold text-[#a3a3a3] mb-2">
          Password
        </label>
        <div className="relative">
          <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
          <input
            id="dashboard-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full h-11 bg-[#141414] border border-[#333] rounded-lg pl-10 pr-3 text-white outline-none focus:border-[#00b894]"
            autoFocus
          />
        </div>
        {error && <p className="text-[#ef4444] text-xs mt-2">{error}</p>}
        <button
          type="submit"
          disabled={!password || submitting}
          className="w-full h-11 mt-4 bg-[#00b894] text-black text-sm font-bold rounded-lg disabled:opacity-40 hover:bg-[#11cdaa] transition-colors"
        >
          {submitting ? "Signing in…" : "Open dashboard"}
        </button>
      </form>
    </main>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Database;
  color: string;
}) {
  return (
    <div className="bg-[#141414] border border-[#262626] rounded-lg p-4 min-h-[126px] flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[#737373] font-semibold">{label}</p>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs text-[#525252] mt-1">{detail}</p>
      </div>
    </div>
  );
}

function DailyCallsChart({ data }: { data: DailyCall[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 960;
  const height = 210;
  const pad = { top: 28, right: 12, bottom: 30, left: 42 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const maxCalls = Math.max(...data.map((point) => point.calls), 1);
  const gridMax = Math.max(4, Math.ceil(maxCalls / 4) * 4);
  const slot = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.max(8, Math.min(20, slot * 0.62));
  const y = (value: number) => pad.top + plotHeight - (value / gridMax) * plotHeight;

  return (
    <div className="overflow-x-auto pb-2 [direction:rtl] sm:[direction:ltr]">
      <div dir="ltr" className="relative min-w-[900px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full cursor-crosshair"
          role="img"
          aria-label="AI API calls by day for the last 30 days"
          onMouseLeave={() => setHovered(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const cursorX = ((event.clientX - rect.left) / rect.width) * width;
            const index = Math.floor((cursorX - pad.left) / slot);
            setHovered(Math.max(0, Math.min(data.length - 1, index)));
          }}
        >
          {[0, gridMax / 2, gridMax].map((value) => {
            const lineY = y(value);
            return (
              <g key={value}>
                <line x1={pad.left} y1={lineY} x2={width - pad.right} y2={lineY} stroke="#2a2a2a" />
                <text x={pad.left - 7} y={lineY + 3} textAnchor="end" fill="#666" fontSize="9">{value}</text>
              </g>
            );
          })}
          {data.map((point, index) => {
            const barHeight = Math.max(2, plotHeight - (y(point.calls) - pad.top));
            const barX = pad.left + index * slot + slot / 2 - barWidth / 2;
            const active = hovered === index;
            return (
              <g key={point.date}>
                {active && <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotHeight} fill="#00b894" opacity="0.08" />}
                <rect
                  x={barX}
                  y={pad.top + plotHeight - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx="2"
                  fill={active ? "#e5e5e5" : "#00b894"}
                  opacity={active ? 1 : 0.8}
                />
                {(index % 5 === 0 || index === data.length - 1) && (
                  <text x={barX + barWidth / 2} y={height - 8} textAnchor="middle" fill="#666" fontSize="8">
                    {point.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered !== null && data[hovered] && (
          <div
            className="absolute top-0 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 shadow-xl pointer-events-none z-10"
            style={{
              left: `${((pad.left + hovered * slot + slot / 2) / width) * 100}%`,
              transform: hovered < 3 ? "translateX(0)" : hovered > data.length - 4 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            <p className="text-white text-sm font-bold tabular-nums">{data[hovered].calls} calls</p>
            <p className="text-[#737373] text-[10px]">{data[hovered].date}</p>
            <p className="text-[#00b894] text-[10px] mt-1">{formatMoney(data[hovered].cost_usd, 4)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RequestStatus({ request }: { request: ScanRequest }) {
  const styles = request.status === "completed"
    ? "text-[#22c55e] bg-[#22c55e12] border-[#22c55e33]"
    : request.status === "processing"
      ? "text-[#22d3ee] bg-[#22d3ee12] border-[#22d3ee33]"
      : "text-[#ef4444] bg-[#ef444412] border-[#ef444433]";
  const label = request.status.replaceAll("_", " ");
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full border ${styles}`}>
      {request.status === "processing" && <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse" />}
      {label}
    </span>
  );
}

function CardDatabase({ cards }: { cards: CardIdentity[] }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((card) => JSON.stringify(card.identity).toLowerCase().includes(needle));
  }, [cards, query]);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-[#00b894] text-[11px] uppercase tracking-[0.16em] font-semibold">Database</p>
          <h2 className="text-lg font-bold text-white mt-1">Identified cards</h2>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player, set, or card number"
            className="w-full h-9 bg-[#141414] border border-[#2a2a2a] rounded-lg pl-9 pr-3 text-sm text-white placeholder:text-[#525252] outline-none focus:border-[#00b894]"
          />
        </div>
      </div>
      <div className="border border-[#262626] rounded-lg overflow-hidden bg-[#111]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-[#161616] border-b border-[#262626]">
              <tr className="text-[10px] uppercase tracking-[0.12em] text-[#666]">
                <th className="px-4 py-3 font-semibold">Card</th>
                <th className="px-4 py-3 font-semibold">Condition</th>
                <th className="px-4 py-3 font-semibold">Latest price</th>
                <th className="px-4 py-3 font-semibold">History</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222]">
              {filtered.map((card) => {
                const latest = card.prices[0];
                const open = expanded === card.id;
                return (
                  <FragmentCardRow
                    key={card.id}
                    card={card}
                    latest={latest}
                    open={open}
                    onToggle={() => setExpanded(open ? null : card.id)}
                  />
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-[#525252]">No cards match this search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FragmentCardRow({
  card,
  latest,
  open,
  onToggle,
}: {
  card: CardIdentity;
  latest?: PriceObservation;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-[#151515] transition-colors">
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-left group">
            <p className="text-sm font-semibold text-white group-hover:text-[#00b894] transition-colors">{cardTitle(card.identity)}</p>
            <p className="text-xs text-[#666] mt-0.5">{cardSubtitle(card.identity)}</p>
          </button>
        </td>
        <td className="px-4 py-3 text-xs text-[#a3a3a3]">{text(card.identity.condition)}</td>
        <td className="px-4 py-3 text-sm font-bold text-[#00b894] tabular-nums">{latest ? formatMoney(latest.price_usd) : "—"}</td>
        <td className="px-4 py-3 text-xs text-[#737373]">{card.prices.length} observation{card.prices.length === 1 ? "" : "s"}</td>
        <td className="px-4 py-3 text-xs text-[#737373] whitespace-nowrap">{formatDate(card.updated_at)}</td>
        <td className="pr-3 text-[#525252]">
          <button onClick={onToggle} aria-label={open ? "Collapse price history" : "Expand price history"} className="w-8 h-8 flex items-center justify-center hover:text-white">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-[#0d0d0d]">
          <td colSpan={6} className="px-4 py-4">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#666] mb-3">
              <span>Confidence: <strong className="text-[#a3a3a3] font-medium">{card.confidence || "—"}</strong></span>
              <span>Rarity: <strong className="text-[#a3a3a3] font-medium">{text(card.identity.rarity)}</strong></span>
              <span>Parallel: <strong className="text-[#a3a3a3] font-medium">{text(card.identity.parallel)}</strong></span>
            </div>
            {card.prices.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead><tr className="text-[9px] uppercase tracking-wider text-[#525252] border-b border-[#222]">
                    <th className="text-left py-2 font-semibold">Observed</th>
                    <th className="text-left py-2 font-semibold">Price</th>
                    <th className="text-left py-2 font-semibold">Method</th>
                    <th className="text-left py-2 font-semibold">Model</th>
                    <th className="text-left py-2 font-semibold">Sources</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[#1d1d1d]">
                    {card.prices.map((price, index) => (
                      <tr key={`${price.observed_at}-${index}`} className="text-xs text-[#a3a3a3]">
                        <td className="py-2.5 whitespace-nowrap">{formatDate(price.observed_at)}</td>
                        <td className="py-2.5 font-bold text-white">{formatMoney(price.price_usd)}</td>
                        <td className="py-2.5">{price.method.replaceAll("_", " ")}</td>
                        <td className="py-2.5 text-[#737373]">{price.model}</td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-2">
                            {price.source_urls.length ? price.source_urls.map((url, sourceIndex) => (
                              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#00b894] hover:text-white">
                                Source {sourceIndex + 1}<ExternalLink size={11} />
                              </a>
                            )) : <span className="text-[#525252]">No source URL</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-[#525252]">No price observations yet.</p>}
          </td>
        </tr>
      )}
    </>
  );
}

export default function GrailScanDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const response = await fetch("/api/grailscan/data", { cache: "no-store" });
      if (response.status === 401) {
        setAuthRequired(true);
        setData(null);
        return;
      }
      if (!response.ok) throw new Error("Could not load dashboard");
      setData(await response.json() as DashboardData);
      setAuthRequired(false);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    if (authRequired || !data) return;
    const timer = window.setInterval(() => load(false), REFRESH_INTERVAL);
    return () => window.clearInterval(timer);
  }, [authRequired, data, load]);

  async function logout() {
    await fetch("/api/grailscan/auth", { method: "DELETE" });
    setData(null);
    setAuthRequired(true);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-[#737373]">Loading GrailScan…</div>;
  }
  if (authRequired) return <Login onAuthenticated={() => load(true)} />;

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-md bg-[#00b894] text-black flex items-center justify-center font-black text-sm">G</div>
              <span className="text-[#00b894] text-[11px] font-semibold uppercase tracking-[0.18em]">GrailScan</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Data & AI activity</h1>
            <div className="flex items-center gap-2 mt-2 text-xs text-[#666]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              Live · refreshes every 5 seconds
              {data?.generated_at && <span className="hidden sm:inline">· synced {formatDate(data.generated_at)}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => load(false)}
              disabled={refreshing}
              title="Refresh now"
              className="w-9 h-9 rounded-lg bg-[#141414] border border-[#2a2a2a] text-[#737373] hover:text-white flex items-center justify-center disabled:opacity-50"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              onClick={logout}
              title="Sign out"
              className="w-9 h-9 rounded-lg bg-[#141414] border border-[#2a2a2a] text-[#737373] hover:text-white flex items-center justify-center"
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-5 px-4 py-3 border border-[#ef444455] bg-[#ef444410] rounded-lg text-sm text-[#ef4444]">{error}</div>
        )}

        {data && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Cards in database" value={data.summary.cards.toLocaleString()} detail={`${data.summary.total_scans.toLocaleString()} total scans`} icon={Database} color="#00b894" />
              <StatCard label="Scans today" value={data.summary.scans_today.toLocaleString()} detail={`${data.summary.processing} processing now`} icon={Activity} color="#22d3ee" />
              <StatCard label="AI calls today" value={data.summary.ai_calls_today.toLocaleString()} detail="Recorded model requests" icon={Cpu} color="#3b82f6" />
              <StatCard label="AI cost today" value={formatMoney(data.summary.ai_cost_today, 4)} detail="OpenRouter reported cost" icon={WalletCards} color="#f59e0b" />
            </section>

            <section className="mt-10">
              <div className="mb-4">
                <p className="text-[#3b82f6] text-[11px] uppercase tracking-[0.16em] font-semibold">Usage</p>
                <h2 className="text-lg font-bold text-white mt-1">Daily AI API calls</h2>
              </div>
              <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-3">
                <div className="bg-[#141414] border border-[#262626] rounded-lg p-4 overflow-hidden">
                  <DailyCallsChart data={data.daily_calls} />
                </div>
                <div className="bg-[#141414] border border-[#262626] rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[#666] font-semibold mb-3">Last 30 days by operation</p>
                  <div className="divide-y divide-[#252525]">
                    {data.calls_by_operation.map((operation) => (
                      <div key={operation.operation} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-white truncate">{operation.operation.replaceAll("_", " ")}</p>
                          <p className="text-[10px] text-[#525252] mt-0.5">{number(operation.tokens).toLocaleString()} tokens</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-white tabular-nums">{operation.calls}</p>
                          <p className="text-[10px] text-[#f59e0b]">{formatMoney(operation.cost_usd, 4)}</p>
                        </div>
                      </div>
                    ))}
                    {!data.calls_by_operation.length && <p className="text-xs text-[#525252] py-8 text-center">No AI calls recorded.</p>}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-10">
              <div className="flex items-end justify-between gap-3 mb-4">
                <div>
                  <p className="text-[#22d3ee] text-[11px] uppercase tracking-[0.16em] font-semibold">Live requests</p>
                  <h2 className="text-lg font-bold text-white mt-1">Cards users are scanning</h2>
                </div>
                <p className="text-xs text-[#525252]">Latest {data.recent_requests.length}</p>
              </div>
              <div className="border border-[#262626] rounded-lg overflow-hidden bg-[#111]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left">
                    <thead className="bg-[#161616] border-b border-[#262626]">
                      <tr className="text-[10px] uppercase tracking-[0.12em] text-[#666]">
                        <th className="px-4 py-3 font-semibold">Requested card</th>
                        <th className="px-4 py-3 font-semibold">User</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Stage</th>
                        <th className="px-4 py-3 font-semibold">Price</th>
                        <th className="px-4 py-3 font-semibold">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222]">
                      {data.recent_requests.map((request) => (
                        <tr key={request.id} className="hover:bg-[#151515] transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-white">{cardTitle(request.identity)}</p>
                            <p className="text-xs text-[#666] mt-0.5">{cardSubtitle(request.identity)}</p>
                            {request.error_code && <p className="text-[10px] text-[#ef4444] mt-1">{request.error_code}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-[#737373]">{maskedUser(request.user_id)}</td>
                          <td className="px-4 py-3"><RequestStatus request={request} /></td>
                          <td className="px-4 py-3 text-xs text-[#a3a3a3] capitalize">{request.stage}</td>
                          <td className="px-4 py-3 text-sm font-bold text-[#00b894]">
                            {request.result?.referencePrice ? formatMoney(request.result.referencePrice) : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-xs text-[#a3a3a3] flex items-center gap-1"><Clock3 size={11} />{relativeTime(request.created_at)}</p>
                            <p className="text-[10px] text-[#525252] mt-0.5">{formatDate(request.created_at)}</p>
                          </td>
                        </tr>
                      ))}
                      {!data.recent_requests.length && (
                        <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-[#525252]">No scans recorded.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <CardDatabase cards={data.cards} />
            <footer className="py-8 mt-8 border-t border-[#1f1f1f] text-[10px] text-[#444] flex justify-between">
              <span>GrailScan private analytics</span>
              <span>Times shown in your browser timezone</span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
