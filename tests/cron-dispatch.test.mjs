// Cloudflare Cron Triggers must call the same routes, with the same header,
// as the Vercel crons they replace.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CRON_JOBS, runCronJobs } from "../cloudflare/cron.ts";

const strip = (s) => s.replace(/\/\/.*$/gm, "");
const wrangler = JSON.parse(strip(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")));
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("every Vercel cron has the same path at the same schedule", () => {
  const fromVercel = vercel.crons.map((c) => `${c.schedule} ${c.path}`).sort();
  const fromCloudflare = Object.entries(CRON_JOBS).flatMap(([cron, paths]) => paths.map((p) => `${cron} ${p}`)).sort();
  assert.deepEqual(fromCloudflare, fromVercel);
});

test("wrangler triggers match the job table", () => {
  assert.deepEqual([...wrangler.triggers.crons].sort(), Object.keys(CRON_JOBS).sort());
});

test("jobs are GETs with the Vercel bearer header", async () => {
  const seen = [];
  const results = await runCronJobs("0 18 * * *", async (req) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.get("authorization") });
    return new Response("{}", { status: 200 });
  }, "s3cret");
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.ok));
  for (const s of seen) {
    assert.equal(s.method, "GET");
    assert.equal(s.auth, "Bearer s3cret");
  }
  assert.deepEqual(seen.map((s) => new URL(s.url).search).sort(), [
    "?type=today_stats&app=AskMed&reconcile=1",
    "?type=today_stats&app=GrailScan&reconcile=1",
  ]);
});

test("no secret means no header, and failures are reported", async () => {
  const results = await runCronJobs("0 0 * * *", async (req) => {
    assert.equal(req.headers.get("authorization"), null);
    return new Response('{"error":"Unauthorized"}', { status: 401 });
  }, undefined);
  assert.deepEqual(results.map((r) => [r.path, r.status, r.ok]), [["/api/cron/pull-metrics", 401, false]]);
  await assert.rejects(runCronJobs("1 2 * * *", async () => new Response(""), "x"));
});
