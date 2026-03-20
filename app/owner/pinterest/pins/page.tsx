"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

type PPin = {
  id: string;
  account_id: string;
  topic_id: string;
  title: string;
  description: string;
  image_url: string | null;
  postiz_post_id: string | null;
  scheduled_at: string | null;
  status: string;
  error_message: string | null;
  retry_count: number;
  created_at: string;
};

type PAccount = { id: string; name: string };

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  generating: "#3b82f6",
  uploading: "#8b5cf6",
  scheduled: "#22c55e",
  posted: "#22c55e",
  failed: "#ef4444",
};

export default function PinHistoryPage() {
  const [pins, setPins] = useState<PPin[]>([]);
  const [accounts, setAccounts] = useState<PAccount[]>([]);
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) { router.push("/"); return; }
  }, [router]);

  const load = async () => {
    const [pinRes, accRes] = await Promise.all([
      fetch("/api/pinterest/pins"),
      fetch("/api/pinterest/accounts"),
    ]);
    const pinData = await pinRes.json();
    const accData = await accRes.json();
    setPins(Array.isArray(pinData) ? pinData : []);
    setAccounts(Array.isArray(accData) ? accData : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#737373]">{t("loading")}</div>
      </div>
    );
  }

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  const filtered = pins.filter((p) => {
    if (filterAccount !== "all" && p.account_id !== filterAccount) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  const inputCls = "bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none";

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Pin History</h1>
          <p className="text-sm text-[#525252]">{filtered.length} pins</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLang(lang === "en" ? "vi" : "en")} className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            {lang === "en" ? "VN" : "EN"}
          </button>
          <Link href="/owner/pinterest" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            Dashboard
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select className={inputCls} value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
          <option value="all">All Accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={inputCls} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="generating">Generating</option>
          <option value="uploading">Uploading</option>
          <option value="scheduled">Scheduled</option>
          <option value="posted">Posted</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-[#262626]">
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Account</th>
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Title</th>
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Status</th>
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Scheduled</th>
              <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((pin) => (
              <tr key={pin.id} className="border-b border-[#262626]/50 hover:bg-[#141414]">
                <td className="py-2 px-3 text-xs text-[#a3a3a3]">{accountMap[pin.account_id] || "—"}</td>
                <td className="py-2 px-3">
                  <p className="text-xs text-white truncate max-w-[250px]">{pin.title}</p>
                  {pin.error_message && (
                    <p className="text-[10px] text-[#ef4444] truncate max-w-[250px]">{pin.error_message}</p>
                  )}
                </td>
                <td className="py-2 px-3">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ color: STATUS_COLORS[pin.status], backgroundColor: (STATUS_COLORS[pin.status] || "#525252") + "15" }}
                  >
                    {pin.status}
                  </span>
                </td>
                <td className="py-2 px-3 text-xs text-[#525252]">
                  {pin.scheduled_at ? new Date(pin.scheduled_at).toLocaleString() : "—"}
                </td>
                <td className="py-2 px-3 text-xs text-[#525252]">
                  {new Date(pin.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-[#525252] py-8">No pins found</p>
      )}
    </div>
  );
}
