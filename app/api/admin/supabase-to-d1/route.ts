// TEMPORARY (2026-10-11): one-off copy of the owner dashboard data from
// Supabase to D1. Runs inside the Worker because the Supabase service role key
// exists only as a Worker secret. Removed after the move.
//
// Auth: Authorization: Bearer <CRON_SECRET or OWNER_API_TOKEN>
// GET  ?action=schema           Supabase columns vs D1 columns per table
// GET  ?action=counts           row counts on both sides
// POST ?action=copy&mode=fresh  empty D1 tables, then copy every row
// POST ?action=copy&mode=merge  add rows D1 lacks; for tables with a change
//                               stamp, a newer Supabase row replaces the D1 row
// POST ?action=images           copy calendar images to R2, rewrite image_url (D1 only)
import { NextRequest, NextResponse } from "next/server";
import { TABLES, getDatabase, normalizeTimestamp } from "@/lib/db";
import { CALENDAR_IMAGE_PREFIX, CALENDAR_IMAGE_ROUTE, getImageBucket } from "@/lib/images";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Parents before children (calendar FKs).
const ORDER = [
  "employees",
  "pinterest_topics",
  "rc_subscriptions",
  "rc_renewal_events",
  "calendar_tasks",
  "calendar_task_completions",
  "calendar_task_skips",
  "calendar_task_overrides",
  "fabi_auth_cache",
  "fabi_daily_sales",
];

const CHANGE_STAMP: Record<string, string> = {
  rc_subscriptions: "updated_at",
  pinterest_topics: "prompt_seed",
  calendar_task_overrides: "updated_at",
  fabi_auth_cache: "refreshed_at",
  fabi_daily_sales: "fetched_at",
};

const PUBLIC_ORIGIN = "https://content.loopstudio.tech";

function authorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization") || "";
  const tokens = [process.env.CRON_SECRET, process.env.OWNER_API_TOKEN].filter(
    (token): token is string => typeof token === "string" && token.length >= 16,
  );
  return tokens.some((token) => header === `Bearer ${token}`);
}

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL or service role key missing");
  return { url, headers: { apikey: key, authorization: `Bearer ${key}` } };
}

async function supabaseCount(table: string): Promise<number> {
  const { url, headers } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    method: "HEAD",
    headers: { ...headers, prefer: "count=exact", range: "0-0" },
  });
  const range = response.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  if (!response.ok && response.status !== 206) throw new Error(`${table}: count HTTP ${response.status}`);
  if (!Number.isFinite(total)) throw new Error(`${table}: no count in "${range}"`);
  return total;
}

async function supabaseRows(table: string): Promise<Record<string, unknown>[]> {
  const { url, headers } = supabaseConfig();
  // Up to 1000 rows: one unordered read, so D1 gets the rows in Postgres'
  // storage order and unordered queries / ORDER BY ties come back the same way.
  const first = await fetch(`${url}/rest/v1/${table}?select=*&limit=1000`, { headers });
  if (!first.ok) throw new Error(`${table}: read HTTP ${first.status} ${(await first.text()).slice(0, 200)}`);
  const unordered = (await first.json()) as Record<string, unknown>[];
  if (unordered.length < 1000) return unordered;

  // Larger tables: stable primary-key pages (no rows skipped or repeated).
  const order = TABLES[table].pk.map((column) => `${column}.asc`).join(",");
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${url}/rest/v1/${table}?select=*&order=${order}&limit=1000&offset=${offset}`, {
      headers,
    });
    if (!response.ok) throw new Error(`${table}: read HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
    const page = (await response.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function d1Count(table: string): Promise<number> {
  const result = await getDatabase().prepare(`SELECT COUNT(*) AS n FROM "${table}"`).all();
  return Number(result.results?.[0]?.n ?? 0);
}

function encode(table: string, column: string, value: unknown): unknown {
  const kind = TABLES[table].columns[column];
  if (value === null || value === undefined) return null;
  if (kind === "ts") return normalizeTimestamp(value);
  if (kind === "bool") return value ? 1 : 0;
  if (kind === "json") return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

async function copyTable(table: string, mode: "fresh" | "merge") {
  const info = TABLES[table];
  const rows = await supabaseRows(table);
  const unknown = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) if (!(key in info.columns)) unknown.add(key);
  if (unknown.size) throw new Error(`${table}: Supabase columns missing in D1: ${[...unknown].join(", ")}`);

  const database = getDatabase();
  const columns = Object.keys(info.columns);
  const columnSql = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const target = info.pk.map((c) => `"${c}"`).join(", ");
  const stamp = CHANGE_STAMP[table];
  let conflict = "";
  if (mode === "merge") {
    const updates = columns.filter((c) => !info.pk.includes(c)).map((c) => `"${c}" = excluded."${c}"`).join(", ");
    conflict = stamp
      ? ` ON CONFLICT (${target}) DO UPDATE SET ${updates} WHERE excluded."${stamp}" > "${table}"."${stamp}"`
      : ` ON CONFLICT (${target}) DO NOTHING`;
  }
  const sql = `INSERT INTO "${table}" (${columnSql}) VALUES (${placeholders})${conflict}`;

  let largest = 0;
  let changed = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const statements = chunk.map((row) => {
      const values = columns.map((c) => encode(table, c, row[c]));
      for (const value of values) if (typeof value === "string") largest = Math.max(largest, value.length);
      return database.prepare(sql).bind(...values);
    });
    const results = await database.batch(statements);
    for (const result of results) changed += Number(result.meta?.changes ?? 0);
  }
  return { table, supabase_rows: rows.length, d1_rows_written: changed, largest_value_chars: largest };
}

async function copy(mode: "fresh" | "merge") {
  const database = getDatabase();
  if (mode === "fresh") {
    for (const table of [...ORDER].reverse()) await database.prepare(`DELETE FROM "${table}"`).all();
  }
  const results = [];
  for (const table of ORDER) results.push(await copyTable(table, mode));
  return results;
}

async function counts() {
  const out: Record<string, { supabase: number; d1: number; match: boolean }> = {};
  for (const table of ORDER) {
    const [supabase, d1] = await Promise.all([supabaseCount(table), d1Count(table)]);
    out[table] = { supabase, d1, match: supabase === d1 };
  }
  return out;
}

async function schema() {
  const { url, headers } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/`, { headers: { ...headers, accept: "application/openapi+json" } });
  if (!response.ok) throw new Error(`OpenAPI HTTP ${response.status}`);
  const spec = (await response.json()) as {
    definitions?: Record<string, { required?: string[]; properties: Record<string, { format?: string; default?: unknown }> }>;
  };
  const database = getDatabase();
  const out: Record<string, unknown> = {};
  for (const table of ORDER) {
    const definition = spec.definitions?.[table];
    const pragma = await database.prepare(`PRAGMA table_info("${table}")`).all();
    const d1Columns = (pragma.results || []).map((r) => String(r.name));
    const supabaseColumns = definition ? Object.keys(definition.properties) : [];
    out[table] = {
      supabase: definition
        ? Object.fromEntries(
            Object.entries(definition.properties).map(([name, p]) => [
              name,
              `${p.format}${definition.required?.includes(name) ? " not null" : ""}${p.default !== undefined ? ` default ${String(p.default)}` : ""}`,
            ]),
          )
        : "missing",
      only_in_supabase: supabaseColumns.filter((c) => !d1Columns.includes(c)),
      only_in_d1: d1Columns.filter((c) => !supabaseColumns.includes(c)),
    };
  }
  return out;
}

async function images() {
  const database = getDatabase();
  const bucket = getImageBucket();
  const rows = await database
    .prepare(`SELECT id, image_url FROM calendar_tasks WHERE image_url LIKE '%/storage/v1/object/public/calendar-images/%'`)
    .all();
  const moved: { id: string; name: string; bytes: number; content_type: string }[] = [];
  for (const row of rows.results || []) {
    const source = String(row.image_url);
    const name = decodeURIComponent(source.split("/calendar-images/")[1] || "").split("?")[0];
    if (!/^[A-Za-z0-9._-]{1,200}$/.test(name)) throw new Error(`Unexpected image name for task ${row.id}`);
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Image fetch HTTP ${response.status} for task ${row.id}`);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const bytes = await response.arrayBuffer();
    await bucket.put(`${CALENDAR_IMAGE_PREFIX}${name}`, bytes, { httpMetadata: { contentType } });
    const check = await bucket.get(`${CALENDAR_IMAGE_PREFIX}${name}`);
    if (!check) throw new Error(`R2 write not readable for task ${row.id}`);
    await database
      .prepare(`UPDATE calendar_tasks SET image_url = ? WHERE id = ?`)
      .bind(`${PUBLIC_ORIGIN}${CALENDAR_IMAGE_ROUTE}${name}`, row.id)
      .all();
    moved.push({ id: String(row.id), name, bytes: bytes.byteLength, content_type: contentType });
  }
  return moved;
}

async function handle(request: NextRequest, method: "GET" | "POST") {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const action = params.get("action");
  try {
    if (method === "GET" && action === "counts") return NextResponse.json(await counts());
    if (method === "GET" && action === "schema") return NextResponse.json(await schema());
    if (method === "POST" && action === "copy") {
      const mode = params.get("mode");
      if (mode !== "fresh" && mode !== "merge") return NextResponse.json({ error: "mode=fresh|merge" }, { status: 400 });
      const copied = await copy(mode);
      return NextResponse.json({ mode, copied, counts: await counts() });
    }
    if (method === "POST" && action === "images") return NextResponse.json({ moved: await images() });
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export function GET(request: NextRequest) {
  return handle(request, "GET");
}

export function POST(request: NextRequest) {
  return handle(request, "POST");
}
