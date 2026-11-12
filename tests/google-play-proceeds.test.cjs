const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const ts = require('typescript');

function harness(env = {}, fetchImpl) {
  const records = new Map();
  const supabase = { from() {
    let id, value;
    const q = {
      select() { return q; }, eq(k, v) { id = v; return q; },
      maybeSingle: async () => ({ data: records.get(id) || null, error: null }),
      upsert(v) { value = v; return q; },
      then(resolve, reject) {
        if (value) [value].flat().forEach(r => records.set(r.id, r));
        return Promise.resolve({ error: null }).then(resolve, reject);
      },
    };
    return q;
  }};
  const file = path.resolve(__dirname, '..', 'lib/googleplay/proceeds.ts');
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports, process: { env }, console: { error() {} }, URL, URLSearchParams, Date, Map, Set, Buffer, Intl,
    fetch: fetchImpl || (async () => { throw new Error('no network in tests'); }),
    require(name) {
      if (name === '@/lib/db') return { db: supabase };
      if (name.startsWith('node:')) return require(name);
      throw new Error('Unexpected import ' + name);
    },
  }, { filename: file });
  return { ...module.exports, records };
}

/** Minimal zip writer (one deflated entry), like Google's report zips. */
function zipOf(name, text) {
  const data = Buffer.from(text, 'utf8');
  const packed = zlib.deflateRawSync(data);
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const centralStart = 30 + nameBytes.length + packed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + nameBytes.length, 12); end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([local, nameBytes, packed, central, nameBytes, end]);
}

const EARNINGS_HEADER = 'Description,Transaction Date,Transaction Time,Tax Type,Transaction Type,Refund Type,Product Title,Product id,Product Type,Sku Id,Hardware,Buyer Country,Buyer State,Buyer Postal Code,Buyer Currency,Amount (Buyer Currency),Currency Conversion Rate,Merchant Currency,Amount (Merchant Currency)';
const SALES_HEADER = 'Order Number,Order Charged Date,Order Charged Timestamp,Financial Status,Device Model,Product Title,Product ID,Product Type,SKU ID,Currency of Sale,Item Price,Taxes Collected,Charged Amount,City of Buyer,State of Buyer,Postal Code of Buyer,Country of Buyer';
const RATES = { USD: 1, EUR: 0.5, VND: 25000 };

test('zip reader and CSV parser read quoted Play report fields', () => {
  const { unzipTexts, parseCsv } = harness();
  const [text] = unzipTexts(zipOf('salesreport_202611.csv', 'A,B\r\n"x, ""y""",2\r\n'));
  assert.equal(JSON.stringify(parseCsv(text)), JSON.stringify([{ A: 'x, "y"', B: '2' }]));
});

test('earnings: kept = charge + tax + Google fee per order, refunds and other apps left out', () => {
  const { parseEarnings, parseCsv } = harness();
  const rows = parseCsv([
    EARNINGS_HEADER,
    'GPA.1,"Nov 3, 2026",1:00:00 AM PST,,Charge,,AskMed Monthly,com.loopstudio.askmed,Subscription,monthly,,DE,,,EUR,24.99,,USD,30.00',
    'GPA.1,"Nov 3, 2026",1:00:00 AM PST,VAT,Tax,,AskMed Monthly,com.loopstudio.askmed,Subscription,monthly,,DE,,,EUR,-3.99,,USD,-4.79',
    'GPA.1,"Nov 3, 2026",1:00:00 AM PST,,Google fee,,AskMed Monthly,com.loopstudio.askmed,Subscription,monthly,,DE,,,EUR,-3.15,,USD,-3.78',
    'GPA.2,"Nov 3, 2026",2:00:00 AM PST,,Charge,,AskMed Monthly,com.loopstudio.askmed,Subscription,monthly,,US,,,USD,10.00,,USD,10.00',
    'GPA.2,"Nov 3, 2026",2:00:00 AM PST,,Google fee,,AskMed Monthly,com.loopstudio.askmed,Subscription,monthly,,US,,,USD,-1.50,,USD,-1.50',
    'GPA.3,"Nov 4, 2026",2:00:00 AM PST,,Charge refund,,AskMed Monthly,com.loopstudio.askmed,Subscription,monthly,,US,,,USD,-10.00,,USD,-10.00',
    'GPA.4,"Nov 4, 2026",2:00:00 AM PST,,Charge,,Other,com.other.app,Subscription,x,,US,,,USD,99.00,,USD,99.00',
  ].join('\n'));
  const days = parseEarnings(rows, 'com.loopstudio.askmed', RATES);
  assert.equal(Object.keys(days).join(), '2026-11-03');
  assert.ok(Math.abs(days['2026-11-03'].paid - 40) < 1e-9);
  assert.ok(Math.abs(days['2026-11-03'].kept - (30 - 4.79 - 3.78 + 10 - 1.5)) < 1e-9);
});

test('sales report: real taxes, Google fee 15% of the rest, only charged orders', () => {
  const { parseSales, parseCsv } = harness();
  const rows = parseCsv([
    SALES_HEADER,
    'GPA.1,2026-11-05,1,Charged,Pixel,AskMed,com.loopstudio.askmed,subscription,monthly,EUR,20.00,4.00,24.00,,,,DE',
    'GPA.2,2026-11-05,1,Refund,Pixel,AskMed,com.loopstudio.askmed,subscription,monthly,USD,10.00,0,10.00,,,,US',
    'GPA.3,2026-11-06,1,Charged,Pixel,AskMed,com.loopstudio.askmed,subscription,monthly,USD,"1,000.00",0,"1,000.00",,,,US',
  ].join('\n'));
  const days = parseSales(rows, 'com.loopstudio.askmed', RATES);
  assert.ok(Math.abs(days['2026-11-05'].paid - 48) < 1e-9); // 24 EUR at 0.5 EUR/USD
  assert.ok(Math.abs(days['2026-11-05'].kept - 20 * 0.85 / 0.5) < 1e-9);
  assert.ok(Math.abs(days['2026-11-06'].kept / days['2026-11-06'].paid - 0.85) < 1e-9);
});

test('end to end: signs in with the service account, earnings month wins over sales, trailing share per day', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { client_email: 'reports@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const files = {
    'earnings/earnings_202610_123-0.zip': zipOf('e.csv', [EARNINGS_HEADER,
      'GPA.1,"Oct 30, 2026",1,,Charge,,A,com.loopstudio.askmed,S,m,,US,,,USD,100,,USD,100',
      'GPA.1,"Oct 30, 2026",1,,Google fee,,A,com.loopstudio.askmed,S,m,,US,,,USD,-15,,USD,-15',
      'GPA.1,"Oct 30, 2026",1,VAT,Tax,,A,com.loopstudio.askmed,S,m,,US,,,USD,-5,,USD,-5'].join('\n')),
    'sales/salesreport_202610.zip': zipOf('s.csv', [SALES_HEADER,
      'GPA.9,2026-10-30,1,Charged,P,A,com.loopstudio.askmed,s,m,USD,1000,0,1000,,,,US'].join('\n')),
    'sales/salesreport_202611.zip': zipOf('s.csv', [SALES_HEADER,
      'GPA.2,2026-11-05,1,Charged,P,A,com.loopstudio.askmed,s,m,USD,100,0,100,,,,US'].join('\n')),
  };
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.hostname === 'oauth2.googleapis.com') {
      const assertion = new URLSearchParams(String(init.body)).get('assertion');
      const [h, p, sig] = assertion.split('.');
      assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), crypto.createPublicKey(privateKey), Buffer.from(sig, 'base64url')));
      assert.equal(JSON.parse(Buffer.from(p, 'base64url')).scope, 'https://www.googleapis.com/auth/devstorage.read_only');
      return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
    }
    if (url.hostname === 'open.er-api.com') return new Response(JSON.stringify({ rates: { VND: 26000 } }), { status: 200 });
    assert.equal(init.headers.Authorization, 'Bearer t');
    if (url.searchParams.get('alt') === 'media') {
      const name = decodeURIComponent(url.pathname.split('/o/')[1]);
      return new Response(files[name], { status: 200 });
    }
    const prefix = url.searchParams.get('prefix');
    return new Response(JSON.stringify({ items: Object.keys(files).filter(n => n.startsWith(prefix)).map(name => ({ name })) }), { status: 200 });
  };
  const mod = harness({ GOOGLE_PLAY_REPORTS_SERVICE_ACCOUNT: JSON.stringify(account) }, fetchImpl);
  const result = await mod.testHelpers.computePlayProceeds(new Date('2026-11-12T05:00:00Z'));
  assert.equal(result.source, 'google');
  assert.equal(result.earnings_months.join(), '202610');
  assert.equal(result.sales_through, '2026-11-05');
  // October uses the earnings report only (the sales report's $1,000 order is ignored).
  assert.ok(Math.abs(result.kept_share_by_date['2026-10-30'] - 0.80) < 1e-9);
  // 14-day window ending 11/05: (80 + 85) / 200.
  assert.ok(Math.abs(result.kept_share - 165 / 200) < 1e-9);
  assert.ok(Math.abs(result.kept_share_by_date['2026-11-12'] - 165 / 200) < 1e-9);
  assert.ok(!calls.some(p => p.includes('salesreport_202610.zip')));
});

test('not connected: 85% default, never throws', async () => {
  const mod = harness({});
  const result = await mod.getGooglePlayProceeds();
  assert.equal(result.source, 'default');
  assert.equal(result.kept_share, 0.85);
});
