const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const records = new Map(), writes = [];
  let failWrite = false, failRead = false, fetchCalls = 0;
  const supabase = { from() {
    const filters = []; let value, operation;
    const q = {
      select() { return this; }, eq(k,v) { filters.push(r => r[k] === v); return this; },
      in(k,v) { filters.push(r => v.includes(r[k])); return this; },
      gte() { return this; }, lt() { return this; }, order() { return this; }, range() { return this; },
      update(v) { value = v; operation = 'update'; return this; },
      insert(v) { value = v; operation = 'insert'; return this; },
      upsert(v) { value = v; operation = 'upsert'; return this; },
      async execute(single = false) {
        if (operation) {
          if (failWrite) return { data: null, error: { message: 'offline' } };
          const rows = Array.isArray(value) ? value : [value];
          if (operation === 'insert' && records.has(value.id)) return { error: { message: 'duplicate' } };
          if (operation === 'update' && !filters.every(f => f(records.get(value.id)))) return { data: [], error: null };
          rows.forEach(r => records.set(r.id, r)); writes.push(rows);
          return { data: rows, error: null };
        }
        if (failRead) return { data: null, error: { message: 'offline' } };
        const rows = [...records.values()].filter(r => filters.every(f => f(r)));
        return { data: single ? rows[0] || null : rows, error: null };
      },
      maybeSingle() { return this.execute(true); }, single() { return this.execute(true); },
      then(resolve,reject) { return this.execute().then(resolve,reject); },
    }; return q;
  }};
  const modules = new Map();
  const h = { records, writes, failWrite(v) { failWrite=v; }, failRead(v) { failRead=v; }, fetchCalls: () => fetchCalls,
    fetch: async () => ({ ok: false, status: 503, headers: new Headers(), text: async () => 'unavailable' }) };
  function load(relative, extras = '') {
    if (modules.has(relative)) return modules.get(relative);
    const file = path.resolve(__dirname,'..',relative), module = {exports:{}};
    const source = ts.transpileModule(fs.readFileSync(file,'utf8')+extras,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(source, { module,exports:module.exports,console,URL,Date,Map,Set,AbortSignal,
      setTimeout: fn => { fn(); }, process:{env:{CRON_SECRET:'secret',REVENUECAT_ASKMED_API_KEY:'fake',REVENUECAT_ASKMED_PROJECT_ID:'ask'}},
      fetch: async (...args) => { fetchCalls++; return h.fetch(...args); },
      require(name) {
        if(name==='@/lib/supabase') return {supabase};
        if(name==='next/server') return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
        if(name==='@/lib/meta/ads'||name==='@/lib/openrouter/costs') return {};
        if(name.startsWith('@/')) return load(name.slice(2)+'.ts');
        throw Error(name);
      }
    }, {filename:file}); modules.set(relative,module.exports); return module.exports;
  }
  h.load = load;
  return h;
}
const snapshot = () => ({today_vn:'2026-10-01',per_app:{AskMed:{today_revenue:17}},transactions:[],ads:{spend_usd:25},
  profit:{apple_commission_rate:.15,total_profit:7,daily_refund_cost:0},
  daily:['2026-09-30','2026-10-01'].map(date=>({date,revenue:100,purchase_revenue:100,profit:0,new_subs:2,
    adspend_with_vat:20,cost_per_sub:10,openrouter_cost:3,higgsfield_cost:2,revenuecat_cost:0,
    refund_amount:0,refund_source_amount:0,refund_count:0,refund_reversed_amount:0,refund_source_reversed_amount:0,refund_reversed_count:0}))});
const correction = (date='2026-09-30',revenue=996.327) => ({date,revenue,new_subs:15,refund_source_amount:10,refund_count:1,refund_source_reversed_amount:0,refund_reversed_count:0});

test('1 AM Vietnam run targets the completed prior day, including month/year boundaries',()=>{
  const {previousVnDates}=harness().load('lib/revenuecat/reconciliation.ts');
  assert.equal(previousVnDates(1,new Date('2026-09-30T18:00:00Z'))[0],'2026-09-30');
  assert.equal(previousVnDates(1,new Date('2026-12-31T18:00:00Z'))[0],'2026-12-31');
  assert.equal(previousVnDates(30,new Date('2026-09-30T18:00:00Z')).length,30);
  const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../vercel.json')));
  const jobs=config.crons.filter(c=>c.path.includes('revenuecat'));
  assert.equal(jobs.length,2);
  assert.ok(jobs.every(j=>j.schedule==='0 18 * * *'&&j.path.includes('reconcile=1')&&!j.path.includes('fast=1')));
});

test('corrections preserve today, provider costs and inputs; recompute historical profit/refunds',()=>{
  const {overlayReconciledDays}=harness().load('lib/revenuecat/reconciliation.ts');
  const input=snapshot(), before=JSON.stringify(input);
  const out=overlayReconciledDays(input,[correction(),correction('2026-10-01',99999)]);
  assert.equal(JSON.stringify(input),before);
  assert.equal(out.daily[0].revenue,996.327);
  assert.equal(out.daily[1].revenue,100);
  assert.equal(out.daily[0].new_subs,15);
  assert.equal(out.daily[0].cost_per_sub,20/15);
  assert.equal(out.daily[0].refund_amount,5);
  assert.equal(out.daily[0].profit,(996.327-5)*.85-20-3-2);
  assert.equal(out.profit.total_profit,out.daily[1].profit);
  assert.equal(out.ads,input.ads);
  assert.equal(out.per_app,input.per_app);
  assert.equal(out.daily[0].adspend_with_vat,20);
  assert.equal(out.daily[0].openrouter_cost,3);
  assert.equal(out.daily[0].higgsfield_cost,2);
});

test('zero revenue is a valid complete correction, not an error fallback',()=>{
  const {overlayReconciledDays}=harness().load('lib/revenuecat/reconciliation.ts');
  assert.equal(overlayReconciledDays(snapshot(),[correction('2026-09-30',0)]).daily[0].revenue,0);
});

test('publish complete batch atomically; duplicate run skips; a failure preserves corrected days',async()=>{
  const h=harness(),api=h.load('lib/revenuecat/reconciliation.ts');
  const run=await api.beginReconciliation('AskMed',['2026-09-30']);
  await assert.rejects(api.beginReconciliation('AskMed',['2026-09-30']),/already running/);
  await assert.rejects(api.finishReconciliation('AskMed',run,[]),/Incomplete/);
  await api.finishReconciliation('AskMed',run,[correction()]);
  assert.equal(h.writes.at(-1).length,2,'day and completion marker in same statement');
  assert.equal(await api.beginReconciliation('AskMed',['2026-09-30']),null);
  const preserved=JSON.stringify(h.records.get('__rc_reconciled_day__:AskMed:2026-09-30'));
  const next=await api.beginReconciliation('AskMed',['2026-09-29','2026-09-30']);
  await api.finishReconciliation('AskMed',next,null);
  assert.equal(JSON.stringify(h.records.get('__rc_reconciled_day__:AskMed:2026-09-30')),preserved);
  const out=await api.withReconciliation(snapshot(),'AskMed');
  assert.equal(out.daily[0].revenue,996.327);
  assert.match(out.reconciliation_warning,/incomplete/);
});

test('database failures never claim a successful correction or replace numbers with zeros',async()=>{
  const h=harness(),api=h.load('lib/revenuecat/reconciliation.ts');
  const run=await api.beginReconciliation('AskMed',['2026-09-30']);
  h.failWrite(true);
  await assert.rejects(api.finishReconciliation('AskMed',run,[correction()]),/Cannot save/);
  h.failRead(true);
  const out=await api.withReconciliation(snapshot(),'AskMed');
  assert.equal(out.daily[0].revenue,100);
  assert.match(out.reconciliation_warning,/unavailable/);
});

test('maintenance requires authentication and valid app/duration before source reads',async()=>{
  const h=harness(),{GET}=h.load('app/api/revenuecat/route.ts');
  const request=(query,auth)=>({url:'https://test/api/revenuecat?'+query,nextUrl:new URL('https://test/api/revenuecat?'+query),headers:new Headers(auth?{authorization:'Bearer secret'}:{})});
  assert.equal((await GET(request('type=today_stats&app=AskMed&reconcile=1'))).status,401);
  assert.equal((await GET(request('type=today_stats&app=AskMed&reconcile=1&days=7',true))).status,400);
  assert.equal((await GET(request('type=today_stats&app=Roomy%20AI&reconcile=1',true))).status,400);
  assert.equal(h.fetchCalls(),0);
});

test('source pagination is complete and invalid payloads fail instead of looking like zero sales',async()=>{
  const h=harness();let calls=0;
  h.fetch=async()=>({ok:true,json:async()=>++calls===1?{items:[{id:'one'}],next_page:'/v2/next'}:{items:[{id:'two'}],next_page:null}});
  const api=h.load('app/api/revenuecat/route.ts','\nexports.testHelpers={fetchRcList};');
  const result=await api.testHelpers.fetchRcList('fake','https://api.revenuecat.com/v2/test');
  assert.equal(result.length,2);
  assert.equal(result[1].id,'two');
  assert.equal(calls,2);
  h.fetch=async()=>({ok:true,json:async()=>({})});
  await assert.rejects(api.testHelpers.fetchRcList('fake','https://api.revenuecat.com/v2/test'));
});

test('purchase identity deduplicates aliases, sandbox events stay out, and strict 404 fails',async()=>{
  const h=harness();
  const at=Date.parse('2026-09-30T10:00:00Z');
  h.fetch=async()=>({ok:true,json:async()=>({items:[
    {id:'event-one',type:'PURCHASES_INITIAL_PURCHASE',body:{transaction_id:'store-1',price:20,product_id:'monthly',purchased_at_ms:at}},
    {id:'sandbox',type:'PURCHASES_INITIAL_PURCHASE',body:{transaction_id:'store-2',environment:'sandbox',price:99,purchased_at_ms:at}},
  ],next_page:null})});
  const {testHelpers}=h.load('app/api/revenuecat/route.ts','\nexports.testHelpers={fetchCustomerTransactionEvents};');
  const project={name:'AskMed',projectId:'test',apiKey:'fake'};
  const a=await testHelpers.fetchCustomerTransactionEvents(project,{userId:'a',country:'US'},at-1,at+1,true);
  const b=await testHelpers.fetchCustomerTransactionEvents(project,{userId:'b',country:'US'},at-1,at+1,true);
  assert.equal(a.events.length,1);
  assert.equal(a.events[0].id,b.events[0].id);
  h.fetch=async()=>({ok:false,status:404,text:async()=>'',headers:new Headers()});
  await assert.rejects(testHelpers.fetchCustomerTransactionEvents(project,{userId:'a',country:'US'},at-1,at+1,true));
});
