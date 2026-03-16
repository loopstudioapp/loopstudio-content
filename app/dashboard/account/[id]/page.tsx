"use client";

import { useState, useEffect, use } from "react";
import { supabase, Account, DailyMetric } from "@/lib/supabase";
import { formatNumber, formatDelta, ANGLE_NAMES } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import PromptGenerator from "@/components/PromptGenerator";

export default function AccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [account, setAccount] = useState<Account | null>(null);
  const [allMetrics, setAllMetrics] = useState<DailyMetric[]>([]);
  const router = useRouter();
  const { t } = useLang();

  useEffect(() => {
    Promise.all([
      supabase.from("accounts").select("*").eq("id", id).single(),
      supabase.from("daily_metrics").select("*").eq("account_id", id).order("date", { ascending: false }),
    ]).then(([accRes, metRes]) => {
      setAccount(accRes.data);
      setAllMetrics(metRes.data || []);
    });
  }, [id]);

  if (!account) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#737373]">{t("loading")}</div>
      </div>
    );
  }

  const latest = allMetrics[0] || null;
  const previous = allMetrics[1] || null;

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <button onClick={() => router.back()} className="text-[#737373] hover:text-white text-sm mb-6 inline-block">
        &larr; {t("back")}
      </button>

      {/* Account header */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">{account.username}</h1>
            <p className="text-[#737373] text-sm">{account.platform}</p>
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: account.status === "Active" ? "#22c55e18" : "#ef444418",
              color: account.status === "Active" ? "#22c55e" : "#ef4444",
              border: `1px solid ${account.status === "Active" ? "#22c55e33" : "#ef444433"}`,
            }}
          >
            {account.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label={t("angle")} value={`${account.angle} — ${ANGLE_NAMES[account.angle]}`} />
          <InfoRow label={t("device")} value={account.device} />
          <InfoRow label={t("email")} value={account.login_email} />
          <InfoRow label={t("loginMethod")} value={account.login_method} />
          <InfoRow label={t("app")} value={account.app} />
          <InfoRow label={t("notes")} value={account.notes} />
        </div>
      </div>

      {/* Prompt Generator */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#a3a3a3] uppercase tracking-wider">
            {t("promptGenerator")} — {t("angle")} {account.angle}
          </h2>
          <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer" className="text-xs text-[#22c55e] hover:underline">
            {t("openChatGPT")} &rarr;
          </a>
        </div>
        <PromptGenerator angle={account.angle} />
      </div>

      {/* Platform stats side by side */}
      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <PlatformCard
            name="TikTok"
            color="#ff0050"
            followers={latest.followers}
            following={latest.following}
            likes={latest.total_likes}
            posts={latest.posts}
            prevFollowers={previous?.followers ?? null}
            prevLikes={previous?.total_likes ?? null}
            prevPosts={previous?.posts ?? null}
          />
          <PlatformCard
            name="Lemon8"
            color="#ffe135"
            followers={latest.lm8_followers}
            following={latest.lm8_following}
            likes={latest.lm8_total_likes}
            posts={latest.lm8_posts}
            prevFollowers={previous?.lm8_followers ?? null}
            prevLikes={previous?.lm8_total_likes ?? null}
            prevPosts={previous?.lm8_posts ?? null}
          />
        </div>
      )}

      {/* Metrics history */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#a3a3a3] uppercase tracking-wider">
            {t("metricsHistory")}
          </h2>
          <p className="text-[10px] text-[#525252]">{t("autoUpdated")}</p>
        </div>

        {allMetrics.length === 0 ? (
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-6">
            <p className="text-[#525252] text-sm italic">{t("noMetricsRecorded")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricsChart
              title="TikTok"
              accentColor="#ff0050"
              metrics={allMetrics}
              lines={[
                { label: "Followers", color: "#ff0050", getValue: (m) => m.followers },
                { label: "Likes", color: "#ff6b9d", getValue: (m) => m.total_likes },
                { label: "Posts", color: "#ff9ec4", getValue: (m) => m.posts },
              ]}
            />
            <MetricsChart
              title="Lemon8"
              accentColor="#ffe135"
              metrics={allMetrics}
              lines={[
                { label: "Followers", color: "#ffe135", getValue: (m) => m.lm8_followers || 0 },
                { label: "Likes", color: "#ffd700", getValue: (m) => m.lm8_total_likes || 0 },
                { label: "Posts", color: "#ffb347", getValue: (m) => m.lm8_posts || 0 },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PlatformCard({
  name, color, followers, following, likes, posts,
  prevFollowers, prevLikes, prevPosts,
}: {
  name: string; color: string;
  followers: number; following: number; likes: number; posts: number;
  prevFollowers: number | null; prevLikes: number | null; prevPosts: number | null;
}) {
  const { t } = useLang();
  return (
    <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold" style={{ color }}>{name}</h3>
      </div>
      <div className="space-y-3">
        <StatRow label={t("followers")} value={followers} delta={formatDelta(followers, prevFollowers)} />
        <StatRow label={t("following")} value={following} delta="" />
        <StatRow label={t("likes")} value={likes} delta={formatDelta(likes, prevLikes)} />
        <StatRow label={t("posts")} value={posts} delta={formatDelta(posts, prevPosts)} />
      </div>
    </div>
  );
}

function StatRow({ label, value, delta }: { label: string; value: number; delta: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#525252] text-xs uppercase tracking-wider">{label}</span>
      <span className="text-white font-semibold">
        {formatNumber(value || 0)}
        {delta && (
          <span className={`ml-1 text-xs font-normal ${delta.startsWith("+") ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
            {delta}
          </span>
        )}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[#525252] text-xs uppercase tracking-wider">{label}</p>
      <p className="text-[#e5e5e5]">{value || "—"}</p>
    </div>
  );
}

function MetricsChart({
  title, accentColor, metrics, lines,
}: {
  title: string;
  accentColor: string;
  metrics: DailyMetric[];
  lines: { label: string; color: string; getValue: (m: DailyMetric) => number }[];
}) {
  const sorted = [...metrics].reverse();
  if (sorted.length === 0) return null;

  const W = 400;
  const H = 220;
  const PAD = { top: 16, right: 16, bottom: 28, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  let allVals: number[] = [];
  for (const line of lines) allVals = allVals.concat(sorted.map(line.getValue));
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  const xStep = sorted.length > 1 ? chartW / (sorted.length - 1) : 0;

  const getXY = (getValue: (m: DailyMetric) => number) =>
    sorted.map((m, i) => ({
      x: PAD.left + i * xStep,
      y: PAD.top + chartH - ((getValue(m) - minV) / range) * chartH,
    }));

  const toSmoothPath = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return "";
    if (points.length === 2) return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2.x},${p2.y}`;
    }
    return d;
  };

  const toAreaPath = (points: { x: number; y: number }[]) => {
    const line = toSmoothPath(points);
    if (!line) return "";
    const bottom = PAD.top + chartH;
    return `${line}L${points[points.length - 1].x},${bottom}L${points[0].x},${bottom}Z`;
  };

  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const v = maxV - (i / 3) * (maxV - minV);
    return { value: Math.round(v), y: PAD.top + (i / 3) * chartH };
  });

  const xLabels: { x: number; label: string }[] = [];
  if (sorted.length >= 1) xLabels.push({ x: PAD.left, label: sorted[0].date.slice(5) });
  if (sorted.length >= 3) {
    const mid = Math.floor(sorted.length / 2);
    xLabels.push({ x: PAD.left + mid * xStep, label: sorted[mid].date.slice(5) });
  }
  if (sorted.length >= 2) xLabels.push({ x: PAD.left + (sorted.length - 1) * xStep, label: sorted[sorted.length - 1].date.slice(5) });

  const latestValues = lines.map((l) => ({
    label: l.label,
    color: l.color,
    value: l.getValue(sorted[sorted.length - 1]),
  }));

  return (
    <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 overflow-hidden">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
        <span className="text-sm font-semibold" style={{ color: accentColor }}>{title}</span>
      </div>

      <div className="flex gap-4 mb-4">
        {latestValues.map((v) => (
          <div key={v.label}>
            <span className="text-[10px] text-[#525252] uppercase">{v.label}</span>
            <p className="text-white text-sm font-bold">{formatNumber(v.value)}</p>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {lines.map((l, idx) => (
            <linearGradient key={idx} id={`grad-${title}-${idx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={l.color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={l.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#1f1f1f" strokeWidth={0.5} strokeDasharray="4,4" />
            <text x={PAD.left - 8} y={t.y + 3} textAnchor="end" fill="#3a3a3a" fontSize={9} fontFamily="system-ui">{formatNumber(t.value)}</text>
          </g>
        ))}

        {lines.slice(0, 1).map((l, idx) => {
          const pts = getXY(l.getValue);
          return <path key={idx} d={toAreaPath(pts)} fill={`url(#grad-${title}-${idx})`} />;
        })}

        {lines.map((l, idx) => {
          const pts = getXY(l.getValue);
          return (
            <path
              key={idx}
              d={toSmoothPath(pts)}
              fill="none"
              stroke={l.color}
              strokeWidth={idx === 0 ? 2.5 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={idx === 0 ? 1 : 0.7}
            />
          );
        })}

        {lines.map((l, idx) => {
          const pts = getXY(l.getValue);
          const last = pts[pts.length - 1];
          return (
            <g key={idx}>
              <circle cx={last.x} cy={last.y} r={6} fill={l.color} opacity={0.15} />
              <circle cx={last.x} cy={last.y} r={3} fill={l.color} />
            </g>
          );
        })}

        {xLabels.map((xl, i) => (
          <text key={i} x={xl.x} y={H - 6} textAnchor="middle" fill="#3a3a3a" fontSize={9} fontFamily="system-ui">{xl.label}</text>
        ))}
      </svg>

      <div className="flex gap-4 mt-2">
        {lines.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-[10px] text-[#525252]">
            <span className="w-3 h-[2px] rounded-full inline-block" style={{ backgroundColor: l.color, opacity: l === lines[0] ? 1 : 0.7 }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
