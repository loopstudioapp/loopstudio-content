// Owner dashboard database: Cloudflare D1 `content-dashboard` (binding DB).
//
// Moved from Supabase on 2026-10-11. `db.from(table)` is a small query
// builder with the same shape and results as the supabase-js calls it
// replaced ({ data, error, count }), so the route logic stayed unchanged:
//   select / insert / upsert / update / delete
//   eq, neq, gt, gte, lt, lte, is, in, order, limit, range, single, maybeSingle
//
// Value handling (schema: d1/migrations/):
// - timestamps are stored as UTC "YYYY-MM-DDTHH:MM:SS.ffffffZ"; writes and
//   filter values on timestamp columns are normalized to that format, so
//   text comparison equals time comparison (Postgres compared timestamps).
//   Reads return Postgres' spelling ("...SS[.fff]+00:00").
// - booleans are stored as 0/1 and returned as true/false.
// - json columns are stored as JSON text and returned parsed.
// - Unknown tables/columns return the PostgREST error codes the routes check.
import { getCloudflareContext } from "@opennextjs/cloudflare";

type Kind = "text" | "int" | "real" | "ts" | "date" | "bool" | "json";
type TableInfo = { pk: string[]; columns: Record<string, Kind> };

export const TABLES: Record<string, TableInfo> = {
  employees: {
    pk: ["id"],
    columns: { id: "text", name: "text", pin: "text", avatar_color: "text", created_at: "ts" },
  },
  pinterest_topics: {
    pk: ["id"],
    columns: {
      id: "text", category: "text", title_template: "text", description_template: "text",
      prompt_seed: "text", times_used: "int", last_used_at: "ts", created_at: "ts",
    },
  },
  rc_subscriptions: {
    pk: ["id"],
    columns: {
      id: "text", app_user_id: "text", country: "text", store: "text", product_id: "text",
      status: "text", auto_renewal: "text", environment: "text", purchased_at: "ts",
      expires_at: "ts", revenue_gross: "real", updated_at: "ts", created_at: "ts", app_name: "text",
    },
  },
  rc_renewal_events: {
    pk: ["id"],
    columns: {
      id: "text", app_user_id: "text", app_name: "text", product_id: "text", country: "text",
      store: "text", revenue: "real", occurred_at: "ts", created_at: "ts",
    },
  },
  calendar_tasks: {
    pk: ["id"],
    columns: {
      id: "text", title: "text", description: "text", image_url: "text", priority: "int",
      category: "text", estimate_minutes: "int", recurrence: "text", start_date: "date",
      start_time: "text", weekly_times: "json", monthly_day: "int", yearly_month: "int",
      yearly_day: "int", deleted_at: "ts", created_at: "ts", timed: "bool", pin_first: "bool",
    },
  },
  calendar_task_completions: {
    pk: ["id"],
    columns: { id: "text", task_id: "text", occurrence_date: "date", completed_at: "ts" },
  },
  calendar_task_skips: {
    pk: ["id"],
    columns: { id: "text", task_id: "text", occurrence_date: "date", created_at: "ts" },
  },
  calendar_task_overrides: {
    pk: ["id"],
    columns: {
      id: "text", task_id: "text", occurrence_date: "date", display_date: "date",
      start_time: "text", created_at: "ts", updated_at: "ts",
    },
  },
  fabi_auth_cache: {
    pk: ["id"],
    columns: {
      id: "text", token: "text", token_expires_at: "ts", brand_uid: "text",
      company_uid: "text", store_uids: "json", refreshed_at: "ts",
    },
  },
  fabi_daily_sales: {
    pk: ["date", "store_uid"],
    columns: {
      date: "date", store_uid: "text", revenue_net: "int", revenue_gross: "int",
      discount_amount: "int", invoice_count: "int", fetched_at: "ts",
    },
  },
  askmed_channel_daily: {
    pk: ["date"],
    columns: {
      date: "date", app_referrer_usd: "real", web_referrer_usd: "real", app_store_search_usd: "real",
      app_store_browse_usd: "real", institutional_usd: "real", unavailable_usd: "real", other_usd: "real",
      source: "text", updated_at: "ts",
    },
  },
  askmed_channel_instances: {
    pk: ["id"],
    columns: { id: "text", request_kind: "text", processing_date: "date", dates: "json", fetched_at: "ts" },
  },
};

// Minimal D1 surface (types from @cloudflare/workers-types are not installed).
type D1Result = { results?: Record<string, unknown>[]; meta?: { changes?: number } };
type D1Statement = { bind(...values: unknown[]): D1Statement; all(): Promise<D1Result> };
export type D1Database = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
};

export function getDatabase(): D1Database {
  const env = getCloudflareContext().env as unknown as { DB?: D1Database };
  if (!env.DB) throw new Error("D1 binding DB is not configured");
  return env.DB;
}

export type DbError = { message: string; code: string; details: string | null; hint: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbResult<T = any> = { data: T; error: DbError | null; count: number | null; status: number };

class QueryError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Postgres timestamptz accepted many spellings; store one fixed-width UTC form,
 * "YYYY-MM-DDTHH:MM:SS.ffffffZ" (microseconds, like Postgres), so text order
 * is time order.
 */
export function normalizeTimestamp(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : `${date.toISOString().slice(0, 23)}000Z`;
  }
  if (typeof value !== "string") return value;
  const match = value.trim().match(TIMESTAMP);
  if (!match) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : `${new Date(parsed).toISOString().slice(0, 23)}000Z`;
  }
  const [, day, hourMinute, second = "00", fraction = "", zone] = match;
  let offset = !zone || zone.toUpperCase() === "Z" ? "Z" : zone;
  if (/^[+-]\d{2}$/.test(offset)) offset += ":00";
  else if (/^[+-]\d{4}$/.test(offset)) offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const base = Date.parse(`${day}T${hourMinute}:${second}${offset}`);
  if (Number.isNaN(base)) return value;
  return `${new Date(base).toISOString().slice(0, 19)}.${fraction.slice(0, 6).padEnd(6, "0")}Z`;
}

/** Stored form back to what PostgREST returned: "...SS[.fff]+00:00". */
export function displayTimestamp(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/);
  if (!match) return value;
  const fraction = (match[2] || "").replace(/0+$/, "");
  return `${match[1]}${fraction ? `.${fraction}` : ""}+00:00`;
}

function encodeValue(kind: Kind, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  switch (kind) {
    case "ts":
      return normalizeTimestamp(value);
    case "bool":
      return value ? 1 : 0;
    case "json":
      return JSON.stringify(value);
    default:
      if (typeof value === "boolean") return value ? 1 : 0;
      if (typeof value === "object") return JSON.stringify(value);
      return value;
  }
}

function decodeRow(info: TableInfo, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const kind = info.columns[key];
    if (value === null || value === undefined) out[key] = null;
    else if (kind === "bool") out[key] = Boolean(value);
    else if (kind === "ts" && typeof value === "string") out[key] = displayTimestamp(value);
    else if (kind === "json" && typeof value === "string") {
      try {
        out[key] = JSON.parse(value);
      } catch {
        out[key] = value;
      }
    } else out[key] = value;
  }
  return out;
}

type Filter = { sql: string; params: unknown[] };
type Operation = "select" | "insert" | "upsert" | "update" | "delete";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Query<T = any[]> implements PromiseLike<DbResult<T>> {
  private operation: Operation = "select";
  private columns = "*";
  private returning: string | null = null;
  private countMode = false;
  private headOnly = false;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private singleMode: "single" | "maybe" | null = null;
  private values: Record<string, unknown>[] = [];
  private conflictColumns: string[] = [];
  private ignoreDuplicates = false;
  private problem: QueryError | null = null;

  constructor(private table: string, private database?: D1Database) {}

  private get info(): TableInfo {
    const info = TABLES[this.table];
    if (!info) throw new QueryError(`Could not find the table 'public.${this.table}' in the schema cache`, "PGRST205");
    return info;
  }

  private column(name: string): string {
    const column = name.trim();
    if (!IDENT.test(column) || !(column in this.info.columns)) {
      throw new QueryError(`Could not find the '${column}' column of '${this.table}' in the schema cache`, "PGRST204");
    }
    return `"${column}"`;
  }

  private guard(fn: () => void): this {
    if (this.problem) return this;
    try {
      fn();
    } catch (error) {
      this.problem = error instanceof QueryError ? error : new QueryError(String(error), "DB000");
    }
    return this;
  }

  private columnList(columns: string): string {
    const trimmed = columns.trim();
    if (!trimmed || trimmed === "*") return "*";
    return trimmed.split(",").map((c) => this.column(c)).join(", ");
  }

  private filterValue(column: string, value: unknown): unknown {
    return encodeValue(this.info.columns[column.trim()], value);
  }

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    return this.guard(() => {
      const list = this.columnList(columns);
      if (this.operation === "select") {
        this.columns = list;
        this.countMode = Boolean(options?.count);
        this.headOnly = Boolean(options?.head);
      } else {
        this.returning = list;
      }
    });
  }

  private setValues(operation: Operation, values: Record<string, unknown> | Record<string, unknown>[]) {
    this.operation = operation;
    const rows = Array.isArray(values) ? values : [values];
    // Like PostgREST: a multi-row write uses the union of keys, missing keys = null.
    const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    keys.forEach((key) => this.column(key));
    this.values = rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null])));
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    return this.guard(() => this.setValues("insert", values));
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    return this.guard(() => {
      this.setValues("upsert", values);
      this.conflictColumns = options?.onConflict
        ? options.onConflict.split(",").map((c) => c.trim())
        : this.info.pk;
      this.conflictColumns.forEach((c) => this.column(c));
      this.ignoreDuplicates = Boolean(options?.ignoreDuplicates);
    });
  }

  update(values: Record<string, unknown>): this {
    return this.guard(() => {
      this.operation = "update";
      Object.keys(values).forEach((key) => this.column(key));
      this.values = [values];
    });
  }

  delete(): this {
    return this.guard(() => {
      this.operation = "delete";
    });
  }

  private compare(column: string, op: string, value: unknown): this {
    return this.guard(() => {
      this.filters.push({ sql: `${this.column(column)} ${op} ?`, params: [this.filterValue(column, value)] });
    });
  }

  eq(column: string, value: unknown) { return this.compare(column, "=", value); }
  neq(column: string, value: unknown) { return this.compare(column, "<>", value); }
  gt(column: string, value: unknown) { return this.compare(column, ">", value); }
  gte(column: string, value: unknown) { return this.compare(column, ">=", value); }
  lt(column: string, value: unknown) { return this.compare(column, "<", value); }
  lte(column: string, value: unknown) { return this.compare(column, "<=", value); }

  is(column: string, value: null | boolean): this {
    return this.guard(() => {
      const name = this.column(column);
      if (value === null) this.filters.push({ sql: `${name} IS NULL`, params: [] });
      else this.filters.push({ sql: `${name} IS ?`, params: [value ? 1 : 0] });
    });
  }

  in(column: string, values: readonly unknown[]): this {
    return this.guard(() => {
      // One JSON parameter instead of one per value: D1 allows 100 bound parameters.
      const encoded = values.map((value) => this.filterValue(column, value));
      this.filters.push({ sql: `${this.column(column)} IN (SELECT value FROM json_each(?))`, params: [JSON.stringify(encoded)] });
    });
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    return this.guard(() => {
      const ascending = options?.ascending !== false;
      // Postgres default: ASC NULLS LAST, DESC NULLS FIRST.
      const nullsFirst = options?.nullsFirst ?? !ascending;
      this.orders.push(`${this.column(column)} ${ascending ? "ASC" : "DESC"} NULLS ${nullsFirst ? "FIRST" : "LAST"}`);
    });
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  single(): Query<any> {
    this.singleMode = "single";
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maybeSingle(): Query<any> {
    this.singleMode = "maybe";
    return this;
  }

  private where(): { sql: string; params: unknown[] } {
    if (!this.filters.length) return { sql: "", params: [] };
    return {
      sql: ` WHERE ${this.filters.map((f) => f.sql).join(" AND ")}`,
      params: this.filters.flatMap((f) => f.params),
    };
  }

  private tail(): string {
    let sql = this.orders.length ? ` ORDER BY ${this.orders.join(", ")}` : "";
    if (this.limitCount !== null) sql += ` LIMIT ${Math.max(0, Math.floor(this.limitCount))}`;
    if (this.offsetCount !== null) {
      if (this.limitCount === null) sql += " LIMIT -1";
      sql += ` OFFSET ${Math.max(0, Math.floor(this.offsetCount))}`;
    }
    return sql;
  }

  private encodedRow(row: Record<string, unknown>): { keys: string[]; params: unknown[] } {
    const keys = Object.keys(row);
    return { keys, params: keys.map((key) => encodeValue(this.info.columns[key], row[key])) };
  }

  private async run(): Promise<DbResult> {
    if (this.problem) throw this.problem;
    const info = this.info;
    const database = this.database ?? getDatabase();
    const table = `"${this.table}"`;
    let rows: Record<string, unknown>[] | null = null;
    let count: number | null = null;

    if (this.operation === "select") {
      const where = this.where();
      if (this.countMode) {
        const result = await database.prepare(`SELECT COUNT(*) AS n FROM ${table}${where.sql}`).bind(...where.params).all();
        count = Number(result.results?.[0]?.n ?? 0);
      }
      if (!this.headOnly) {
        const result = await database
          .prepare(`SELECT ${this.columns} FROM ${table}${where.sql}${this.tail()}`)
          .bind(...where.params)
          .all();
        rows = result.results ?? [];
      }
    } else if (this.operation === "insert" || this.operation === "upsert") {
      const returning = this.returning ? ` RETURNING ${this.returning}` : "";
      const statements = this.values.map((row) => {
        const { keys, params } = this.encodedRow(row);
        const columnSql = keys.map((key) => `"${key}"`).join(", ");
        let sql = keys.length
          ? `INSERT INTO ${table} (${columnSql}) VALUES (${keys.map(() => "?").join(", ")})`
          : `INSERT INTO ${table} DEFAULT VALUES`;
        if (this.operation === "upsert") {
          const target = this.conflictColumns.map((c) => `"${c}"`).join(", ");
          const updates = keys.filter((key) => !this.conflictColumns.includes(key));
          sql += this.ignoreDuplicates || !updates.length
            ? ` ON CONFLICT (${target}) DO NOTHING`
            : ` ON CONFLICT (${target}) DO UPDATE SET ${updates.map((key) => `"${key}" = excluded."${key}"`).join(", ")}`;
        }
        return database.prepare(sql + returning).bind(...params);
      });
      // One batch = one transaction, like a single PostgREST request.
      const results = statements.length === 1 ? [await statements[0].all()] : await database.batch(statements);
      if (this.returning) rows = results.flatMap((result) => result.results ?? []);
    } else if (this.operation === "update") {
      const { keys, params } = this.encodedRow(this.values[0] ?? {});
      if (!keys.length) throw new QueryError("Empty update", "PGRST100");
      const where = this.where();
      const returning = this.returning ? ` RETURNING ${this.returning}` : "";
      const result = await database
        .prepare(`UPDATE ${table} SET ${keys.map((key) => `"${key}" = ?`).join(", ")}${where.sql}${returning}`)
        .bind(...params, ...where.params)
        .all();
      if (this.returning) rows = result.results ?? [];
    } else {
      const where = this.where();
      const returning = this.returning ? ` RETURNING ${this.returning}` : "";
      const result = await database.prepare(`DELETE FROM ${table}${where.sql}${returning}`).bind(...where.params).all();
      if (this.returning) rows = result.results ?? [];
    }

    const decoded = rows ? rows.map((row) => decodeRow(info, row)) : null;
    if (this.singleMode && decoded) {
      if (decoded.length === 1) return { data: decoded[0], error: null, count, status: 200 };
      if (decoded.length === 0 && this.singleMode === "maybe") return { data: null, error: null, count, status: 200 };
      throw new QueryError(
        `JSON object requested, multiple (or no) rows returned (${decoded.length} rows)`,
        "PGRST116",
      );
    }
    return { data: decoded, error: null, count, status: 200 };
  }

  async execute(): Promise<DbResult<T>> {
    try {
      return (await this.run()) as DbResult<T>;
    } catch (error) {
      return { data: null as T, error: toDbError(error), count: null, status: 400 };
    }
  }

  then<TResult1 = DbResult<T>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function toDbError(error: unknown): DbError {
  if (error instanceof QueryError) return { message: error.message, code: error.code, details: null, hint: null };
  const message = error instanceof Error ? error.message : String(error);
  let code = "DB000";
  const missingColumn = message.match(/no such column: (\w+)|has no column named (\w+)/i);
  if (/no such table/i.test(message)) code = "42P01";
  else if (missingColumn) code = "PGRST204";
  else if (/UNIQUE constraint failed/i.test(message)) code = "23505";
  else if (/NOT NULL constraint failed/i.test(message)) code = "23502";
  else if (/CHECK constraint failed/i.test(message)) code = "23514";
  else if (/FOREIGN KEY constraint failed/i.test(message)) code = "23503";
  return { message, code, details: null, hint: null };
}

/** Drop-in for the old `supabase` client's table access. */
export const db = {
  from(table: string, database?: D1Database): Query {
    return new Query(table, database);
  },
};

export type Employee = {
  id: string;
  name: string;
  pin: string;
  avatar_color: string;
  created_at: string;
};
