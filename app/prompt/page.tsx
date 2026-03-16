"use client";

import { useState } from "react";
import PromptGenerator from "@/components/PromptGenerator";
import Link from "next/link";

export default function PromptPage() {
  const [tab, setTab] = useState(1);

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Prompt Generator</h1>
          <p className="text-sm text-[#737373]">Generate &rarr; paste into ChatGPT</p>
        </div>
        <Link
          href="/dashboard"
          className="px-4 py-2 bg-[#1a1a1a] text-[#737373] text-sm font-semibold rounded-lg border border-[#333] hover:text-white transition-colors"
        >
          Dashboard
        </Link>
      </div>

      <div className="flex mb-7 bg-[#141414] rounded-lg overflow-hidden border border-[#262626]">
        {[1, 2].map((n) => (
          <button
            key={n}
            onClick={() => setTab(n)}
            className="flex-1 py-3 text-sm font-semibold transition-colors"
            style={{
              background: tab === n ? "#22c55e" : "transparent",
              color: tab === n ? "#000" : "#525252",
            }}
          >
            Angle {n} — {n === 1 ? "Small Space" : "Home Remodel"}
          </button>
        ))}
      </div>

      <PromptGenerator angle={tab} />
    </div>
  );
}
