const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load only the pure helper from lib/openrouter/askmed.ts.
function loadHelper() {
  const file = path.resolve(__dirname, '..', 'lib/openrouter/askmed.ts');
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, '');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports.dailyCostsFromUsage;
}

test('AskMed OpenRouter cost per UTC day comes from all-time usage differences', () => {
  const daily = loadHelper();
  const rows = [
    { day: '2026-10-12', usage: 52.0 },
    { day: '2026-10-13', usage: 53.5 },
    { day: '2026-10-15', usage: 56.0 }, // 10-14 had no snapshot
  ];
  const costs = daily(rows, ['2026-10-13', '2026-10-14', '2026-10-15']);
  assert.equal(costs['2026-10-13'], 1.5);
  assert.equal(costs['2026-10-14'], undefined);
  assert.equal(costs['2026-10-15'], 2.5);
});

test('first day without a baseline is skipped and a reset key never counts negative', () => {
  const daily = loadHelper();
  const costs = daily([{ day: '2026-10-13', usage: 10 }, { day: '2026-10-14', usage: 2 }], ['2026-10-13', '2026-10-14']);
  assert.equal(costs['2026-10-13'], undefined);
  assert.equal(costs['2026-10-14'], 0);
});
