"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── Types ── */
type PAccount = {
  id: string;
  name: string;
  pinterest_username: string | null;
  postiz_api_key: string;
  postiz_integration_id: string;
  board_id: string;
  content_type: string;
  status: string;
  pins_per_day: number;
  telegram_chat_id: string | null;
  app_store_url: string;
  created_at: string;
};

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

type PTopic = {
  id: string;
  category: string;
  title_template: string;
  description_template: string;
  times_used: number;
  last_used_at: string | null;
};

type Tab = "dashboard" | "accounts" | "pins" | "topics";

/* ── Constants ── */
const CONTENT_TYPE_LABELS: Record<string, string> = {
  before_after: "Before / After",
  listicle: "Listicle / Tips",
  visual_guide: "Visual Guide",
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  before_after: "#e60023",
  listicle: "#22c55e",
  visual_guide: "#3b82f6",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  generating: "#3b82f6",
  uploading: "#8b5cf6",
  scheduled: "#22c55e",
  posted: "#22c55e",
  failed: "#ef4444",
};

const emptyForm = {
  name: "",
  pinterest_username: "",
  postiz_api_key: "",
  postiz_integration_id: "",
  board_id: "",
  content_type: "before_after",
  status: "active",
  pins_per_day: "10",
  telegram_chat_id: "",
  app_store_url: "https://apps.apple.com/app/roomy-ai",
};

/* ── Page ── */
export default function PinterestPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [accounts, setAccounts] = useState<PAccount[]>([]);
  const [pins, setPins] = useState<PPin[]>([]);
  const [topics, setTopics] = useState<PTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  // Account form
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<{ id: string; name: string }[]>([]);

  // Pins filters
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Topics filter
  const [filterCat, setFilterCat] = useState("all");

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) {
      router.push("/");
      return;
    }
  }, [router]);

  const loadAll = async () => {
    const [accRes, pinRes, topicRes] = await Promise.all([
      fetch("/api/pinterest/accounts"),
      fetch("/api/pinterest/pins"),
      fetch("/api/pinterest/topics"),
    ]);
    const accs = await accRes.json();
    const pinData = await pinRes.json();
    const topicData = await topicRes.json();
    setAccounts(Array.isArray(accs) ? accs : []);
    setPins(Array.isArray(pinData) ? pinData : []);
    setTopics(Array.isArray(topicData) ? topicData : []);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  /* ── Pipeline Actions ── */
  const triggerPipeline = async (accountId?: string) => {
    setRunning(accountId || "all");
    setRunResult(null);
    try {
      const res = await fetch("/api/pinterest/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountId ? { account_id: accountId } : {}),
      });
      const data = await res.json();
      setRunResult(data.summary || `Scheduled: ${data.scheduled}, Failed: ${data.failed}`);
      loadAll();
    } catch {
      setRunResult("Pipeline failed");
    }
    setRunning(null);
  };

  /* ── Account CRUD ── */
  const testConnection = async () => {
    if (!form.postiz_api_key) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/pinterest/test-postiz?api_key=${encodeURIComponent(form.postiz_api_key)}`);
      const data = await res.json();
      if (data.ok) {
        setTestResult("Connected!");
        setIntegrations(data.integrations || []);
      } else {
        setTestResult(`Error: ${data.error}`);
      }
    } catch {
      setTestResult("Connection failed");
    }
    setTesting(false);
  };

  const saveAccount = async () => {
    if (!form.name || !form.postiz_api_key || !form.postiz_integration_id || !form.board_id) return;
    const body = {
      ...form,
      pins_per_day: parseInt(form.pins_per_day) || 10,
      pinterest_username: form.pinterest_username || null,
      telegram_chat_id: form.telegram_chat_id || null,
    };
    if (editingId) {
      await fetch("/api/pinterest/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...body }),
      });
    } else {
      await fetch("/api/pinterest/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setIntegrations([]);
    setTestResult(null);
    loadAll();
  };

  const openEdit = (acc: PAccount) => {
    setEditingId(acc.id);
    setForm({
      name: acc.name,
      pinterest_username: acc.pinterest_username || "",
      postiz_api_key: acc.postiz_api_key,
      postiz_integration_id: acc.postiz_integration_id,
      board_id: acc.board_id,
      content_type: acc.content_type,
      status: acc.status,
      pins_per_day: String(acc.pins_per_day),
      telegram_chat_id: acc.telegram_chat_id || "",
      app_store_url: acc.app_store_url || "https://apps.apple.com/app/roomy-ai",
    });
    setShowForm(true);
    setTab("accounts");
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("Delete this Pinterest account?")) return;
    await fetch(`/api/pinterest/accounts?id=${id}`, { method: "DELETE" });
    loadAll();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-[#737373]">{t("loading")}</div>
      </div>
    );
  }

  /* ── Computed Data ── */
  const today = new Date().toISOString().split("T")[0];
  const todayPins = pins.filter((p) => p.created_at.startsWith(today));
  const scheduled = todayPins.filter((p) => p.status === "scheduled").length;
  const failed = todayPins.filter((p) => p.status === "failed").length;
  const posted = todayPins.filter((p) => p.status === "posted").length;
  const generating = todayPins.filter((p) => ["pending", "generating", "uploading"].includes(p.status)).length;

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  const filteredPins = pins.filter((p) => {
    if (filterAccount !== "all" && p.account_id !== filterAccount) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  const filteredTopics = filterCat === "all" ? topics : topics.filter((t) => t.category === filterCat);
  const topicsByCat = {
    before_after: topics.filter((t) => t.category === "before_after").length,
    listicle: topics.filter((t) => t.category === "listicle").length,
    visual_guide: topics.filter((t) => t.category === "visual_guide").length,
  };

  const inputCls = "w-full bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white placeholder-[#525252] focus:border-[#e60023] focus:outline-none";
  const labelCls = "block text-xs text-[#737373] mb-1";
  const tabCls = (t: Tab) =>
    `px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
      tab === t ? "bg-[#e60023] text-white" : "text-[#737373] hover:text-white hover:bg-[#1a1a1a]"
    }`;

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">📌 Pinterest Automation</h1>
          <p className="text-sm text-[#525252]">Automated pin generation & scheduling</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "vi" : "en")}
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
          >
            {lang === "en" ? "VN" : "EN"}
          </button>
          <Link
            href="/owner"
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
          >
            ← {t("home")}
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button className={tabCls("dashboard")} onClick={() => setTab("dashboard")}>
          Dashboard
        </button>
        <button className={tabCls("accounts")} onClick={() => setTab("accounts")}>
          Accounts ({accounts.length})
        </button>
        <button className={tabCls("pins")} onClick={() => setTab("pins")}>
          Pins ({pins.length})
        </button>
        <button className={tabCls("topics")} onClick={() => setTab("topics")}>
          Topics ({topics.length})
        </button>
      </div>

      {/* Result Banner */}
      {runResult && (
        <div className="mb-6 p-3 bg-[#141414] border border-[#262626] rounded-xl flex items-center justify-between">
          <pre className="text-sm text-[#a3a3a3] whitespace-pre-wrap">{runResult}</pre>
          <button onClick={() => setRunResult(null)} className="text-[#525252] hover:text-white text-xs ml-3">
            ✕
          </button>
        </div>
      )}

      {/* ═══════════════ DASHBOARD TAB ═══════════════ */}
      {tab === "dashboard" && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
              <p className="text-[#e60023] text-[10px] uppercase tracking-wider">Accounts</p>
              <p className="text-white text-2xl font-bold mt-1">{accounts.filter((a) => a.status === "active").length}</p>
              <p className="text-[#525252] text-[10px]">{t("active")}</p>
            </div>
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
              <p className="text-[#22c55e] text-[10px] uppercase tracking-wider">Scheduled</p>
              <p className="text-white text-2xl font-bold mt-1">{scheduled}</p>
              <p className="text-[#525252] text-[10px]">today</p>
            </div>
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
              <p className="text-[#3b82f6] text-[10px] uppercase tracking-wider">Posted</p>
              <p className="text-white text-2xl font-bold mt-1">{posted}</p>
              <p className="text-[#525252] text-[10px]">today</p>
            </div>
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
              <p className="text-[#f59e0b] text-[10px] uppercase tracking-wider">In Progress</p>
              <p className="text-white text-2xl font-bold mt-1">{generating}</p>
            </div>
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
              <p className="text-[#ef4444] text-[10px] uppercase tracking-wider">Failed</p>
              <p className="text-white text-2xl font-bold mt-1">{failed}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={() => triggerPipeline()}
              disabled={running !== null}
              className="px-4 py-2 bg-[#e60023] text-white text-sm font-medium rounded-lg hover:bg-[#cc001f] disabled:opacity-50 transition-colors"
            >
              {running === "all" ? "Running Pipeline..." : "▶ Run Pipeline Now"}
            </button>
          </div>

          {/* Account Cards */}
          <h2 className="text-sm font-semibold text-[#737373] uppercase tracking-wider mb-4">Accounts</h2>
          {accounts.length === 0 ? (
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-8 text-center">
              <p className="text-[#525252] mb-4">No Pinterest accounts yet</p>
              <button
                onClick={() => setTab("accounts")}
                className="px-4 py-2 bg-[#e60023] text-white text-sm rounded-lg hover:bg-[#cc001f] transition-colors"
              >
                + Add Account
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => {
                const accPins = todayPins.filter((p) => p.account_id === acc.id);
                const accScheduled = accPins.filter((p) => p.status === "scheduled").length;
                const accFailed = accPins.filter((p) => p.status === "failed").length;
                const accPosted = accPins.filter((p) => p.status === "posted").length;

                return (
                  <div key={acc.id} className="bg-[#141414] border border-[#262626] rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-white font-semibold">{acc.name}</h3>
                        {acc.pinterest_username && <p className="text-[#525252] text-xs">@{acc.pinterest_username}</p>}
                      </div>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full border"
                        style={{
                          color: CONTENT_TYPE_COLORS[acc.content_type],
                          borderColor: CONTENT_TYPE_COLORS[acc.content_type] + "40",
                        }}
                      >
                        {CONTENT_TYPE_LABELS[acc.content_type]}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="text-center">
                        <p className="text-white text-lg font-bold">{accScheduled}</p>
                        <p className="text-[#525252] text-[10px]">Scheduled</p>
                      </div>
                      <div className="text-center">
                        <p className="text-white text-lg font-bold">{accPosted}</p>
                        <p className="text-[#525252] text-[10px]">Posted</p>
                      </div>
                      <div className="text-center">
                        <p className={`text-lg font-bold ${accFailed > 0 ? "text-[#ef4444]" : "text-white"}`}>{accFailed}</p>
                        <p className="text-[#525252] text-[10px]">Failed</p>
                      </div>
                    </div>

                    <div className="h-1.5 bg-[#262626] rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full bg-[#22c55e] rounded-full transition-all"
                        style={{ width: `${Math.min(100, ((accScheduled + accPosted) / acc.pins_per_day) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[#525252] text-[10px] mb-3">
                      {accScheduled + accPosted}/{acc.pins_per_day} pins today
                    </p>

                    <button
                      onClick={() => triggerPipeline(acc.id)}
                      disabled={running !== null}
                      className="w-full px-3 py-1.5 text-xs bg-[#262626] text-white rounded-lg hover:bg-[#333] disabled:opacity-50 transition-colors"
                    >
                      {running === acc.id ? "Running..." : "▶ Run"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════════ ACCOUNTS TAB ═══════════════ */}
      {tab === "accounts" && (
        <>
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setShowForm(true);
                setIntegrations([]);
                setTestResult(null);
              }}
              className="px-4 py-2 bg-[#e60023] text-white text-sm font-medium rounded-lg hover:bg-[#cc001f] transition-colors"
            >
              + Add Account
            </button>
          </div>

          {/* Form */}
          {showForm && (
            <div className="mb-6 bg-[#141414] border border-[#262626] rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">{editingId ? "Edit Account" : "New Account"}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Name *</label>
                  <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Roomy Transforms" />
                </div>
                <div>
                  <label className={labelCls}>Pinterest Username</label>
                  <input className={inputCls} value={form.pinterest_username} onChange={(e) => setForm({ ...form, pinterest_username: e.target.value })} placeholder="e.g. roomyai" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Postiz API Key *</label>
                  <div className="flex gap-2">
                    <input className={inputCls} value={form.postiz_api_key} onChange={(e) => setForm({ ...form, postiz_api_key: e.target.value })} placeholder="Your Postiz API key" />
                    <button
                      onClick={testConnection}
                      disabled={testing || !form.postiz_api_key}
                      className="px-4 py-2 text-xs bg-[#262626] text-white rounded-lg hover:bg-[#333] disabled:opacity-50 whitespace-nowrap transition-colors"
                    >
                      {testing ? "Testing..." : "Test Connection"}
                    </button>
                  </div>
                  {testResult && (
                    <p className={`text-xs mt-1 ${testResult.startsWith("Error") || testResult.startsWith("Connection") ? "text-[#ef4444]" : "text-[#22c55e]"}`}>
                      {testResult}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Postiz Integration ID *</label>
                  {integrations.length > 0 ? (
                    <select className={inputCls} value={form.postiz_integration_id} onChange={(e) => setForm({ ...form, postiz_integration_id: e.target.value })}>
                      <option value="">Select integration...</option>
                      {integrations.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name || i.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className={inputCls} value={form.postiz_integration_id} onChange={(e) => setForm({ ...form, postiz_integration_id: e.target.value })} placeholder="Click Test to auto-load" />
                  )}
                </div>
                <div>
                  <label className={labelCls}>Board ID *</label>
                  <input className={inputCls} value={form.board_id} onChange={(e) => setForm({ ...form, board_id: e.target.value })} placeholder="Pinterest board ID" />
                </div>
                <div>
                  <label className={labelCls}>Content Type *</label>
                  <select className={inputCls} value={form.content_type} onChange={(e) => setForm({ ...form, content_type: e.target.value })}>
                    <option value="before_after">Before / After</option>
                    <option value="listicle">Listicle / Tips</option>
                    <option value="visual_guide">Visual Guide</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Pins per Day</label>
                  <input className={inputCls} type="number" value={form.pins_per_day} onChange={(e) => setForm({ ...form, pins_per_day: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Telegram Chat ID</label>
                  <input className={inputCls} value={form.telegram_chat_id} onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })} placeholder="For notifications" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>App Store URL</label>
                  <input className={inputCls} value={form.app_store_url} onChange={(e) => setForm({ ...form, app_store_url: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveAccount} className="px-4 py-2 bg-[#e60023] text-white text-sm font-medium rounded-lg hover:bg-[#cc001f] transition-colors">
                  {editingId ? "Update" : "Create"}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="px-4 py-2 bg-[#262626] text-white text-sm rounded-lg hover:bg-[#333] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Account List */}
          <div className="space-y-3">
            {accounts.map((acc) => (
              <div key={acc.id} className="bg-[#141414] border border-[#262626] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-white font-semibold">{acc.name}</h3>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {acc.pinterest_username && <span className="text-[#525252] text-xs">@{acc.pinterest_username}</span>}
                    <span
                      className="text-xs"
                      style={{ color: CONTENT_TYPE_COLORS[acc.content_type] }}
                    >
                      {CONTENT_TYPE_LABELS[acc.content_type]}
                    </span>
                    <span className="text-[#525252] text-xs">{acc.pins_per_day} pins/day</span>
                    <span className={`text-xs ${acc.status === "active" ? "text-[#22c55e]" : "text-[#f59e0b]"}`}>{acc.status}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(acc)} className="px-3 py-1.5 text-xs bg-[#262626] text-white rounded-lg hover:bg-[#333] transition-colors">
                    Edit
                  </button>
                  <button onClick={() => deleteAccount(acc.id)} className="px-3 py-1.5 text-xs bg-[#262626] text-[#ef4444] rounded-lg hover:bg-[#333] transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {accounts.length === 0 && !showForm && (
              <p className="text-center text-[#525252] py-8">No Pinterest accounts yet. Click &quot;+ Add Account&quot; to get started.</p>
            )}
          </div>
        </>
      )}

      {/* ═══════════════ PINS TAB ═══════════════ */}
      {tab === "pins" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            <select
              className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none"
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
            >
              <option value="all">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="generating">Generating</option>
              <option value="uploading">Uploading</option>
              <option value="scheduled">Scheduled</option>
              <option value="posted">Posted</option>
              <option value="failed">Failed</option>
            </select>
            <span className="text-xs text-[#525252] self-center">{filteredPins.length} pins</span>
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
                {filteredPins.slice(0, 100).map((pin) => (
                  <tr key={pin.id} className="border-b border-[#262626]/50 hover:bg-[#141414]">
                    <td className="py-2 px-3 text-xs text-[#a3a3a3]">{accountMap[pin.account_id] || "—"}</td>
                    <td className="py-2 px-3">
                      <p className="text-xs text-white truncate max-w-[250px]">{pin.title}</p>
                      {pin.error_message && <p className="text-[10px] text-[#ef4444] truncate max-w-[250px]">{pin.error_message}</p>}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          color: STATUS_COLORS[pin.status],
                          backgroundColor: (STATUS_COLORS[pin.status] || "#525252") + "15",
                        }}
                      >
                        {pin.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-[#525252]">{pin.scheduled_at ? new Date(pin.scheduled_at).toLocaleString() : "—"}</td>
                    <td className="py-2 px-3 text-xs text-[#525252]">{new Date(pin.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredPins.length === 0 && <p className="text-center text-[#525252] py-8">No pins found</p>}
          {filteredPins.length > 100 && (
            <p className="text-center text-[#525252] text-xs py-4">Showing first 100 of {filteredPins.length} pins</p>
          )}
        </>
      )}

      {/* ═══════════════ TOPICS TAB ═══════════════ */}
      {tab === "topics" && (
        <>
          {/* Topic Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {Object.entries(topicsByCat).map(([cat, count]) => (
              <div key={cat} className="bg-[#141414] border border-[#262626] rounded-xl p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: CONTENT_TYPE_COLORS[cat] }}>
                  {CONTENT_TYPE_LABELS[cat]}
                </p>
                <p className="text-white text-2xl font-bold mt-1">{count}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mb-6">
            <select
              className="bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="before_after">Before / After</option>
              <option value="listicle">Listicle / Tips</option>
              <option value="visual_guide">Visual Guide</option>
            </select>
            <span className="text-xs text-[#525252] self-center">{filteredTopics.length} topics</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-[#262626]">
                  <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Category</th>
                  <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Title</th>
                  <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Used</th>
                  <th className="text-left text-[10px] text-[#525252] uppercase py-2 px-3">Last Used</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map((topic) => (
                  <tr key={topic.id} className="border-b border-[#262626]/50 hover:bg-[#141414]">
                    <td className="py-2 px-3">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          color: CONTENT_TYPE_COLORS[topic.category],
                          backgroundColor: CONTENT_TYPE_COLORS[topic.category] + "15",
                        }}
                      >
                        {CONTENT_TYPE_LABELS[topic.category]}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-white">{topic.title_template}</td>
                    <td className="py-2 px-3 text-xs text-[#525252]">{topic.times_used}</td>
                    <td className="py-2 px-3 text-xs text-[#525252]">{topic.last_used_at ? new Date(topic.last_used_at).toLocaleDateString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {topics.length === 0 && <p className="text-center text-[#525252] py-8">No topics found.</p>}
        </>
      )}
    </div>
  );
}
