"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, Account, DailyMetric } from "@/lib/supabase";
import { ANGLE_NAMES, ANGLE_COLORS, formatNumber, formatDelta } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import Link from "next/link";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

type MetricPair = { latest: DailyMetric | null; previous: DailyMetric | null };

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricPair>>({});
  const [employeeName, setEmployeeName] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    const eid = getCookie("employee_id");
    const ename = getCookie("employee_name");
    if (!eid) { router.push("/"); return; }
    setEmployeeName(ename || "");

    supabase
      .from("accounts")
      .select("*")
      .eq("employee_id", eid)
      .order("angle")
      .order("username")
      .then(async ({ data: accs }) => {
        setAccounts(accs || []);
        const metricsMap: Record<string, MetricPair> = {};
        if (accs) {
          await Promise.all(
            accs.map(async (acc) => {
              const { data: m } = await supabase
                .from("daily_metrics")
                .select("*")
                .eq("account_id", acc.id)
                .order("date", { ascending: false })
                .limit(2);
              metricsMap[acc.id] = {
                latest: m?.[0] || null,
                previous: m?.[1] || null,
              };
            })
          );
        }
        setMetrics(metricsMap);
        setLoading(false);
      });
  }, [router]);

  const grouped = accounts.reduce<Record<number, Account[]>>((acc, a) => {
    (acc[a.angle] = acc[a.angle] || []).push(a);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#737373]">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">{t("hey")} {employeeName}</h1>
          <p className="text-sm text-[#737373]">{accounts.length} {t("accounts")}</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/tutorial"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-[#1a1a1a] text-[#737373] text-sm font-semibold rounded-lg border border-[#333] hover:text-white transition-colors"
          >
            {t("tutorial")}
          </a>
          <button
            onClick={() => setLang(lang === "en" ? "vi" : "en")}
            className="px-3 py-2 bg-[#1a1a1a] text-[#737373] text-sm font-semibold rounded-lg border border-[#333] hover:text-white transition-colors"
          >
            {lang === "en" ? "VN" : "EN"}
          </button>
          <button
            onClick={() => {
              document.cookie = "employee_id=; path=/; max-age=0";
              document.cookie = "employee_name=; path=/; max-age=0";
              router.push("/");
            }}
            className="px-3 py-2 bg-[#1a1a1a] text-[#737373] text-sm font-semibold rounded-lg border border-[#333] hover:text-white transition-colors"
          >
            {t("logout")}
          </button>
        </div>
      </div>

      {/* Account groups by angle */}
      {Object.entries(grouped).map(([angle, accs]) => (
        <div key={angle} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: ANGLE_COLORS[Number(angle)] }}
            />
            <h2 className="text-sm font-semibold text-[#a3a3a3] uppercase tracking-wider">
              {t("angle")} {angle} — {ANGLE_NAMES[Number(angle)]}
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accs.map((acc) => {
              const m = metrics[acc.id];
              const lat = m?.latest;
              const prev = m?.previous;

              return (
                <Link
                  key={acc.id}
                  href={`/dashboard/account/${acc.id}`}
                  className="block bg-[#141414] border border-[#262626] rounded-xl p-5 hover:border-[#404040] transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white font-semibold text-sm">{acc.username}</p>
                      <p className="text-[#737373] text-xs">{acc.platform}</p>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: acc.status === "Active" ? "#22c55e18" : "#ef444418",
                        color: acc.status === "Active" ? "#22c55e" : "#ef4444",
                        border: `1px solid ${acc.status === "Active" ? "#22c55e33" : "#ef444433"}`,
                      }}
                    >
                      {acc.status}
                    </span>
                  </div>

                  <p className="text-[#525252] text-xs mb-3">{acc.device}</p>

                  {lat ? (
                    <div className="grid grid-cols-2 gap-2">
                      <MetricBox label={t("followers")} value={lat.followers} delta={formatDelta(lat.followers, prev?.followers ?? null)} />
                      <MetricBox label={t("likes")} value={lat.total_likes} delta={formatDelta(lat.total_likes, prev?.total_likes ?? null)} />
                      <MetricBox label={t("posts")} value={lat.posts} delta={formatDelta(lat.posts, prev?.posts ?? null)} />
                      <MetricBox label={t("following")} value={lat.following} delta={formatDelta(lat.following, prev?.following ?? null)} />
                    </div>
                  ) : (
                    <p className="text-[#525252] text-xs italic">{t("noMetrics")}</p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {accounts.length === 0 && (
        <div className="text-center py-20 text-[#737373]">
          {t("noAccounts")}
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, delta }: { label: string; value: number; delta: string }) {
  return (
    <div className="bg-[#0a0a0a] rounded-lg p-2">
      <p className="text-[#525252] text-[10px] uppercase tracking-wider">{label}</p>
      <p className="text-white text-sm font-semibold">
        {formatNumber(value)}
        {delta && (
          <span className={`ml-1 text-xs font-normal ${delta.startsWith("+") ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
            ({delta})
          </span>
        )}
      </p>
    </div>
  );
}
