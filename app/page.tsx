"use client";

import { useState, useEffect } from "react";
import { supabase, Employee } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n";

const AVATAR_COLORS = [
  "#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444",
  "#ec4899", "#22d3ee", "#f97316", "#14b8a6",
];

export default function ProfilePicker() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { t } = useLang();

  useEffect(() => {
    supabase
      .from("employees")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setEmployees(data || []);
        setLoading(false);
      });
  }, []);

  const handlePinSubmit = () => {
    if (!selected) return;
    if (pin === selected.pin) {
      document.cookie = `employee_id=${selected.id}; path=/; max-age=86400`;
      document.cookie = `employee_name=${selected.name}; path=/; max-age=86400`;
      router.push("/dashboard");
    } else {
      setError(t("wrongPin"));
      setPin("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#737373]">{t("loading")}</div>
      </div>
    );
  }

  // PIN entry screen
  if (selected) {
    const handlePinChange = (index: number, value: string) => {
      if (!/^\d?$/.test(value)) return;
      const digits = pin.split("");
      digits[index] = value;
      const next = digits.join("").slice(0, 4);
      setPin(next);
      setError("");

      if (value && index < 3) {
        const nextInput = document.getElementById(`pin-${index + 1}`);
        nextInput?.focus();
      }

      if (next.length === 4) {
        setTimeout(() => {
          if (isAdmin) {
            if (next === "8888") {
              router.push("/owner");
            } else {
              setError(t("wrongPin"));
              setPin("");
              document.getElementById("pin-0")?.focus();
            }
          } else if (next === selected.pin) {
            document.cookie = `employee_id=${selected.id}; path=/; max-age=86400`;
            document.cookie = `employee_name=${selected.name}; path=/; max-age=86400`;
            router.push("/dashboard");
          } else {
            setError(t("wrongPin"));
            setPin("");
            document.getElementById("pin-0")?.focus();
          }
        }, 100);
      }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !pin[index] && index > 0) {
        const prev = document.getElementById(`pin-${index - 1}`);
        prev?.focus();
      }
    };

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <button
          onClick={() => { setSelected(null); setIsAdmin(false); setPin(""); setError(""); }}
          className="absolute top-6 left-6 text-[#737373] hover:text-white text-sm"
        >
          &larr; {t("back")}
        </button>

        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold mb-3"
          style={{
            backgroundColor: isAdmin ? "#a855f7" : selected.avatar_color,
            color: "black",
          }}
        >
          {isAdmin ? "\u2605" : selected.name[0].toUpperCase()}
        </div>
        <h2 className="text-lg font-semibold text-white mb-6">{isAdmin ? "Admin" : selected.name}</h2>

        <div className="flex gap-3 mb-3">
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              id={`pin-${i}`}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={pin[i] || ""}
              onChange={(e) => handlePinChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              autoFocus={i === 0}
              className="w-12 h-14 rounded-lg border-2 text-center text-xl font-bold bg-[#141414] text-white outline-none transition-colors"
              style={{ borderColor: pin[i] ? "#22c55e" : "#333" }}
            />
          ))}
        </div>

        {error && <p className="text-[#ef4444] text-sm">{error}</p>}
        {!error && <p className="text-[#333] text-xs">{t("enterPin")}</p>}
      </div>
    );
  }

  // Profile grid
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <h1 className="text-2xl font-bold text-white mb-2">Loop Studio</h1>
      <p className="text-[#737373] text-sm mb-10">{t("whoWorking")}</p>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-6 max-w-lg">
        {/* Admin tile */}
        <button
          onClick={() => { setIsAdmin(true); setSelected({ id: "", name: "Admin", pin: "8888", avatar_color: "#a855f7", created_at: "" }); }}
          className="flex flex-col items-center gap-2 group"
        >
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-black transition-transform group-hover:scale-105 ring-2 ring-[#a855f7] ring-offset-2 ring-offset-[#0a0a0a]" style={{ backgroundColor: "#a855f7" }}>
            &#9733;
          </div>
          <span className="text-sm text-[#a855f7] group-hover:text-white transition-colors font-semibold">
            Admin
          </span>
        </button>

        {employees.map((emp, i) => (
          <button
            key={emp.id}
            onClick={() => { setIsAdmin(false); setSelected(emp); }}
            className="flex flex-col items-center gap-2 group"
          >
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-black transition-transform group-hover:scale-105"
              style={{ backgroundColor: emp.avatar_color || AVATAR_COLORS[i % AVATAR_COLORS.length] }}
            >
              {emp.name[0].toUpperCase()}
            </div>
            <span className="text-sm text-[#a3a3a3] group-hover:text-white transition-colors">
              {emp.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
