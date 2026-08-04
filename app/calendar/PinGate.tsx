"use client";

import { useState } from "react";

const CODE = "7777";
export const PIN_COOKIE = "calendar_pin";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function hasPin(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${PIN_COOKIE}=1`));
}

/**
 * Four-digit gate on the calendar. The cookie lasts a year, so a browser only
 * ever asks once.
 *
 * This keeps the page from opening for anyone who wanders onto the URL. It is
 * not real security — the code ships in the client bundle, and the API routes
 * behind it are unauthenticated, same as the rest of this app.
 */
export default function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const focus = (index: number) => document.getElementById(`cal-pin-${index}`)?.focus();

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const digits = pin.padEnd(4, " ").split("");
    digits[index] = value || " ";
    const next = digits.join("").trimEnd();
    setPin(next);
    setError(false);

    if (value && index < 3) focus(index + 1);

    if (next.replace(/\s/g, "").length === 4) {
      if (next === CODE) {
        document.cookie = `${PIN_COOKIE}=1; path=/; max-age=${ONE_YEAR}`;
        onUnlock();
      } else {
        setError(true);
        setPin("");
        focus(0);
      }
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent) => {
    if (event.key === "Backspace" && !pin[index] && index > 0) focus(index - 1);
  };

  return (
    <div className="min-h-screen bg-[#161616] flex flex-col items-center justify-center px-6">
      <h1 className="text-xl font-bold text-white mb-1">Calendar</h1>
      <p className="text-xs text-[#8f8f8f] mb-8">Enter your 4-digit code</p>

      <div className="flex gap-3 mb-3">
        {[0, 1, 2, 3].map((index) => (
          <input
            key={index}
            id={`cal-pin-${index}`}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={pin[index]?.trim() || ""}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            autoFocus={index === 0}
            className="w-12 h-14 rounded-lg border-2 text-center text-xl font-bold bg-[#1f1f1f] text-white outline-none transition-colors"
            style={{ borderColor: error ? "#ef4444" : pin[index]?.trim() ? "#22c55e" : "#3a3a3a" }}
          />
        ))}
      </div>

      <p className="text-xs h-4" style={{ color: error ? "#ef4444" : "transparent" }}>
        Wrong code
      </p>
    </div>
  );
}
