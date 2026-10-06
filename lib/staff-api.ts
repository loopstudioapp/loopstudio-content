// Browser-side calls for staff/accounts pages. All database access goes through
// session-checked API routes (service role on the server); the browser never
// talks to Supabase directly.
import type { Account, DailyMetric, Employee } from "@/lib/supabase";

export type MetricPair = { latest: DailyMetric | null; previous: DailyMetric | null };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || `Request failed (${response.status})`);
  return data as T;
}

const send = (url: string, method: string, body: unknown) => call(url, { method, body: JSON.stringify(body) });

export const fetchEmployees = () => call<Employee[]>("/api/employees");
export const createEmployee = (row: { name: string; pin: string; avatar_color: string }) => send("/api/employees", "POST", row);
export const updateEmployee = (id: string, row: { name: string; pin: string }) => send("/api/employees", "PUT", { id, ...row });
export const deleteEmployee = (id: string) => send("/api/employees", "DELETE", { id });

export const fetchAccounts = () => call<Account[]>("/api/accounts");
export const fetchAccountsWithMetrics = () =>
  call<{ accounts: Account[]; metrics: Record<string, MetricPair> }>("/api/accounts?metrics=latest");
export const fetchAccountDetail = (id: string) =>
  call<{ account: Account; metrics: DailyMetric[] }>(`/api/accounts?id=${encodeURIComponent(id)}&metrics=all`);
export const createAccount = (row: Record<string, unknown>) => send("/api/accounts", "POST", row);
export const updateAccount = (id: string, row: Record<string, unknown>) => send("/api/accounts", "PUT", { id, ...row });
export const deleteAccount = (id: string) => send("/api/accounts", "DELETE", { id });
