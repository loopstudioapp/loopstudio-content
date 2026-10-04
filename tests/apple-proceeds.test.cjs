const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(env = {}) {
  const records = new Map();
  const supabase = { from() {
    let id, ids, value;
    const q = {
      select() { return q; }, eq(k, v) { id = v; return q; }, in(k, v) { ids = v; return q; },
      maybeSingle: async () => ({ data: records.get(id) || null, error: null }),
      upsert(v) { value = v; return q; },
      then(resolve, reject) {
        if (value) { (Array.isArray(value) ? value : [value]).forEach(r => records.set(r.id, r)); return Promise.resolve({ error: null }).then(resolve, reject); }
        return Promise.resolve({ data: (ids || []).map(i => records.get(i)).filter(Boolean), error: null }).then(resolve, reject);
      },
    };
    return q;
  }};
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(__dirname, '..', relative);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, {
      module, exports: module.exports, process: { env }, console: { error() {} }, URL, Date, Map, Set, Buffer, Intl,
      fetch: async () => { throw new Error('no network in tests'); },
      require(name) {
        if (name === '@/lib/supabase') return { supabase };
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
        if (name.startsWith('node:')) return require(name);
        throw new Error('Unexpected import ' + name);
      },
    }, { filename: file });
    cache.set(file, module.exports);
    return module.exports;
  }
  return { load, records };
}

const header = ['SKU', 'Parent Identifier', 'Units', 'Developer Proceeds', 'Customer Price', 'Customer Currency', 'Currency of Proceeds'].join('\t');

test('sales report sums proceeds and customer price by app; refunds subtract', () => {
  const { parseSalesReport } = harness().load('lib/appstore/proceeds.ts');
  const report = parseSalesReport([
    header,
    ['askmed', '', '40', '0.00', '0.00', 'USD', ''].join('\t'),
    ['com.askmed.weekly', 'askmed', '3', '12.74', '14.99', 'USD', 'USD'].join('\t'),
    ['com.askmed.yearly', 'askmed', '-1', '106.24', '-149.99', 'USD', 'USD'].join('\t'),
    ['grailweekly', 'grailscan-001', '2', '7.03', '9.99', 'EUR', 'EUR'].join('\t'),
  ].join('\n'));
  assert.ok(Math.abs(report.askmed.proceeds.USD - (3 * 12.74 - 106.24)) < 1e-9);
  assert.ok(Math.abs(report.askmed.price.USD - (3 * 14.99 - 149.99)) < 1e-9);
  assert.ok(Math.abs(report['grailscan-001'].price.EUR - 19.98) < 1e-9);
  assert.equal(Object.keys(report).length, 2, 'free downloads are ignored');
});

test('proceeds fall back to the last saved value, then to 85%', async () => {
  const empty = await harness().load('lib/appstore/proceeds.ts').getAppleProceeds();
  assert.equal(empty.source, 'default');
  assert.deepEqual({ ...empty.kept_share }, { GrailScan: 0.85, AskMed: 0.85 });

  const h = harness();
  const saved = { kept_share: { GrailScan: 0.77, AskMed: 0.76 }, kept_share_by_date: { GrailScan: {}, AskMed: {} },
    ytd_proceeds_vnd: 1, updated_at: new Date(Date.now() - 13 * 3600000).toISOString(), source: 'apple' };
  h.records.set('__asc_proceeds_summary__', { id: '__asc_proceeds_summary__', description_template: JSON.stringify(saved) });
  const stale = await h.load('lib/appstore/proceeds.ts').getAppleProceeds();
  assert.equal(stale.source, 'saved', 'a failed refresh keeps the last known share');
  assert.equal(stale.kept_share.AskMed, 0.76);
});

test('owner profit uses each app\'s kept share for each day', () => {
  const { combineOwnerStats } = harness().load('lib/revenuecat/owner.ts');
  const snapshot = (app, revenue) => ({
    today_vn: '2026-10-02',
    per_app: { [app]: { today_revenue: revenue, new_revenue: revenue, new_subs: 1, mrr: 0 } },
    transactions: [], ads: {}, profit: { apple_commission_rate: .15, adspend_with_vat: 10 },
    daily: ['2026-10-01', '2026-10-02'].map(date => ({ date, revenue, purchase_revenue: revenue, new_subs: 1,
      refund_amount: 0, refund_reversed_amount: 0, adspend_with_vat: 10, openrouter_cost: 0, higgsfield_cost: 0, profit: 0 })),
  });
  const kept = { current: { GrailScan: 0.8, AskMed: 0.7 },
    by_date: { GrailScan: { '2026-10-01': 0.85 }, AskMed: { '2026-10-01': 0.75 } } };
  const result = combineOwnerStats(snapshot('GrailScan', 100), snapshot('AskMed', 200), kept);
  const [past, today] = result.daily;
  assert.ok(Math.abs(past.profit - (100 * 0.85 + 200 * 0.75 - 10)) < 1e-9, 'past day uses its own window');
  assert.ok(Math.abs(today.profit - (100 * 0.8 + 200 * 0.7 - 10)) < 1e-9);
  assert.equal(result.profit.total_profit, today.profit);
  assert.ok(Math.abs(result.profit.net_revenue - 220) < 1e-9);
  assert.ok(Math.abs(result.profit.apple_commission_rate - (past.apple_cost + today.apple_cost) / 600) < 1e-9);
});
