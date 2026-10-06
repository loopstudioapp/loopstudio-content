// Single source of truth for the personal portfolio. Rendered by
// app/portfolio/page.tsx and served as JSON by app/api/portfolio/route.ts,
// which the iOS app fetches. Keep the payload field names stable.

export type PortfolioCategory = "Real Estate" | "Business" | "Other";
export type PortfolioStatus = "Income" | "Upcoming" | "Idle" | "Bad investment";

export type PortfolioHolding = {
  name: string;
  detail: string;
  category: PortfolioCategory;
  valueVnd: number;
  currentMonthlyVnd: number | null;
  futureMonthlyVnd: number | null;
  status: PortfolioStatus;
};

export type PortfolioDebt = {
  name: string;
  detail: string;
  /** Positive amount owed. */
  valueVnd: number;
};

export type PortfolioPayload = {
  usdToVnd: number;
  updatedAt: string;
  holdings: PortfolioHolding[];
  debts: PortfolioDebt[];
};

export const USD_TO_VND = 26_275.7;
export const PORTFOLIO_UPDATED_AT = "2026-10-06";

export const holdings: PortfolioHolding[] = [
  {
    name: "Ocean Park London 2",
    detail: "Podium retail unit",
    category: "Real Estate",
    valueVnd: 14_500_000_000,
    currentMonthlyVnd: 0,
    futureMonthlyVnd: null,
    status: "Idle",
  },
  {
    name: "A La Carte Condotel",
    detail: "Da Nang condotel · rooms 507 & 710",
    category: "Real Estate",
    valueVnd: 17_000_000_000,
    currentMonthlyVnd: 36_000_000,
    futureMonthlyVnd: null,
    status: "Income",
  },
  {
    name: "Smart City S105",
    detail: "Podium retail unit",
    category: "Real Estate",
    valueVnd: 5_600_000_000,
    currentMonthlyVnd: 0,
    futureMonthlyVnd: null,
    status: "Idle",
  },
  {
    name: "TPL",
    detail: "Game studio",
    category: "Business",
    valueVnd: 5_000_000_000,
    currentMonthlyVnd: 100_000_000,
    futureMonthlyVnd: null,
    status: "Income",
  },
  {
    name: "Loop Studio",
    detail: "App studio",
    category: "Business",
    valueVnd: 24 * 200_000_000,
    currentMonthlyVnd: 200_000_000,
    futureMonthlyVnd: null,
    status: "Income",
  },
  {
    name: "CMTech",
    detail: "Game studio",
    category: "Business",
    valueVnd: 24 * 100_000_000,
    currentMonthlyVnd: 100_000_000,
    futureMonthlyVnd: null,
    status: "Income",
  },
  {
    name: "Huynh Van Chinh Apartment",
    detail: "Residential apartment",
    category: "Real Estate",
    valueVnd: 2_100_000_000,
    currentMonthlyVnd: null,
    futureMonthlyVnd: null,
    status: "Idle",
  },
  {
    name: "Ket Coffee Shop",
    detail: "Coffee shop",
    category: "Business",
    valueVnd: 850_000_000,
    currentMonthlyVnd: null,
    futureMonthlyVnd: null,
    status: "Bad investment",
  },
  {
    name: "Watches",
    detail: "Collectibles",
    category: "Other",
    valueVnd: 600_000_000,
    currentMonthlyVnd: null,
    futureMonthlyVnd: null,
    status: "Idle",
  },
  {
    name: "Spartan Studio",
    detail: "Studio",
    category: "Business",
    valueVnd: 400_000_000,
    currentMonthlyVnd: null,
    futureMonthlyVnd: null,
    status: "Bad investment",
  },
];

export const debts: PortfolioDebt[] = [
  {
    name: "Debt — real estate and bank",
    detail: "Real estate loans and bank debt",
    valueVnd: 9_000_000_000,
  },
];

export function portfolioPayload(): PortfolioPayload {
  return {
    usdToVnd: USD_TO_VND,
    updatedAt: PORTFOLIO_UPDATED_AT,
    holdings: holdings.map((item) => ({ ...item })),
    debts: debts.map((item) => ({ ...item })),
  };
}
