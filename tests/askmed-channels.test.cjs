// AskMed Meta/organic revenue split (lib/appstore/channels.ts): Apple
// "App Store Purchases Standard" parsing, the split math, and the sync against
// a SQLite D1 (migrations + website seed) with a fake App Store Connect API.
const { test } = require('node:test');
const strict = require('node:assert/strict');
// Values come from another vm realm: compare plain JSON shapes.
const plain = (value) => JSON.parse(JSON.stringify(value));
const assert = Object.assign((...args) => strict(...args), strict, {
  deepEqual: (actual, expected, message) => strict.deepEqual(plain(actual), plain(expected), message),
});
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const SEED = path.join(root, 'd1', 'seed', 'askmed-channel-daily-2026-09-19_10-11.sql');

function fakeD1({ seed = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(root, 'd1', 'migrations');
  for (const file of fs.readdirSync(dir).sort()) sqlite.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (seed) sqlite.exec(fs.readFileSync(SEED, 'utf8'));
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    all: async () => ({ results: sqlite.prepare(sql).all(...params), meta: { changes: 0 } }),
  });
  return { sqlite, prepare: (sql) => statement(sql), batch: async (list) => Promise.all(list.map((s) => s.all())) };
}

function harness({ seed = false, fetch } = {}) {
  const d1 = fakeD1({ seed });
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const env = {
    ASC_SALES_KEY_ID: 'TESTKEY', ASC_SALES_ISSUER_ID: 'issuer', ASC_VENDOR_NUMBER: '1',
    ASC_SALES_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, {
      module, exports: module.exports, process: { env }, console: { error() {}, log() {} },
      URL, Date, Map, Set, Buffer, Intl, JSON, Number, String, Boolean, Array, Object, Math, Promise, Error,
      fetch: fetch || (async () => { throw new Error('no network in tests'); }),
      require(name) {
        if (name === '@opennextjs/cloudflare') return { getCloudflareContext: () => ({ env: { DB: d1 } }) };
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
        if (name.startsWith('node:')) return require(name);
        throw new Error('Unexpected import ' + name);
      },
    }, { filename: file });
    Object.assign(cache.get(file), module.exports);
    return module.exports;
  }
  return { channels: load('lib/appstore/channels.ts'), d1 };
}

// Expected Apple columns (third-party docs; verify against the first real file).
const HEADER = ['Date', 'App Name', 'App Apple Identifier', 'Purchase Type', 'Content Name', 'Source Type',
  'Source Info', 'Page Type', 'Territory', 'Purchases', 'Proceeds in USD', 'Sales in USD', 'Paying Users'];
const row = (date, source, sales, appId = '6776077826', proceeds = sales * 0.85) =>
  [date, 'AskMed', appId, 'Auto-Renewable Subscription', 'Weekly', source, '', 'Product Page', 'VN', '1', String(proceeds), String(sales), '1'].join('\t');
const FIXTURE = [
  HEADER.join('\t'),
  row('2026-10-12', 'App Referrer', 100),
  row('2026-10-12', 'App Referrer', 50),
  row('2026-10-12', 'Web Referrer', 10),
  row('2026-10-12', 'App Store Search', 30),
  row('2026-10-12', 'App Store Browse', 10),
  row('2026-10-12', 'Unavailable', 20),
  row('2026-10-12', 'Institutional Purchase', 5),
  row('2026-10-12', 'App Clip', 7),
  row('2026-10-12', 'App Store Search', -15),
  row('2026-10-12', 'App Referrer', 999, '6760000000'), // another app
  row('2026-10-13', 'App Referrer', 0),
].join('\n');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('parser sums Sales in USD by Apple date and source type for AskMed only', () => {
  const { channels } = harness();
  const days = channels.parsePurchasesReport(FIXTURE);
  assert.deepEqual(Object.keys(days), ['2026-10-12']);
  assert.deepEqual(days['2026-10-12'], {
    app_referrer_usd: 150, web_referrer_usd: 10, app_store_search_usd: 15, app_store_browse_usd: 10,
    institutional_usd: 5, unavailable_usd: 20, other_usd: 7,
  });
});

test('parser finds columns by name regardless of case, spacing and order; falls back to proceeds', () => {
  const { channels } = harness();
  const tsv = [
    ['﻿source_type', 'PROCEEDS IN USD', ' date '].join('\t'),
    ['app referrer', '1,234.50', '10/11/2026'].join('\t'),
    ['APP STORE BROWSE', '$5', '20261011'].join('\t'),
  ].join('\r\n');
  assert.deepEqual(channels.parsePurchasesReport(tsv), {
    '2026-10-11': { app_referrer_usd: 1234.5, web_referrer_usd: 0, app_store_search_usd: 0, app_store_browse_usd: 5,
      institutional_usd: 0, unavailable_usd: 0, other_usd: 0 },
  });
  assert.throws(() => channels.parsePurchasesReport('Date\tTerritory\n2026-10-11\tVN'), /Unexpected App Store Purchases report columns/);
});

// Real AskMed sales by source (App Store Connect website, USD, Apple dates).
const REAL = `2026-09-19,16,149,0,0,0,0
2026-09-20,314,0,18,0,0,0
2026-09-21,93,0,0,0,0,0
2026-09-22,339,157,15,0,0,15
2026-09-23,1015,130,190,0,0,0
2026-09-24,1224,0,173,0,159,130
2026-09-25,549,0,518,0,0,0
2026-09-26,1466,15,338,0,0,-11
2026-09-27,847,0,31,0,0,0
2026-09-28,595,130,15,0,0,0
2026-09-29,755,189,203,0,0,0
2026-09-30,773,0,315,0,24,0
2026-10-01,405,-151,173,0,0,0
2026-10-02,1401,0,70,0,0,0
2026-10-03,1098,0,45,0,0,0
2026-10-04,1566,0,56,0,130,0
2026-10-05,1172,0,276,0,0,0
2026-10-06,576,18,272,0,0,0
2026-10-07,373,0,173,0,130,0
2026-10-08,294,0,0,0,0,0
2026-10-09,871,0,59,0,-15,0
2026-10-10,525,136,196,0,0,0
2026-10-11,2538,147,180,0,143,0`.split('\n').map((line) => {
  const [date, appRef, browse, search, institutional, unavailable, webRef] = line.split(',');
  return {
    date, app_referrer_usd: +appRef, web_referrer_usd: +webRef, app_store_search_usd: +search,
    app_store_browse_usd: +browse, institutional_usd: +institutional, unavailable_usd: +unavailable, other_usd: 0,
  };
});

test('split uses each day\'s Meta share; Unavailable/Institutional follow it; totals stay exact', () => {
  const { channels } = harness();
  const points = [
    { date: '2026-09-24', revenue: 1000 }, // unavailable 159 does not change the share
    { date: '2026-09-26', revenue: 500 },  // web referrer refund -11
    { date: '2026-10-01', revenue: 300 },  // browse refund -151
    { date: '2026-10-08', revenue: 250 },  // Meta only
    { date: '2026-10-11', revenue: 2865.4 },
  ];
  const split = channels.splitAskMedRevenue(points, REAL);
  const share = { '2026-09-24': 1354 / 1527, '2026-09-26': 1455 / 1808, '2026-10-01': 405 / 427, '2026-10-08': 1, '2026-10-11': 2538 / 2865 };
  for (const point of points) {
    const day = split[point.date];
    assert.equal(day.estimated, false);
    close(day.meta_share, share[point.date]);
    close(day.meta, point.revenue * share[point.date]);
    close(day.meta + day.organic, point.revenue);
  }
  close(channels.metaShareOf({ ...REAL[0], unavailable_usd: 500, institutional_usd: 70 }), 16 / 165);
});

test('days without Apple data use the trailing 7 saved days and are marked estimated', () => {
  const { channels } = harness();
  const last7 = REAL.slice(-7); // 10/05-10/11
  const meta = last7.reduce((s, d) => s + d.app_referrer_usd + d.web_referrer_usd, 0);
  const organic = last7.reduce((s, d) => s + d.app_store_search_usd + d.app_store_browse_usd, 0);
  // 10/10 saved with only Unavailable sales: no own ratio, so it is estimated too.
  const stored = [...REAL.filter((d) => d.date !== '2026-10-10'),
    { ...REAL[0], date: '2026-10-10', app_referrer_usd: 0, app_store_browse_usd: 0, unavailable_usd: 99 }];
  const split = channels.splitAskMedRevenue([
    { date: '2026-09-10', revenue: 0 },
    { date: '2026-10-10', revenue: 100 },
    { date: '2026-10-11', revenue: 100 },
    { date: '2026-10-12', revenue: 400 },
    { date: '2026-10-13', revenue: 200 },
  ], stored);
  const trailingNo1010 = stored.filter((d) => d.date >= '2026-10-04' && d.date <= '2026-10-11' && d.date !== '2026-10-10');
  const sum = (list, keys) => list.reduce((s, d) => s + keys.reduce((t, k) => t + d[k], 0), 0);
  const metaKeys = ['app_referrer_usd', 'web_referrer_usd'];
  const allKeys = [...metaKeys, 'app_store_search_usd', 'app_store_browse_usd'];
  close(split['2026-10-12'].meta_share, sum(trailingNo1010, metaKeys) / sum(trailingNo1010, allKeys));
  assert.equal(split['2026-10-12'].estimated, true);
  assert.equal(split['2026-10-13'].estimated, true);
  close(split['2026-10-12'].meta + split['2026-10-12'].organic, 400);
  assert.equal(split['2026-10-10'].estimated, true);
  assert.equal(split['2026-10-11'].estimated, false);
  // Before Apple's history: its first saved week.
  assert.equal(split['2026-09-10'].estimated, true);
  // Same window on the untouched real data.
  const real = channels.splitAskMedRevenue([{ date: '2026-10-12', revenue: 1 }], REAL)['2026-10-12'];
  close(real.meta_share, meta / (meta + organic));
});

test('no usable Apple data keeps AskMed as one segment', () => {
  const { channels } = harness();
  assert.equal(channels.splitAskMedRevenue([{ date: '2026-10-11', revenue: 10 }], []), null);
  assert.equal(channels.splitAskMedRevenue([{ date: '2026-10-11', revenue: 10 }],
    [{ ...REAL[0], app_referrer_usd: 0, app_store_browse_usd: 0, unavailable_usd: 5 }]), null);
});

test('seed loads the website data and is never applied over saved rows', async () => {
  const { channels, d1 } = harness({ seed: true });
  d1.sqlite.exec(fs.readFileSync(SEED, 'utf8'));
  const days = await channels.readAskMedChannelDays('2026-09-01');
  assert.equal(days.length, 23);
  assert.deepEqual(days, REAL);
});

test('sync reads each new daily file once and never overwrites saved days', async () => {
  const calls = [];
  const gz = (lines) => zlib.gzipSync([HEADER.join('\t'), ...lines].join('\n'));
  const files = {
    'https://files.test/snap-1011': gz([row('2026-10-11', 'App Referrer', 1)]), // seeded day: kept as is
    'https://files.test/snap-1012': gz([row('2026-10-12', 'App Referrer', 80), row('2026-10-12', 'App Store Search', 20)]),
    'https://files.test/ongoing-1013': gz([row('2026-10-13', 'Web Referrer', 30), row('2026-10-13', 'App Store Browse', 10)]),
  };
  const api = {
    '/v1/analyticsReportRequests/f0f20834-da2e-4469-b9d0-dbf497410c9f/reports': [{ id: 'r-snap', attributes: { name: 'App Store Purchases Standard' } }],
    '/v1/analyticsReportRequests/8114e534-d05c-4c82-b814-3a6395fcd6a0/reports': [{ id: 'r-on', attributes: { name: 'App Store Purchases Standard' } }],
    '/v1/analyticsReports/r-snap/instances': [
      { id: 'i-1011', attributes: { granularity: 'DAILY', processingDate: '2026-10-11' } },
      { id: 'i-1012', attributes: { granularity: 'DAILY', processingDate: '2026-10-12' } },
    ],
    '/v1/analyticsReports/r-on/instances': [
      { id: 'i-1013', attributes: { granularity: 'DAILY', processingDate: '2026-10-13' } },
      { id: 'i-1014', attributes: { granularity: 'DAILY', processingDate: '2026-10-14' } }, // no file yet
      { id: 'i-old', attributes: { granularity: 'DAILY', processingDate: '2026-08-01' } },  // outside 35 days
    ],
    '/v1/analyticsReportInstances/i-1011/segments': [{ id: 's1', attributes: { url: 'https://files.test/snap-1011' } }],
    '/v1/analyticsReportInstances/i-1012/segments': [{ id: 's2', attributes: { url: 'https://files.test/snap-1012' } }],
    '/v1/analyticsReportInstances/i-1013/segments': [{ id: 's3', attributes: { url: 'https://files.test/ongoing-1013' } }],
    '/v1/analyticsReportInstances/i-1014/segments': [],
  };
  const fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.host === 'files.test') {
      assert.equal(init?.headers?.Authorization, undefined);
      return new Response(files[url.href]);
    }
    assert.match(init.headers.Authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    if (url.pathname.endsWith('/reports')) assert.equal(url.searchParams.get('filter[name]'), 'App Store Purchases Standard');
    if (url.pathname.endsWith('/instances')) assert.equal(url.searchParams.get('filter[granularity]'), 'DAILY');
    if (!(url.pathname in api)) return new Response('{}', { status: 404 });
    return Response.json({ data: api[url.pathname], links: {} });
  };
  const { channels } = harness({ seed: true, fetch });
  const first = await channels.syncAskMedChannels(new Date('2026-10-14T03:00:00Z'));
  assert.deepEqual(first, { instances_read: 3, instances_pending: 1, saved_dates: ['2026-10-12', '2026-10-13'], missing_reports: [] });
  const days = await channels.readAskMedChannelDays('2026-10-11');
  assert.deepEqual(days.map((d) => [d.date, d.app_referrer_usd, d.web_referrer_usd, d.app_store_search_usd, d.app_store_browse_usd]), [
    ['2026-10-11', 2538, 0, 180, 147],
    ['2026-10-12', 80, 0, 20, 0],
    ['2026-10-13', 0, 30, 0, 10],
  ]);
  assert.ok(!calls.includes('/v1/analyticsReportInstances/i-old/segments'));

  calls.length = 0;
  const second = await channels.syncAskMedChannels(new Date('2026-10-14T03:00:00Z'));
  assert.deepEqual(second, { instances_read: 0, instances_pending: 1, saved_dates: [], missing_reports: [] });
  assert.ok(!calls.some((p) => p.startsWith('/snap') || p.startsWith('/ongoing')));
  assert.deepEqual(calls.filter((p) => p.endsWith('/segments')), ['/v1/analyticsReportInstances/i-1014/segments']);
});
