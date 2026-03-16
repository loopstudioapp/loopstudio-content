export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function formatDelta(current: number, previous: number | null): string {
  if (previous === null) return "";
  const diff = current - previous;
  if (diff === 0) return "";
  return diff > 0 ? `+${formatNumber(diff)}` : formatNumber(diff);
}

export function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export const ANGLE_NAMES: Record<number, string> = {
  1: "Small Space Transform",
  2: "Home Remodel",
  3: "Angle 3",
};

export const ANGLE_COLORS: Record<number, string> = {
  1: "#22c55e",
  2: "#3b82f6",
  3: "#a855f7",
};
