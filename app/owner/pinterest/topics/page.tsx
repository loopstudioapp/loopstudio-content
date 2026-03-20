"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

type PTopic = {
  id: string;
  category: string;
  title_template: string;
  description_template: string;
  times_used: number;
  last_used_at: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  before_after: "Before / After",
  listicle: "Listicle / Tips",
  visual_guide: "Visual Guide",
};

const CATEGORY_COLORS: Record<string, string> = {
  before_after: "#e60023",
  listicle: "#22c55e",
  visual_guide: "#3b82f6",
};

export default function TopicsPage() {
  const [topics, setTopics] = useState<PTopic[]>([]);
  const [filterCat, setFilterCat] = useState("all");
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const { lang, setLang, t } = useLang();
  const router = useRouter();

  useEffect(() => {
    const hasAdmin = document.cookie.match(/(^| )admin=([^;]+)/);
    const hasEmployee = document.cookie.match(/(^| )employee_id=([^;]+)/);
    if (!hasAdmin && !hasEmployee) { router.push("/"); return; }
  }, [router]);

  const load = async () => {
    const res = await fetch(`/api/pinterest/topics${filterCat !== "all" ? `?category=${filterCat}` : ""}`);
    const data = await res.json();
    setTopics(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterCat]);

  const seedTopics = async () => {
    setSeeding(true);
    const res = await fetch("/api/pinterest/topics", { method: "POST" });
    const data = await res.json();
    alert(`Seeded ${data.seeded} topics`);
    setSeeding(false);
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#737373]">{t("loading")}</div>
      </div>
    );
  }

  const inputCls = "bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-1.5 text-xs text-white focus:border-[#e60023] focus:outline-none";

  const byCat = {
    before_after: topics.filter((t) => t.category === "before_after").length,
    listicle: topics.filter((t) => t.category === "listicle").length,
    visual_guide: topics.filter((t) => t.category === "visual_guide").length,
  };

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white">Topic Pool</h1>
          <p className="text-sm text-[#525252]">{topics.length} topics</p>
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Object.entries(byCat).map(([cat, count]) => (
          <div key={cat} className="bg-[#141414] border border-[#262626] rounded-xl p-4 text-center">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: CATEGORY_COLORS[cat] }}>{CATEGORY_LABELS[cat]}</p>
            <p className="text-white text-2xl font-bold mt-1">{count}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select className={inputCls} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="all">All Categories</option>
          <option value="before_after">Before / After</option>
          <option value="listicle">Listicle / Tips</option>
          <option value="visual_guide">Visual Guide</option>
        </select>
        <button
          onClick={seedTopics}
          disabled={seeding}
          className="px-4 py-1.5 bg-[#e60023] text-white text-xs font-medium rounded-lg hover:bg-[#cc001f] disabled:opacity-50 transition-colors"
        >
          {seeding ? "Seeding..." : "Seed Topics from Code"}
        </button>
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
            {topics.map((topic) => (
              <tr key={topic.id} className="border-b border-[#262626]/50 hover:bg-[#141414]">
                <td className="py-2 px-3">
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: CATEGORY_COLORS[topic.category], backgroundColor: (CATEGORY_COLORS[topic.category]) + "15" }}>
                    {CATEGORY_LABELS[topic.category]}
                  </span>
                </td>
                <td className="py-2 px-3 text-xs text-white">{topic.title_template}</td>
                <td className="py-2 px-3 text-xs text-[#525252]">{topic.times_used}</td>
                <td className="py-2 px-3 text-xs text-[#525252]">
                  {topic.last_used_at ? new Date(topic.last_used_at).toLocaleDateString() : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {topics.length === 0 && (
        <p className="text-center text-[#525252] py-8">No topics seeded yet. Click &quot;Seed Topics from Code&quot; to populate.</p>
      )}
    </div>
  );
}
