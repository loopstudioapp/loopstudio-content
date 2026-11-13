// Permanent owner history (Loop 2026-11-13: keep profit and all data forever, not 30 days).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fakeDb() {
  const records = new Map();
  const from = () => {
    const filters = []; let value, operation, ordered = false;
    const q = {
      select() { return this; },
      eq(k, v) { filters.push(r => r[k] === v); return this; },
      in(k, v) { filters.push(r => v.includes(r[k])); return this; },
      gte(k, v) { filters.push(r => r[k] >= v); return this; },
      lte(k, v) { filters.push(r => r[k] <= v); return this; },
      order() { ordered = true; return this; },
      upsert(v) { value = v; operation = 'upsert'; return this; },
      async execute(single = false) {
        if (operation) { (Array.isArray(value) ? value : [value]).forEach(r => records.set(r.id, r)); return { data: null, error: null }; }
        let rows = [...records.values()].filter(r => filters.every(f => f(r)));
        if (ordered) rows = rows.sort((a, b) => a.id.localeCompare(b.id));
        return { data: single ? rows[0] || null : rows, error: null };
      },
      maybeSingle() { return this.execute(true); },
      then(resolve, reject) { return this.execute().then(resolve, reject); },
    };
    return q;
  };
  return { records, db: { from } };
}

function load(store) {
  const file = path.resolve(__dirname, '../lib/owner/history.ts'), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, Date, Math, JSON, Object, Number, Set, Map, Error,
    require(name) { if (name === '@/lib/db') return { db: store.db }; throw Error(name); } }, { filename: file });
  return module.exports;
}

const point = (date, over = {}) => ({ date, revenue: 0, purchase_revenue: 0, profit: 0, new_subs: 0, adspend_with_vat: 0,
  cost_per_sub: 0, openrouter_cost: 0, revenuecat_cost: 0, higgsfield_cost: 0, refund_amount: 0, refund_count: 0,
  refund_reversed_amount: 0, refund_reversed_count: 0, refund_source_amount: 0, refund_source_reversed_amount: 0, ...over });
const android = (over = {}) => ({ revenue: 0, new_subs: 0, refund_source_amount: 0, refund_source_reversed_amount: 0, by_user: {}, ...over });

function input(over = {}) {
  return {
    dates: ['2026-11-11', '2026-11-12'], today: '2026-11-12',
    grail: { '2026-11-11': point('2026-11-11', { revenue: 100, new_subs: 1, refund_source_amount: 10 }) },
    askmed: {
      '2026-11-11': point('2026-11-11', { revenue: 1000, new_subs: 10, refund_source_amount: 50, android: android({ revenue: 200, new_subs: 2, refund_source_amount: 20 }) }),
      '2026-11-12': point('2026-11-12', { revenue: 500, new_subs: 5 }),
    },
    metaWithVat: { '2026-11-11': 660, '2026-11-12': 330 },
    metaSplit: { '2026-11-11': { ios: 9, android: 1 }, '2026-11-12': { ios: 1, android: 1 } },
    openrouter: { '2026-11-11': 13, '2026-11-12': 5 },
    aiAds: { '2026-11-11': 1, '2026-11-12': 1 },
    appleKept: () => 0.8, googleKept: () => 0.85, revenuecatRate: () => 0.01, source: 'live', ...over,
  };
}

test('each part adds up, with the day\'s real refunds and the page\'s cost split', () => {
  const { buildHistoryDays } = load(fakeDb());
  const [day, today] = buildHistoryDays(input());
  assert.equal(day.grailscan.refunds, 10);
  assert.equal(day.android.revenue, 200);
  assert.equal(day.android.refunds, 20);
  assert.equal(day.ios.revenue, 800);
  assert.equal(day.ios.refunds, 30);
  assert.equal(day.ios.new_subs, 8);
  assert.equal(day.ios.store_cut, Math.round(770 * 0.2 * 1e4) / 1e4);
  assert.equal(day.android.store_cut, 27);
  assert.equal(day.android.meta, 66);
  assert.equal(day.ios.meta, 594);
  assert.equal(day.grailscan.meta, 0);
  assert.equal(day.grailscan.openrouter, Math.round(13 * 100 / 1100 * 1e4) / 1e4);
  for (const field of ['revenue', 'refunds', 'store_cut', 'meta', 'openrouter', 'ai_ads', 'profit', 'new_subs']) {
    const sum = day.grailscan[field] + day.ios[field] + day.android[field];
    assert.ok(Math.abs(sum - day.total[field]) < 0.001, field);
  }
  const net = 1100 - 60;
  const expected = net - (90 * 0.2 + 770 * 0.2 + 180 * 0.15) - 660 - net * 0.01 - 13 - 1;
  assert.ok(Math.abs(day.total.profit - expected) < 0.001, JSON.stringify(day));
  assert.equal(day.partial, false);
  assert.equal(today.partial, true);
  // GrailScan has no row this day: zero, not missing.
  assert.equal(today.grailscan.revenue, 0);
});

test('a day without Google Play numbers keeps all AskMed money and spend with iOS', () => {
  const { buildHistoryDays } = load(fakeDb());
  const [, day] = buildHistoryDays(input());
  assert.equal(day.android.meta, 0);
  assert.equal(day.ios.meta, 330);
  assert.equal(day.ios.revenue, 500);
});

test('saved days stay forever: backfill never replaces the page\'s own day, the page always does', async () => {
  const store = fakeDb();
  const { buildHistoryDays, saveHistoryDays, readHistory, summarizeHistory } = load(store);
  const live = buildHistoryDays(input());
  assert.deepEqual({ ...(await saveHistoryDays(live)) }, { written: 2, kept_live: 0 });
  assert.deepEqual({ ...(await saveHistoryDays(live)) }, { written: 0, kept_live: 0 }, 'unchanged days are not rewritten');
  const backfill = buildHistoryDays(input({ source: 'backfill', dates: ['2026-11-10', '2026-11-11'], metaWithVat: {} }));
  assert.deepEqual({ ...(await saveHistoryDays(backfill)) }, { written: 1, kept_live: 1 });
  const days = await readHistory('2026-11-10', '2026-11-12');
  assert.deepEqual(JSON.parse(JSON.stringify(days.map(d => [d.date, d.source]))), [['2026-11-10', 'backfill'], ['2026-11-11', 'live'], ['2026-11-12', 'live']]);
  assert.equal(days[1].total.meta, 660);
  const summary = summarizeHistory(days, '2026-11-09', '2026-11-12');
  assert.deepEqual([...summary.missing_dates], ['2026-11-09']);
  assert.equal(summary.days_saved, 3);
  assert.equal(summary.totals.total.revenue, 0 + 1100 + 500);
  assert.deepEqual([...summary.partial_dates], ['2026-11-12']);
});

test('Meta by campaign name: GRAIL to GrailScan, other apps kept out of every part', () => {
  const { buildHistoryDays, summarizeHistory } = load(fakeDb());
  const [day] = buildHistoryDays(input({ metaSplit: { '2026-11-11': { ios: 5, android: 1, grailscan: 3, other: 1 } } }));
  assert.equal(day.grailscan.meta, 198);
  assert.equal(day.android.meta, 66);
  assert.equal(day.ios.meta, 330);
  assert.equal(day.other_apps_meta, 66);
  assert.equal(day.total.meta, 594);
  assert.equal(day.android.ai_ads, Math.round(1 / 6 * 1e4) / 1e4);
  assert.equal(summarizeHistory([day], '2026-11-11', '2026-11-11').other_apps_meta, 66);
});

test('auto tax brackets match the owner page', () => {
  const { autoTaxRate } = load(fakeDb());
  assert.equal(autoTaxRate(500_000_000), 0);
  assert.equal(autoTaxRate(1_145_478_625), 0.15);
  assert.equal(autoTaxRate(3_000_000_001), 0.17);
  assert.equal(autoTaxRate(60_000_000_000), 0.2);
  const page = fs.readFileSync(path.resolve(__dirname, '../app/owner/page.tsx'), 'utf8');
  for (const limit of ['500_000_000', '3_000_000_000', '50_000_000_000']) assert.ok(page.includes(limit));
});
