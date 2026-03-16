"use client";

import { useState, useEffect } from "react";
import { supabase, Employee, Account } from "@/lib/supabase";
import { ANGLE_NAMES } from "@/lib/utils";
import Link from "next/link";

const AVATAR_COLORS = [
  "#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444",
  "#ec4899", "#22d3ee", "#f97316", "#14b8a6",
];

const emptyAccForm = {
  employee_id: "", angle: "1", platform: "TikTok / Lemon8", username: "",
  login_email: "", login_method: "Email", app: "Roomy AI", device: "", status: "Active", notes: "",
};

export default function AccountsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [empForm, setEmpForm] = useState({ name: "", pin: "" });
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [accForm, setAccForm] = useState(emptyAccForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAccForm, setShowAccForm] = useState(false);

  const load = () => {
    supabase.from("employees").select("*").order("name").then(({ data }) => setEmployees(data || []));
    supabase.from("accounts").select("*").order("angle").order("username").then(({ data }) => setAccounts(data || []));
  };

  useEffect(load, []);

  const getNextColor = () => {
    const used = employees.map((e) => e.avatar_color);
    const available = AVATAR_COLORS.filter((c) => !used.includes(c));
    const pool = available.length > 0 ? available : AVATAR_COLORS;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const saveEmployee = async () => {
    if (!empForm.name || !empForm.pin || empForm.pin.length !== 4) return;
    if (editingEmpId) {
      await supabase.from("employees").update({ name: empForm.name, pin: empForm.pin }).eq("id", editingEmpId);
    } else {
      await supabase.from("employees").insert({ ...empForm, avatar_color: getNextColor() });
    }
    setEmpForm({ name: "", pin: "" });
    setEditingEmpId(null);
    setShowEmpForm(false);
    load();
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmpId(emp.id);
    setEmpForm({ name: emp.name, pin: emp.pin });
    setShowEmpForm(true);
  };

  const deleteEmployee = async (id: string) => {
    if (!confirm("Delete this employee and all their accounts?")) return;
    await supabase.from("employees").delete().eq("id", id);
    load();
  };

  const openAdd = () => {
    setEditingId(null);
    setAccForm(emptyAccForm);
    setShowAccForm(true);
  };

  const openEdit = (acc: Account) => {
    setEditingId(acc.id);
    setAccForm({
      employee_id: acc.employee_id,
      angle: String(acc.angle),
      platform: acc.platform,
      username: acc.username,
      login_email: acc.login_email,
      login_method: acc.login_method,
      app: acc.app,
      device: acc.device,
      status: acc.status,
      notes: acc.notes,
    });
    setShowAccForm(true);
  };

  const saveAccount = async () => {
    if (!accForm.employee_id || !accForm.username) return;
    const payload = { ...accForm, angle: parseInt(accForm.angle) };

    if (editingId) {
      await supabase.from("accounts").update(payload).eq("id", editingId);
    } else {
      await supabase.from("accounts").insert(payload);
    }

    setAccForm(emptyAccForm);
    setEditingId(null);
    setShowAccForm(false);
    load();
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("Delete this account and all its metrics?")) return;
    await supabase.from("daily_metrics").delete().eq("account_id", id);
    await supabase.from("accounts").delete().eq("id", id);
    load();
  };

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Accounts</h1>
          <p className="text-sm text-[#525252]">Manage employees & accounts</p>
        </div>
        <div className="flex gap-2">
          <Link href="/owner" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            Overview
          </Link>
          <Link href="/" className="px-3 py-1.5 text-xs text-[#737373] border border-[#262626] rounded-lg hover:text-white transition-colors">
            Home
          </Link>
        </div>
      </div>

      {/* Employees */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#a3a3a3] uppercase tracking-wider">
            Employees ({employees.length})
          </h2>
          <button
            onClick={() => { setEditingEmpId(null); setEmpForm({ name: "", pin: "" }); setShowEmpForm(!showEmpForm); }}
            className="px-3 py-1.5 bg-[#22c55e] text-black text-xs font-semibold rounded-lg"
          >
            + Add
          </button>
        </div>

        {showEmpForm && (
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 mb-4">
            <p className="text-xs text-[#a3a3a3] font-semibold uppercase tracking-wider mb-4">
              {editingEmpId ? "Edit Employee" : "New Employee"}
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input label="Name" value={empForm.name} onChange={(v) => setEmpForm({ ...empForm, name: v })} />
              <Input label="4-digit PIN" value={empForm.pin} onChange={(v) => setEmpForm({ ...empForm, pin: v.slice(0, 4) })} />
            </div>
            <div className="flex gap-2">
              <button onClick={saveEmployee} className="px-4 py-2 bg-[#22c55e] text-black text-sm font-semibold rounded-lg">
                {editingEmpId ? "Update" : "Save"}
              </button>
              <button onClick={() => { setShowEmpForm(false); setEditingEmpId(null); }} className="px-4 py-2 bg-[#1a1a1a] text-[#737373] text-sm rounded-lg border border-[#333]">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((emp) => {
            const empAccounts = accounts.filter((a) => a.employee_id === emp.id);
            return (
              <div key={emp.id} className="bg-[#141414] border border-[#262626] rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold text-black"
                    style={{ backgroundColor: emp.avatar_color }}
                  >
                    {emp.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">{emp.name}</p>
                    <p className="text-[#525252] text-xs">PIN: {emp.pin} &middot; {empAccounts.length} accounts</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => openEditEmployee(emp)}
                      className="text-[#3b82f6] text-xs hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteEmployee(emp.id)}
                      className="text-[#ef4444] text-xs hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Accounts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#a3a3a3] uppercase tracking-wider">
            Accounts ({accounts.length})
          </h2>
          <button
            onClick={openAdd}
            className="px-3 py-1.5 bg-[#3b82f6] text-white text-xs font-semibold rounded-lg"
          >
            + Add
          </button>
        </div>

        {showAccForm && (
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 mb-4">
            <p className="text-xs text-[#a3a3a3] font-semibold uppercase tracking-wider mb-4">
              {editingId ? "Edit Account" : "New Account"}
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-[#525252] uppercase tracking-wider mb-1">Employee</p>
                <select
                  value={accForm.employee_id}
                  onChange={(e) => setAccForm({ ...accForm, employee_id: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="">Select...</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs text-[#525252] uppercase tracking-wider mb-1">Angle</p>
                <select
                  value={accForm.angle}
                  onChange={(e) => setAccForm({ ...accForm, angle: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm"
                >
                  {[1, 2, 3].map((n) => <option key={n} value={n}>Angle {n} — {ANGLE_NAMES[n]}</option>)}
                </select>
              </div>
              <Input label="Username" value={accForm.username} onChange={(v) => setAccForm({ ...accForm, username: v })} placeholder="@handle" />
              <Input label="Login Email" value={accForm.login_email} onChange={(v) => setAccForm({ ...accForm, login_email: v })} />
              <Input label="Login Method" value={accForm.login_method} onChange={(v) => setAccForm({ ...accForm, login_method: v })} />
              <Input label="Device" value={accForm.device} onChange={(v) => setAccForm({ ...accForm, device: v })} />
              <Input label="App" value={accForm.app} onChange={(v) => setAccForm({ ...accForm, app: v })} />
              <div>
                <p className="text-xs text-[#525252] uppercase tracking-wider mb-1">Status</p>
                <select
                  value={accForm.status}
                  onChange={(e) => setAccForm({ ...accForm, status: e.target.value })}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                  <option value="Banned">Banned</option>
                </select>
              </div>
              <div className="col-span-2">
                <Input label="Notes" value={accForm.notes} onChange={(v) => setAccForm({ ...accForm, notes: v })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveAccount} className="px-4 py-2 bg-[#3b82f6] text-white text-sm font-semibold rounded-lg">
                {editingId ? "Update" : "Save"}
              </button>
              <button
                onClick={() => { setShowAccForm(false); setEditingId(null); }}
                className="px-4 py-2 bg-[#1a1a1a] text-[#737373] text-sm rounded-lg border border-[#333]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {accounts.map((acc) => {
            const emp = employees.find((e) => e.id === acc.employee_id);
            return (
              <div key={acc.id} className="bg-[#141414] border border-[#262626] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-semibold">{acc.username}</p>
                  <p className="text-[#525252] text-xs">
                    {emp?.name || "Unassigned"} &middot; Angle {acc.angle} &middot; {acc.device || "No device"} &middot; {acc.status}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => openEdit(acc)}
                    className="text-[#3b82f6] text-xs hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteAccount(acc.id)}
                    className="text-[#ef4444] text-xs hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <p className="text-xs text-[#525252] uppercase tracking-wider mb-1">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6]"
      />
    </div>
  );
}
