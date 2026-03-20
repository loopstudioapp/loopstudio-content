"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

export default function PinterestAccountsPage() {
  const [accounts, setAccounts] = useState<PAccount[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<{ id: string; name: string }[]>([]);
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) { router.push("/"); return; }
  }, [router]);

  const load = async () => {
    const res = await fetch("/api/pinterest/accounts");
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
  };

  useEffect(() => { load(); }, []);

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

  const save = async () => {
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
    load();
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
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("Delete this Pinterest account?")) return;
    await fetch(`/api/pinterest/accounts?id=${id}`, { method: "DELETE" });
    load();
  };

  const CONTENT_TYPE_LABELS: Record<string, string> = {
    before_after: "Before / After",
    listicle: "Listicle / Tips",
    visual_guide: "Visual Guide",
  };

  const inputCls = "w-full bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-2 text-sm text-white placeholder-[#525252] focus:border-[#e60023] focus:outline-none";
  const labelCls = "block text-xs text-[#737373] mb-1";

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Pinterest Accounts</h1>
          <p className="text-sm text-[#525252]">Manage Pinterest accounts & Postiz connections</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "vi" : "en")}
            className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors"
          >
            {lang === "en" ? "VN" : "EN"}
          </button>
          <Link href="/owner/pinterest" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            Dashboard
          </Link>
          <Link href="/owner" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            {t("home")}
          </Link>
        </div>
      </div>

      {/* Add button */}
      <button
        onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); setIntegrations([]); setTestResult(null); }}
        className="mb-6 px-4 py-2 bg-[#e60023] text-white text-sm font-medium rounded-lg hover:bg-[#cc001f] transition-colors"
      >
        + Add Account
      </button>

      {/* Form */}
      {showForm && (
        <div className="mb-8 bg-[#141414] border border-[#262626] rounded-xl p-5">
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
                  className="px-3 py-2 text-xs bg-[#262626] text-white rounded-lg hover:bg-[#333] disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  {testing ? "Testing..." : "Test"}
                </button>
              </div>
              {testResult && (
                <p className={`text-xs mt-1 ${testResult.startsWith("Error") ? "text-[#ef4444]" : "text-[#22c55e]"}`}>{testResult}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Postiz Integration ID *</label>
              {integrations.length > 0 ? (
                <select className={inputCls} value={form.postiz_integration_id} onChange={(e) => setForm({ ...form, postiz_integration_id: e.target.value })}>
                  <option value="">Select integration...</option>
                  {integrations.map((i) => (
                    <option key={i.id} value={i.id}>{i.name || i.id}</option>
                  ))}
                </select>
              ) : (
                <input className={inputCls} value={form.postiz_integration_id} onChange={(e) => setForm({ ...form, postiz_integration_id: e.target.value })} placeholder="Click Test to load" />
              )}
            </div>
            <div>
              <label className={labelCls}>Board ID *</label>
              <input className={inputCls} value={form.board_id} onChange={(e) => setForm({ ...form, board_id: e.target.value })} placeholder="Pinterest board ID from Postiz" />
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
            <button onClick={save} className="px-4 py-2 bg-[#e60023] text-white text-sm font-medium rounded-lg hover:bg-[#cc001f] transition-colors">
              {editingId ? "Update" : "Create"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 bg-[#262626] text-white text-sm rounded-lg hover:bg-[#333] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Account List */}
      <div className="space-y-3">
        {accounts.map((acc) => (
          <div key={acc.id} className="bg-[#141414] border border-[#262626] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-white font-semibold">{acc.name}</h3>
              <div className="flex gap-3 mt-1">
                {acc.pinterest_username && <span className="text-[#525252] text-xs">@{acc.pinterest_username}</span>}
                <span className="text-xs" style={{ color: acc.content_type === "before_after" ? "#e60023" : acc.content_type === "listicle" ? "#22c55e" : "#3b82f6" }}>
                  {CONTENT_TYPE_LABELS[acc.content_type]}
                </span>
                <span className="text-[#525252] text-xs">{acc.pins_per_day} pins/day</span>
                <span className={`text-xs ${acc.status === "active" ? "text-[#22c55e]" : "text-[#f59e0b]"}`}>
                  {acc.status}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(acc)} className="px-3 py-1 text-xs bg-[#262626] text-white rounded-lg hover:bg-[#333] transition-colors">
                Edit
              </button>
              <button onClick={() => deleteAccount(acc.id)} className="px-3 py-1 text-xs bg-[#262626] text-[#ef4444] rounded-lg hover:bg-[#333] transition-colors">
                Delete
              </button>
            </div>
          </div>
        ))}
        {accounts.length === 0 && !showForm && (
          <p className="text-center text-[#525252] py-8">No Pinterest accounts yet. Click &quot;Add Account&quot; to get started.</p>
        )}
      </div>
    </div>
  );
}
