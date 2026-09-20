const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const writes = [];
  const records = new Map();
  let metaCalls = 0;
  const supabase = { from(table) {
    let id;
    const query = {
      select() { return this; }, eq(key, value) { if (key === 'id') id = value; return this; },
      gte() { return this; }, lt() { return this; }, in() { return this; },
      single: async () => ({ data: records.get(id) || null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async (row) => { writes.push({ table, row }); records.set(row.id, row); return { error: null }; },
      then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
    };
    return query;
  }};
  const env = {
    REVENUECAT_ASKMED_API_KEY: 'test-only-key', REVENUECAT_ASKMED_PROJECT_ID: 'test-project',
    REVENUECAT_GRAILSCAN_API_KEY: 'test-grail-key', REVENUECAT_GRAILSCAN_PROJECT_ID: 'test-grail-project',
    REVENUECAT_WEBHOOK_SECRET: 'test-secret', REVENUECAT_ASKMED_WEBHOOK_SECRET: 'test-secret', CRON_SECRET: 'test-maintenance-secret',
  };
  const cache = new Map();
  function load(relative, extras = '') {
    const file = path.resolve(__dirname, '..', relative);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8') + extras, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const context = {
      module, exports: module.exports, process: { env }, console, URL, Date, Map, Set, setTimeout,
      fetch: async () => ({ ok: true, json: async () => ({ metrics: [{ id: 'mrr', value: 88 }] }) }),
      require(name) {
        if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
        if (name === '@/lib/supabase') return { supabase };
        if (name === '@/lib/meta/ads') return {
          getTodayMetaSpend: async () => { metaCalls++; return { configured: true, spend_usd: 12, spend_native: 12, currency: 'USD', usd_rate: 1, date: '2026-09-20' }; },
        };
        if (name === '@/lib/openrouter/costs') return { readOpenRouterDailyCosts: async () => ({}), refreshOpenRouterCurrentCost: async () => ({}) };
        if (name.startsWith('@/')) return load(name.replace('@/', '') + '.ts');
        throw new Error('Unexpected import ' + name);
      },
    };
    vm.runInNewContext(source, context, { filename: file });
    cache.set(file, module.exports);
    return module.exports;
  }
  return { load, env, writes, records, metaCalls: () => metaCalls };
}

function request(url, auth, event) {
  return { url, nextUrl: new URL(url), headers: new Headers(auth ? { authorization: auth } : {}), json: async () => ({ event }) };
}

test('AskMed fast dashboard stays isolated and uses its own cache without Meta', async () => {
  const h = harness();
  const { GET } = h.load('app/api/revenuecat/route.ts');
  const response = await GET(request('https://test/api/revenuecat?type=today_stats&app=AskMed&fast=1'));
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body.per_app), ['AskMed']);
  assert.equal(response.body.per_app.AskMed.mrr, 88);
  assert.equal(response.body.ads.configured, false);
  assert.equal(h.metaCalls(), 0);
  assert.equal(response.body.daily.length, 30);
  for (const point of response.body.daily) {
    assert.equal(point.higgsfield_cost, 0);
    assert.equal(point.openrouter_cost, 0);
    assert.equal(point.adspend_with_vat, 0);
  }
  assert.equal(response.body.profit.total_profit, response.body.daily.at(-1).profit);
  assert.equal(h.writes.at(-1).row.id, '__rc_today_stats_cache__:AskMed');
});

test('missing AskMed credentials are an error, not zero revenue; maintenance stays protected', async () => {
  const h = harness();
  delete h.env.REVENUECAT_ASKMED_API_KEY;
  const { GET } = h.load('app/api/revenuecat/route.ts');
  assert.equal((await GET(request('https://test/api/revenuecat?type=today_stats&app=AskMed'))).status, 503);
  const live = harness().load('app/api/revenuecat/route.ts');
  assert.equal((await live.GET(request('https://test/api/revenuecat?type=today_stats&app=AskMed&refresh=1'))).status, 401);
});

test('AskMed plans and historical operating costs exclude GrailScan-only providers', () => {
  const h = harness();
  const api = h.load('app/api/revenuecat/route.ts', '\nexports.helpers = { planName, applyGrailScanOperatingCosts };');
  assert.equal(api.helpers.planName('prod4b93133020'), 'Weekly');
  assert.equal(api.helpers.planName('prod6aed4f3bb5'), 'Yearly');
  const day = { date: '2026-09-20', revenue: 3000, profit: 2550, refund_amount: 0, refund_reversed_amount: 0 };
  const askmed = api.helpers.applyGrailScanOperatingCosts([day], {}, 0)[0];
  assert.equal(askmed.revenuecat_cost, 30);
  assert.equal(askmed.higgsfield_cost, 0);
  assert.equal(askmed.profit, 2520);
  const grailscan = api.helpers.applyGrailScanOperatingCosts([day], { '2026-09-20': 5 })[0];
  assert.equal(grailscan.higgsfield_cost, 50 / 30);
  assert.equal(grailscan.openrouter_cost, 5);
});

test('AskMed webhook routes and namespaces purchases, renewals, cancellations and refunds', async () => {
  const h = harness();
  const { POST } = h.load('app/api/webhooks/revenuecat/route.ts');
  const base = { app_user_id: 'shared-id', product_id: 'com.loopstudio.askmed.weekly', environment: 'PRODUCTION', store: 'APP_STORE', price: 6.99, purchased_at_ms: Date.now(), expiration_at_ms: Date.now() + 604800000 };
  for (const type of ['INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', 'UNCANCELLATION', 'EXPIRATION', 'REFUND_REVERSED']) {
    const res = await POST(request('https://test/api/webhooks/revenuecat?app=askmed', 'Bearer test-secret', { ...base, type }));
    assert.equal(res.status, 200);
  }
  for (const { table, row } of h.writes) {
    if (table === 'rc_subscriptions') assert.equal(row.id, 'AskMed:shared-id');
    else assert.ok(row.id.includes('AskMed:'));
  }
  const count = h.writes.length;
  await POST(request('https://test/api/webhooks/revenuecat?app=askmed', 'Bearer test-secret', { ...base, type: 'INITIAL_PURCHASE', environment: 'SANDBOX' }));
  assert.equal(h.writes.length, count);
  assert.equal((await POST(request('https://test/api/webhooks/revenuecat?app=askmed', '', { ...base, type: 'INITIAL_PURCHASE' }))).status, 401);
  await POST(request('https://test/api/webhooks/revenuecat?app=grailscan', 'Bearer test-secret', { ...base, type: 'INITIAL_PURCHASE', product_id: 'grail.weekly' }));
  assert.equal(h.writes.at(-1).row.id, 'shared-id');
  assert.equal(h.writes.at(-1).row.app_name, 'GrailScan');
});
