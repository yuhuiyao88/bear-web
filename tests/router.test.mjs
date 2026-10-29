// Unit tests for the model router. Run with: node --test tests/router.test.mjs
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { enabledModels, resetLocalTracker, route } from "../worker/src/router.js";
import { UsageTracker, dayKey, nextReset } from "../worker/src/usage.js";

const POOL = [
  { id: "a", provider: "gemini", model: "gem-a", key: "GEMINI_API_KEY", plots: true, weight: 1, limits: { rpm: 2, rpd: 3 }, dayReset: "America/Los_Angeles" },
  { id: "b", provider: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "oss", key: "GROQ_API_KEY", weight: 0.8, limits: { rpm: 30, rpd: 1000, tpm: 8000 }, dayReset: "UTC" },
];
const IDS = ["a", "b"];
const T0 = Date.parse("2026-10-29T19:00:00Z"); // 12:00 in Los Angeles

test("prefers the model with the most weighted headroom, then spreads load", () => {
  const t = new UsageTracker(POOL);
  // a: 1 x min(1/2, 2/3) = 0.5; b: 0.8 x (8000 - 5000) / 8000 = 0.3
  assert.equal(t.pick(IDS, 5000, [], T0).id, "a");
  // a would use its last request this minute (score 0), so b gets the next one
  assert.equal(t.pick(IDS, 5000, [], T0).id, "b");
  // b is out of tokens for the minute, so a's last request goes, then nothing is left
  assert.equal(t.pick(IDS, 5000, [], T0).id, "a");
  assert.equal(t.pick(IDS, 5000, [], T0).id, null);
  // a minute later a is down to its last request of the day, so b scores higher
  assert.equal(t.pick(IDS, 5000, [], T0 + 61_000).id, "b");
});

test("respects the daily limit and resets at midnight in the model's time zone", () => {
  const t = new UsageTracker(POOL);
  for (let i = 0; i < 3; i++) assert.equal(t.pick(["a"], 100, [], T0 + i * 61_000).id, "a");
  assert.equal(t.pick(["a"], 100, [], T0 + 4 * 61_000).id, null);
  const midnightLA = Date.parse("2026-10-30T07:00:00Z");
  assert.equal(t.pick(["a"], 100, [], midnightLA - 60_000).id, null);
  assert.equal(t.pick(["a"], 100, [], midnightLA).id, "a");
});

test("a daily 429 sidelines the model until its reset; a minute 429 for retry-after", () => {
  const t = new UsageTracker(POOL);
  t.pick(IDS, 100, [], T0);
  t.report("a", { ok: false, status: 429, dailyExhausted: true }, T0);
  assert.equal(t.snapshot(["a"], T0)[0].cooldownReason, "daily limit");
  assert.equal(t.pick(["a"], 100, [], T0 + 3600_000).id, null);
  assert.equal(t.pick(["a"], 100, [], Date.parse("2026-10-30T07:00:00Z")).id, "a");

  t.report("b", { ok: false, status: 429, retryAfterMs: 5000 }, T0);
  assert.equal(t.pick(["b"], 100, [], T0 + 4000).id, null);
  assert.equal(t.pick(["b"], 100, [], T0 + 5000).id, "b");
});

test("failures back off exponentially and a success clears them", () => {
  const t = new UsageTracker(POOL);
  t.report("b", { ok: false, status: 503 }, T0);
  assert.equal(t.snapshot(["b"], T0)[0].coolingDownFor, 10);
  t.report("b", { ok: false, status: 504 }, T0);
  assert.equal(t.snapshot(["b"], T0)[0].coolingDownFor, 20);
  t.report("b", { ok: false, status: 401 }, T0);
  assert.equal(t.snapshot(["b"], T0)[0].cooldownReason, "request rejected");
  t.report("b", { ok: true, latencyMs: 1000 }, T0);
  const s = t.snapshot(["b"], T0)[0];
  assert.equal(s.failuresInARow, 0);
  assert.equal(s.coolingDownFor, 0);
  assert.equal(s.avgReplyMs, 1000);
});

test("syncs the daily count and token use from what the provider reports", () => {
  const t = new UsageTracker(POOL);
  t.pick(["b"], 5000, [], T0);
  t.report("b", { ok: true, tokens: 3000, estTokens: 5000, remainingDay: 900 }, T0);
  const s = t.snapshot(["b"], T0)[0];
  assert.equal(s.today.requests, 100);
  assert.equal(s.lastMinute.tokens, 3000);
});

test("nextReset finds midnight in the given time zone", () => {
  assert.equal(new Date(nextReset("America/Los_Angeles", T0)).toISOString(), "2026-10-30T07:00:00.000Z");
  assert.equal(new Date(nextReset("UTC", T0)).toISOString(), "2026-10-30T00:00:00.000Z");
  assert.equal(dayKey("America/Los_Angeles", Date.parse("2026-10-30T06:59:00Z")), "2026-10-29");
});

// --- route() with a fake fetch ---

const realFetch = globalThis.fetch;
let calls;
function fakeFetch(handlers) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const h = handlers[url.includes("groq") ? "b" : "a"];
    return h(body);
  };
}
const json = (status, obj, headers = {}) => new Response(JSON.stringify(obj), { status, headers });
const geminiOk = () => json(200, { candidates: [{ content: { parts: [{ text: "from gemini" }] } }] });
const groqOk = () => json(200, { choices: [{ message: { content: "<think>hmm</think>from groq" } }], usage: { total_tokens: 4000 } }, { "x-ratelimit-remaining-requests": "999" });
const env = { GEMINI_API_KEY: "g", GROQ_API_KEY: "q" };
const ROUTE_POOL = [{ ...POOL[0], limits: { rpm: 15, rpd: 1000 } }, POOL[1]];
const req = { system: "BE BEAR", contents: [{ role: "user", parts: [{ text: "What is a p-value?" }] }] };

beforeEach(() => {
  resetLocalTracker();
  globalThis.fetch = realFetch;
});

test("skips models whose key isn't set", () => {
  assert.deepEqual(enabledModels({ GEMINI_API_KEY: "g" }, POOL).map((m) => m.id), ["a"]);
});

test("falls back to the next model when the first is out of daily quota", async () => {
  fakeFetch({
    a: () => json(429, { error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }),
    b: groqOk,
  });
  const r = await route(env, req, { pool: ROUTE_POOL });
  assert.equal(r.ok, true);
  assert.equal(r.model, "b");
  assert.equal(r.text, "from groq");
  assert.deepEqual(r.attempts.map((x) => [x.id, x.status]), [["a", 429], ["b", 200]]);
  // The text-only model is told it can't draw plots; Gemini isn't.
  assert.equal(calls[0].body.systemInstruction.parts[0].text, "BE BEAR");
  assert.match(calls[1].body.messages[0].content, /code execution tool is not available/);

  // The next question goes straight to b: a stays sidelined for the day.
  const r2 = await route(env, req, { pool: ROUTE_POOL });
  assert.equal(r2.model, "b");
  assert.equal(calls.length, 3);
});

test("uses Gemini when it has room", async () => {
  fakeFetch({ a: geminiOk, b: groqOk });
  const r = await route(env, req, { pool: ROUTE_POOL });
  assert.equal(r.model, "a");
  assert.equal(r.text, "from gemini");
});

test("reports a rate limit only when every model is rate-limited", async () => {
  fakeFetch({ a: () => json(429, {}), b: () => json(429, {}, { "retry-after": "30" }) });
  const r = await route(env, req, { pool: ROUTE_POOL });
  assert.deepEqual([r.ok, r.reason], [false, "rate"]);
});

test("reports a timeout when a model times out and the rest fail", async () => {
  fakeFetch({
    a: () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); },
    b: () => json(500, {}),
  });
  const r = await route(env, req, { pool: ROUTE_POOL });
  assert.deepEqual([r.ok, r.reason], [false, "timeout"]);
  assert.deepEqual(r.attempts.map((x) => x.status), [504, 500]);
});
