import Link from "next/link";

type Category = "Real Estate" | "Business" | "Other";
type Status = "Income" | "Upcoming" | "Idle" | "Bad investment";

type Investment = {
  name: string;
  detail: string;
  category: Category;
  valueVnd: number;
  currentMonthlyVnd?: number;
  futureMonthlyVnd?: number;
  status: Status;
};

const USD_TO_VND = 26_275.7;

const investments: Investment[] = [
  {
    name: "Ocean Park London 2",
    detail: "Podium retail unit",
    category: "Real Estate",
    valueVnd: 14_500_000_000,
    futureMonthlyVnd: 70_000_000,
    status: "Upcoming",
  },
  {
    name: "Smart City S105",
    detail: "Podium retail unit",
    category: "Real Estate",
    valueVnd: 6_300_000_000,
    futureMonthlyVnd: 23_000_000,
    status: "Upcoming",
  },
  {
    name: "A La Carte Condotel",
    detail: "Da Nang condotel",
    category: "Real Estate",
    valueVnd: 5_000_000_000,
    currentMonthlyVnd: 20_000_000,
    status: "Income",
  },
  {
    name: "TPL",
    detail: "Game studio",
    category: "Business",
    valueVnd: 5_000_000_000,
    currentMonthlyVnd: 100_000_000,
    status: "Income",
  },
  {
    name: "Huynh Van Chinh Apartment",
    detail: "Residential apartment",
    category: "Real Estate",
    valueVnd: 2_100_000_000,
    status: "Idle",
  },
  {
    name: "Loop Studio",
    detail: "App studio",
    category: "Business",
    valueVnd: 1_500_000_000,
    currentMonthlyVnd: 2_000 * USD_TO_VND,
    status: "Income",
  },
  {
    name: "CMTech",
    detail: "Game studio",
    category: "Business",
    valueVnd: 1_200_000_000,
    status: "Idle",
  },
  {
    name: "Ket Coffee Shop",
    detail: "Coffee shop",
    category: "Business",
    valueVnd: 850_000_000,
    status: "Bad investment",
  },
  {
    name: "Watches",
    detail: "Collectibles",
    category: "Other",
    valueVnd: 600_000_000,
    status: "Idle",
  },
  {
    name: "Spartan Studio",
    detail: "Studio",
    category: "Business",
    valueVnd: 400_000_000,
    status: "Bad investment",
  },
];

const categoryMeta: Record<Category, { color: string }> = {
  "Real Estate": { color: "#22c55e" },
  Business: { color: "#a78bfa" },
  Other: { color: "#f59e0b" },
};

const totalValue = investments.reduce((sum, item) => sum + item.valueVnd, 0);
const currentMonthly = investments.reduce((sum, item) => sum + (item.currentMonthlyVnd || 0), 0);
const futureMonthly = investments.reduce((sum, item) => sum + (item.futureMonthlyVnd || 0), 0);
const projectedMonthly = currentMonthly + futureMonthly;
const realEstateValue = investments
  .filter((item) => item.category === "Real Estate")
  .reduce((sum, item) => sum + item.valueVnd, 0);
const badExposure = investments
  .filter((item) => item.status === "Bad investment")
  .reduce((sum, item) => sum + item.valueVnd, 0);

const categories = (["Real Estate", "Business", "Other"] as Category[]).map((name) => {
  const holdings = investments.filter((item) => item.category === name);
  return {
    name,
    holdings,
    value: holdings.reduce((sum, item) => sum + item.valueVnd, 0),
  };
});

function compactVnd(value: number, digits = 1) {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(digits).replace(/\.0$/, "")}B`;
  }
  return `${Math.round(value / 1_000_000)}M`;
}

function usd(valueVnd: number) {
  const value = valueVnd / USD_TO_VND;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function percentage(value: number, total = totalValue) {
  return `${((value / total) * 100).toFixed(1)}%`;
}

function annualYield(monthly: number) {
  return `${((monthly * 12 * 100) / totalValue).toFixed(1)}%`;
}

function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    Income: "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#4ade80]",
    Upcoming: "border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[#60a5fa]",
    Idle: "border-[#333] bg-[#1a1a1a] text-[#737373]",
    "Bad investment": "border-[#ef4444]/30 bg-[#ef4444]/10 text-[#f87171]",
  };

  return (
    <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-md border px-2 text-[10px] font-semibold uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}

function Metric({ label, value, secondary }: { label: string; value: string; secondary: string }) {
  return (
    <div className="border-l border-[#2a2a2a] pl-5 sm:pl-7">
      <p className="text-[10px] font-semibold uppercase text-[#666]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-[#666]">{secondary}</p>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5]">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pb-24 sm:pt-7">
        <header className="flex items-center justify-between border-b border-[#202020] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-xs font-black text-black">LS</div>
            <div>
              <p className="text-sm font-semibold text-white">Personal portfolio</p>
              <p className="text-[10px] text-[#5f5f5f]">10 holdings across 3 asset classes</p>
            </div>
          </div>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <Link href="/owner" className="rounded-md px-3 py-2 text-xs text-[#737373] transition-colors hover:bg-[#171717] hover:text-white">Owner</Link>
            <Link href="/" className="rounded-md px-3 py-2 text-xs text-[#737373] transition-colors hover:bg-[#171717] hover:text-white">Home</Link>
          </nav>
        </header>

        <section className="grid gap-10 border-b border-[#202020] py-12 lg:grid-cols-[1.35fr_1fr] lg:items-end lg:py-16">
          <div>
            <p className="mb-4 text-[10px] font-semibold uppercase text-[#737373]">Total portfolio value</p>
            <h1 className="text-[clamp(3.2rem,9vw,7rem)] font-semibold leading-[0.86] text-white">
              {compactVnd(totalValue, 2)}
              <span className="ml-2 text-[0.22em] font-medium text-[#737373]">VND</span>
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <p className="text-lg font-medium text-[#a3a3a3]">{usd(totalValue)} USD</p>
              <span className="hidden h-4 w-px bg-[#2a2a2a] sm:block" />
              <p className="text-xs text-[#525252]">1 USD = {USD_TO_VND.toLocaleString("en-US")} VND</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-7">
            <Metric label="Current income" value={`${compactVnd(currentMonthly)} VND`} secondary={`${usd(currentMonthly)} / month`} />
            <Metric label="Projected income" value={`${compactVnd(projectedMonthly)} VND`} secondary={`${usd(projectedMonthly)} / month`} />
          </div>
        </section>

        <section className="border-b border-[#202020] py-10 sm:py-12">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase text-[#666]">Allocation</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Where the money sits</h2>
            </div>
            <p className="text-right text-xs text-[#525252]">Real estate remains the dominant position</p>
          </div>

          <div className="flex h-3 w-full overflow-hidden rounded-sm bg-[#171717]" aria-label="Portfolio allocation">
            {categories.map((category) => (
              <div
                key={category.name}
                style={{ width: percentage(category.value), backgroundColor: categoryMeta[category.name].color }}
                title={`${category.name}: ${percentage(category.value)}`}
              />
            ))}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-3 sm:gap-8">
            {categories.map((category) => (
              <div key={category.name} className="flex items-start justify-between border-t border-[#242424] pt-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: categoryMeta[category.name].color }} />
                    <p className="text-sm font-medium text-white">{category.name}</p>
                  </div>
                  <p className="mt-2 text-xs text-[#5f5f5f]">{category.holdings.length} {category.holdings.length === 1 ? "holding" : "holdings"}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-white">{percentage(category.value)}</p>
                  <p className="mt-1 text-xs text-[#5f5f5f]">{compactVnd(category.value, 2)} VND</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-10 border-b border-[#202020] py-10 sm:py-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <p className="text-[10px] font-semibold uppercase text-[#666]">Income outlook</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Cashflow grows 54%</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[#737373]">
              The two retail units add 93M VND per month when they begin producing income, taking annual portfolio yield from {annualYield(currentMonthly)} to {annualYield(projectedMonthly)}.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] uppercase text-[#5f5f5f]">Now</p>
                <p className="mt-2 text-xl font-semibold text-white">{compactVnd(currentMonthly)}</p>
              </div>
              <div className="border-l border-[#2a2a2a] pl-4">
                <p className="text-[10px] uppercase text-[#5f5f5f]">Incoming</p>
                <p className="mt-2 text-xl font-semibold text-[#60a5fa]">+{compactVnd(futureMonthly)}</p>
              </div>
              <div className="border-l border-[#2a2a2a] pl-4">
                <p className="text-[10px] uppercase text-[#5f5f5f]">Projected</p>
                <p className="mt-2 text-xl font-semibold text-[#4ade80]">{compactVnd(projectedMonthly)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-[#a3a3a3]">Current monthly cashflow</span>
                <span className="font-semibold text-white">{compactVnd(currentMonthly)} VND</span>
              </div>
              <div className="flex h-9 overflow-hidden rounded-md bg-[#171717]">
                <div className="flex items-center justify-center bg-[#176534] text-[10px] font-semibold text-white" style={{ width: `${(100_000_000 / currentMonthly) * 100}%` }}>TPL</div>
                <div className="flex items-center justify-center bg-[#16626b] text-[10px] font-semibold text-white" style={{ width: `${((2_000 * USD_TO_VND) / currentMonthly) * 100}%` }}>Loop</div>
                <div className="flex items-center justify-center bg-[#77520c] text-[10px] font-semibold text-white" style={{ width: `${(20_000_000 / currentMonthly) * 100}%` }}>A La Carte</div>
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[#525252]">
                <span>TPL 100M</span><span>Loop $2,000</span><span>A La Carte 20M</span>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-[#a3a3a3]">Future monthly cashflow</span>
                <span className="font-semibold text-[#60a5fa]">+{compactVnd(futureMonthly)} VND</span>
              </div>
              <div className="flex h-9 overflow-hidden rounded-md bg-[#171717]">
                <div className="flex items-center justify-center bg-[#1d4ed8] text-[10px] font-semibold text-white" style={{ width: `${(70_000_000 / futureMonthly) * 100}%` }}>Ocean Park</div>
                <div className="flex items-center justify-center bg-[#2563eb] text-[10px] font-semibold text-white" style={{ width: `${(23_000_000 / futureMonthly) * 100}%` }}>S105</div>
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[#525252]">
                <span>Ocean Park 70M</span><span>Smart City S105 23M</span>
              </div>
            </div>
          </div>
        </section>

        <section className="py-10 sm:py-12">
          <div className="overflow-hidden rounded-lg border border-[#292929] bg-[#141414]">
            <div className="flex flex-wrap items-end justify-between gap-5 border-b border-[#2a2a2a] px-5 py-6 sm:px-7">
              <div>
                <p className="text-[10px] font-semibold uppercase text-[#666]">Holdings</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Portfolio, ranked by value</h2>
              </div>
              <div className="flex gap-7">
                <div>
                  <p className="text-[10px] uppercase text-[#666]">Real estate exposure</p>
                  <p className="mt-1.5 text-sm font-semibold text-[#d4d4d4]">{compactVnd(realEstateValue, 2)} VND</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-[#ef4444]">Bad exposure</p>
                  <p className="mt-1.5 text-sm font-semibold text-[#f87171]">{compactVnd(badExposure, 2)} VND</p>
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[31%]" />
                  <col className="w-[11%]" />
                  <col className="w-[16%]" />
                  <col className="w-[17%]" />
                  <col className="w-[10%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="bg-[#111]">
                  <tr className="border-b border-[#292929] text-[10px] font-semibold uppercase text-[#5f5f5f]">
                    <th className="px-7 py-3 text-left">Holding</th>
                    <th className="px-4 py-3 text-right">Allocation</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">Cashflow</th>
                    <th className="px-4 py-3 text-right">%</th>
                    <th className="px-7 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {investments.map((item) => {
                    const cashflow = item.currentMonthlyVnd || item.futureMonthlyVnd || 0;
                    const cashflowLabel = item.currentMonthlyVnd ? "per month" : item.futureMonthlyVnd ? "future / month" : "no cashflow";
                    const holdingYield = cashflow ? (cashflow * 12 * 100) / item.valueVnd : 0;
                    return (
                      <tr key={item.name} className="border-b border-[#292929] last:border-b-0">
                        <td className="px-7 py-5 align-middle">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: categoryMeta[item.category].color }} />
                            <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                          </div>
                          <p className="ml-4 mt-1 truncate text-xs text-[#737373]">{item.detail} / {item.category}</p>
                        </td>
                        <td className="px-4 py-5 text-right align-middle">
                          <p className="text-sm font-semibold tabular-nums text-[#d4d4d4]">{percentage(item.valueVnd)}</p>
                        </td>
                        <td className="px-4 py-5 text-right align-middle">
                          <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-white">{compactVnd(item.valueVnd, 2)} VND</p>
                          <p className="mt-1 text-[10px] tabular-nums text-[#666]">{usd(item.valueVnd)}</p>
                        </td>
                        <td className="px-4 py-5 text-right align-middle">
                          <p className={`whitespace-nowrap text-sm font-semibold tabular-nums ${item.futureMonthlyVnd ? "text-[#60a5fa]" : cashflow ? "text-[#4ade80]" : "text-[#525252]"}`}>
                            {cashflow ? `${item.futureMonthlyVnd ? "+" : ""}${compactVnd(cashflow)} VND` : "-"}
                          </p>
                          <p className="mt-1 text-[10px] text-[#666]">{cashflowLabel}</p>
                        </td>
                        <td className="px-4 py-5 text-right align-middle">
                          <p className={`text-sm font-semibold tabular-nums ${holdingYield ? "text-[#d4d4d4]" : "text-[#525252]"}`}>
                            {holdingYield ? `${holdingYield.toFixed(1)}%` : "-"}
                          </p>
                          <p className="mt-1 text-[10px] text-[#666]">{item.futureMonthlyVnd ? "projected" : "annual"}</p>
                        </td>
                        <td className="px-7 py-5 text-left align-middle">
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden">
              {investments.map((item) => {
                const cashflow = item.currentMonthlyVnd || item.futureMonthlyVnd || 0;
                const holdingYield = cashflow ? (cashflow * 12 * 100) / item.valueVnd : 0;
                return (
                  <article key={item.name} className="border-b border-[#292929] px-5 py-5 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: categoryMeta[item.category].color }} />
                          <h3 className="truncate text-sm font-semibold text-white">{item.name}</h3>
                        </div>
                        <p className="ml-4 mt-1 text-xs text-[#737373]">{item.detail} / {item.category}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[#292929] pt-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-[#5f5f5f]">Value</p>
                        <p className="mt-1.5 text-sm font-semibold tabular-nums text-white">{compactVnd(item.valueVnd, 2)} VND</p>
                        <p className="mt-1 text-[10px] text-[#666]">{usd(item.valueVnd)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-[#5f5f5f]">Allocation</p>
                        <p className="mt-1.5 text-sm font-semibold tabular-nums text-[#d4d4d4]">{percentage(item.valueVnd)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-[#5f5f5f]">Cashflow</p>
                        <p className={`mt-1.5 text-sm font-semibold tabular-nums ${item.futureMonthlyVnd ? "text-[#60a5fa]" : cashflow ? "text-[#4ade80]" : "text-[#525252]"}`}>
                          {cashflow ? `${item.futureMonthlyVnd ? "+" : ""}${compactVnd(cashflow)} VND` : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-[#5f5f5f]">%</p>
                        <p className={`mt-1.5 text-sm font-semibold tabular-nums ${holdingYield ? "text-[#d4d4d4]" : "text-[#525252]"}`}>
                          {holdingYield ? `${holdingYield.toFixed(1)}%` : "-"}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#202020] pt-5 text-[10px] text-[#4f4f4f]">
          <p>Values are manually tracked estimates.</p>
          <p>Current yield {annualYield(currentMonthly)} / Projected yield {annualYield(projectedMonthly)}</p>
        </footer>
      </div>
    </main>
  );
}
