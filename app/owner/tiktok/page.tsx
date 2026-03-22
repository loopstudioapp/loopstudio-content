"use client";

import { useState, useEffect } from "react";
import { supabase, Employee, Account, DailyMetric } from "@/lib/supabase";
import { ANGLE_NAMES, ANGLE_COLORS, formatNumber, formatDelta } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

type MetricPair = { latest: DailyMetric | null; previous: DailyMetric | null };

export default function OwnerTikTokDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricPair>>({});
  const [loading, setLoading] = useState(true);
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterAngle, setFilterAngle] = useState("all");
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) { router.push("/"); return; }
  }, [router]);

  const load = async () => {
    const [{ data: emps }, { data: accs }] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("accounts").select("*").order("angle").order("username"),
    ]);
    setEmployees(emps || []);
    setAccounts(accs || []);

    const metricsMap: Record<string, MetricPair> = {};
    if (accs) {
      await Promise.all(
        accs.map(async (acc: Account) => {
          const { data: m } = await supabase
            .from("daily_metrics")
            .select("*")
            .eq("account_id", acc.id)
            .order("date", { ascending: false })
            .limit(2);
          metricsMap[acc.id] = { latest: m?.[0] || null, previous: m?.[1] || null };
        })
      );
    }
    setMetrics(metricsMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reassign = async (accountId: string, newEmployeeId: string) => {
    await supabase.from("accounts").update({ employee_id: newEmployeeId }).eq("id", accountId);
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, employee_id: newEmployeeId } : a))
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#737373]">{t("loading")}</div>
      </div>
    );
  }

  const filtered = accounts.filter((a) => {
    if (filterEmployee !== "all" && a.employee_id !== filterEmployee) return false;
    if (filterAngle !== "all" && a.angle !== Number(filterAngle)) return false;
    return true;
  });

  const tkLikes = filtered.reduce((s, a) => s + (metrics[a.id]?.latest?.total_likes || 0), 0);
  const tkPosts = filtered.reduce((s, a) => s + (metrics[a.id]?.latest?.posts || 0), 0);
  const lmLikes = filtered.reduce((s, a) => s + (metrics[a.id]?.latest?.lm8_total_likes || 0), 0);
  const lmPosts = filtered.reduce((s, a) => s + (metrics[a.id]?.latest?.lm8_posts || 0), 0);
  const activeCount = filtered.filter((a) => a.status === "Active").length;

  const angles = [...new Set(accounts.map((a) => a.angle))].sort();

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Loop Studio</h1>
          <p className="text-sm text-[#525252]">{t("ownerOverview")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "vi" : "en")}
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
          >
            {lang === "en" ? "VN" : "EN"}
          </button>
          <Link href="/owner/tiktok/accounts" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            {t("accountsLink")}
          </Link>
          <Link href="/owner" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            {t("home")}
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#525252] text-[10px] uppercase tracking-wider">{t("accountsLink")}</p>
          <p className="text-white text-2xl font-bold mt-1">{activeCount}<span className="text-[#525252] text-sm font-normal">/{filtered.length}</span></p>
          <p className="text-[#525252] text-[10px]">{t("active")}</p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#ff0050] text-[10px] uppercase tracking-wider">{t("tikTokLikes")}</p>
          <p className="text-white text-2xl font-bold mt-1">{formatNumber(tkLikes)}</p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#ff0050] text-[10px] uppercase tracking-wider">{t("tikTokPosts")}</p>
          <p className="text-white text-2xl font-bold mt-1">{formatNumber(tkPosts)}</p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#ffe135] text-[10px] uppercase tracking-wider">{t("lemon8Likes")}</p>
          <p className="text-white text-2xl font-bold mt-1">{formatNumber(lmLikes)}</p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
          <p className="text-[#ffe135] text-[10px] uppercase tracking-wider">{t("lemon8Posts")}</p>
          <p className="text-white text-2xl font-bold mt-1">{formatNumber(lmPosts)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          className="bg-[#141414] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">{t("allEmployees")}</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select
          value={filterAngle}
          onChange={(e) => setFilterAngle(e.target.value)}
          className="bg-[#141414] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">{t("allAngles")}</option>
          {angles.map((n) => <option key={n} value={n}>{t("angle")} {n} — {ANGLE_NAMES[n]}</option>)}
        </select>
        <p className="self-center text-xs text-[#525252]">{filtered.length} {t("accounts")}</p>
      </div>

      {/* Table */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-[#262626]">
              <th className="text-left px-4 py-3 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">{t("account")}</th>
              <th className="text-left px-4 py-3 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">{t("assignedTo")}</th>
              <th className="text-center px-4 py-3 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">{t("angle")}</th>
              <th className="text-center px-4 py-3 text-[10px] text-[#525252] uppercase tracking-wider font-semibold">{t("status")}</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#ff0050" }}>TK {t("likes")}</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#ff0050" }}>TK {t("posts")}</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#ffe135" }}>LM {t("likes")}</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#ffe135" }}>LM {t("posts")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((acc) => {
              const m = metrics[acc.id];
              const lat = m?.latest;
              const prev = m?.previous;
              return (
                <tr key={acc.id} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/account/${acc.id}`} className="text-white font-medium hover:underline">
                      {acc.username}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={acc.employee_id}
                      onChange={(e) => reassign(acc.id, e.target.value)}
                      className="bg-transparent border border-[#262626] rounded px-2 py-1 text-xs text-[#a3a3a3] hover:border-[#404040] cursor-pointer"
                    >
                      <option value="">—</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#a3a3a3]">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: ANGLE_COLORS[acc.angle] }} />
                      {acc.angle}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: acc.status === "Active" ? "#22c55e18" : "#ef444418",
                        color: acc.status === "Active" ? "#22c55e" : "#ef4444",
                        border: `1px solid ${acc.status === "Active" ? "#22c55e33" : "#ef444433"}`,
                      }}
                    >
                      {acc.status}
                    </span>
                  </td>
                  <MetricCell value={lat?.total_likes} prev={prev?.total_likes} />
                  <MetricCell value={lat?.posts} prev={prev?.posts} />
                  <MetricCell value={lat?.lm8_total_likes} prev={prev?.lm8_total_likes} />
                  <MetricCell value={lat?.lm8_posts} prev={prev?.lm8_posts} />
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#262626]">
              <td className="px-4 py-3 text-[#525252] text-xs font-semibold" colSpan={4}>{t("total")}</td>
              <td className="px-4 py-3 text-right text-white font-semibold">{formatNumber(tkLikes)}</td>
              <td className="px-4 py-3 text-right text-white font-semibold">{formatNumber(tkPosts)}</td>
              <td className="px-4 py-3 text-right text-white font-semibold">{formatNumber(lmLikes)}</td>
              <td className="px-4 py-3 text-right text-white font-semibold">{formatNumber(lmPosts)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function MetricCell({ value, prev }: { value?: number; prev?: number }) {
  const v = value || 0;
  const p = prev ?? null;
  const delta = formatDelta(v, p);
  return (
    <td className="px-4 py-3 text-right text-white">
      {formatNumber(v)}
      {delta && (
        <span className={`ml-1 text-[10px] ${delta.startsWith("+") ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
          {delta}
        </span>
      )}
    </td>
  );
}
