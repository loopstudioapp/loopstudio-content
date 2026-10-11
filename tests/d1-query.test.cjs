// lib/db.ts (the D1 query builder that replaced supabase-js) against a real
// SQLite database built from d1/migrations, through a D1-shaped adapter.
const { test } = require('node:test');
const strict = require('node:assert/strict');
// Rows come from another vm realm: compare plain JSON shapes.
const plain = (value) => JSON.parse(JSON.stringify(value));
const assert = Object.assign((...args) => strict(...args), strict, {
  deepEqual: (actual, expected, message) => strict.deepEqual(plain(actual), plain(expected), message),
});
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const dir = path.resolve(__dirname, '..', 'd1', 'migrations');
  for (const file of fs.readdirSync(dir).sort()) sqlite.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    all: async () => {
      const results = sqlite.prepare(sql).all(...params);
      const changes = Number(sqlite.prepare('SELECT changes() AS c').get().c);
      return { results, meta: { changes } };
    },
  });
  return {
    sqlite,
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.all());
        sqlite.exec('COMMIT');
        return out;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function load() {
  const d1 = fakeD1();
  const file = path.resolve(__dirname, '..', 'lib', 'db.ts');
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, console, JSON, Date, Number, String, Boolean, Array, Object, Math, Promise, Set, Map, Error,
    require(name) {
      if (name === '@opennextjs/cloudflare') return { getCloudflareContext: () => ({ env: { DB: d1 } }) };
      throw new Error(`unexpected require ${name}`);
    },
  });
  return { db: module.exports.db, d1 };
}

test('upsert merges only the given columns, like PostgREST', async () => {
  const { db } = load();
  let r = await db.from('rc_subscriptions').upsert({ id: 'a', app_user_id: 'u', status: 'active', revenue_gross: 5, country: 'VN' }, { onConflict: 'id' });
  assert.equal(r.error, null);
  assert.equal(r.data, null);
  r = await db.from('rc_subscriptions').upsert({ id: 'a', app_user_id: 'u', status: 'active', auto_renewal: 'will_not_renew' }, { onConflict: 'id' });
  assert.equal(r.error, null);
  const row = await db.from('rc_subscriptions').select('*').eq('id', 'a').single();
  assert.equal(row.data.country, 'VN');
  assert.equal(row.data.revenue_gross, 5);
  assert.equal(row.data.auto_renewal, 'will_not_renew');
  assert.equal(row.data.environment, 'production');
  // Missing NOT NULL column without default fails, as in Postgres.
  r = await db.from('rc_subscriptions').upsert({ id: 'b', app_user_id: 'u' }, { onConflict: 'id' });
  assert.equal(r.error.code, '23502');
});

test('timestamps are normalized so range filters compare by time', async () => {
  const { db } = load();
  await db.from('rc_renewal_events').upsert([
    { id: '1', app_user_id: 'u', app_name: 'AskMed', revenue: 1, occurred_at: '2026-10-03T17:00:00+00:00' },
    { id: '2', app_user_id: 'u', app_name: 'AskMed', revenue: 2, occurred_at: '2026-10-04T16:59:59.999999+00:00' },
    { id: '3', app_user_id: 'u', app_name: 'AskMed', revenue: 3, occurred_at: '2026-10-04T17:00:00.000Z' },
    { id: '4', app_user_id: 'u', app_name: 'AskMed', revenue: 4, occurred_at: '2026-10-04T00:00:00+07:00' },
  ], { onConflict: 'id' });
  const { data, error } = await db.from('rc_renewal_events').select('id, occurred_at')
    .gte('occurred_at', '2026-10-03T17:00:00.000Z').lt('occurred_at', '2026-10-04T17:00:00+00:00').order('id');
  assert.equal(error, null);
  // '+07:00' midnight is 17:00 UTC the day before, so it is inside the range.
  assert.deepEqual(data.map((r) => r.id), ['1', '2', '4']);
  assert.equal(data[0].occurred_at, '2026-10-03T17:00:00.000Z');
});

test('booleans and json round-trip; insert returns defaults', async () => {
  const { db } = load();
  const { data, error } = await db.from('calendar_tasks')
    .insert({ title: 'T', weekly_times: { 1: '06:00' }, timed: false, pin_first: true }).select().single();
  assert.equal(error, null);
  assert.match(data.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(data.weekly_times, { 1: '06:00' });
  assert.equal(data.timed, false);
  assert.equal(data.pin_first, true);
  assert.equal(data.priority, 5);
  assert.equal(data.deleted_at, null);
  const live = await db.from('calendar_tasks').select('*').is('deleted_at', null).order('created_at', { ascending: true });
  assert.equal(live.data.length, 1);
  const bad = await db.from('calendar_tasks').insert({ title: 'X', priority: 11 }).select().single();
  assert.equal(bad.error.code, '23514');
});

test('update with returning, single/maybeSingle, count head, in with many values, range', async () => {
  const { db } = load();
  const ids = Array.from({ length: 250 }, (_, i) => `id${String(i).padStart(3, '0')}`);
  const up = await db.from('pinterest_topics').upsert(ids.map((id) => ({ id, category: 'system', title_template: 't', description_template: '{}', prompt_seed: 's', times_used: 0 })), { onConflict: 'id' });
  assert.equal(up.error, null);
  const many = await db.from('pinterest_topics').select('id').in('id', ids.slice(0, 200));
  assert.equal(many.data.length, 200);
  const count = await db.from('pinterest_topics').select('id', { count: 'exact', head: true }).eq('category', 'system');
  assert.equal(count.count, 250);
  assert.equal(count.data, null);
  const page = await db.from('pinterest_topics').select('id').order('id').range(200, 299);
  assert.equal(page.data.length, 50);
  assert.equal(page.data[0].id, 'id200');
  const changed = await db.from('pinterest_topics').update({ prompt_seed: 'x' }).eq('id', 'id001').eq('prompt_seed', 's').select('id');
  assert.deepEqual(changed.data, [{ id: 'id001' }]);
  const stale = await db.from('pinterest_topics').update({ prompt_seed: 'y' }).eq('id', 'id001').eq('prompt_seed', 's').select('id');
  assert.deepEqual(stale.data, []);
  const none = await db.from('pinterest_topics').select('*').eq('id', 'missing').single();
  assert.equal(none.data, null);
  assert.equal(none.error.code, 'PGRST116');
  const maybe = await db.from('pinterest_topics').select('*').eq('id', 'missing').maybeSingle();
  assert.deepEqual([maybe.data, maybe.error], [null, null]);
  const dup = await db.from('pinterest_topics').insert({ id: 'id001', category: 'c', title_template: 't', description_template: 'd', prompt_seed: 'p' });
  assert.equal(dup.error.code, '23505');
});

test('composite conflict keys, delete, and unknown tables/columns', async () => {
  const { db } = load();
  const task = await db.from('calendar_tasks').insert({ title: 'T', recurrence: 'weekly' }).select().single();
  for (let i = 0; i < 2; i++) {
    const r = await db.from('calendar_task_completions')
      .upsert({ task_id: task.data.id, occurrence_date: '2026-10-11', completed_at: new Date().toISOString() }, { onConflict: 'task_id,occurrence_date' });
    assert.equal(r.error, null);
  }
  assert.equal((await db.from('calendar_task_completions').select('*')).data.length, 1);
  await db.from('calendar_task_completions').delete().eq('task_id', task.data.id).eq('occurrence_date', '2026-10-11');
  assert.equal((await db.from('calendar_task_completions').select('*')).data.length, 0);
  await db.from('fabi_daily_sales').upsert([{ date: '2026-10-10', store_uid: 'all', revenue_net: 1 }, { date: '2026-10-11', store_uid: 'all', revenue_net: 2 }], { onConflict: 'date,store_uid' });
  await db.from('fabi_daily_sales').upsert([{ date: '2026-10-11', store_uid: 'all', revenue_net: 3 }], { onConflict: 'date,store_uid' });
  const sales = await db.from('fabi_daily_sales').select('date, revenue_net').gte('date', '2026-10-01').lte('date', '2026-10-31').order('date', { ascending: true });
  assert.deepEqual(sales.data, [{ date: '2026-10-10', revenue_net: 1 }, { date: '2026-10-11', revenue_net: 3 }]);
  await db.from('fabi_auth_cache').upsert({ id: 'singleton', token: 't', token_expires_at: '2026-10-20T00:00:00Z', brand_uid: 'b', company_uid: 'c', store_uids: ['s1', 's2'] }, { onConflict: 'id' });
  const auth = await db.from('fabi_auth_cache').select('token, store_uids').eq('id', 'singleton').single();
  assert.deepEqual(auth.data.store_uids, ['s1', 's2']);
  assert.equal((await db.from('nope').select('*')).error.code, 'PGRST205');
  assert.equal((await db.from('calendar_tasks').select('nope')).error.code, 'PGRST204');
  assert.equal((await db.from('calendar_tasks').update({ nope: 1 }).eq('id', 'x')).error.code, 'PGRST204');
});
