// Sends each question to the model in the pool with the most spare capacity,
// and falls back to the next one if it's rate-limited, failing, or too slow.

import { POOL, TEXT_ONLY_NOTE } from "./models.js";
import { callModel } from "./providers.js";
import { UsageTracker } from "./usage.js";

const TOTAL_BUDGET_MS = 85_000; // the test scripts give up at 100 s
const ATTEMPT_TIMEOUT_MS = 60_000;
const MIN_ATTEMPT_MS = 10_000; // don't start an attempt with less time than this
const MAX_ATTEMPTS = 4;
const EXPECTED_REPLY_TOKENS = 800;

// Used when the shared Durable Object can't be reached (and in tests). It only
// sees this Worker instance's traffic, but keeps the fallbacks working.
let localTracker;

export function enabledModels(env, pool = POOL) {
  return pool.filter((m) => (m.provider === "workers-ai" ? !!env.AI : !!env[m.key]));
}

function sharedTracker(env, pool) {
  if (!localTracker) localTracker = new UsageTracker(pool);
  const local = {
    pick: async (...a) => localTracker.pick(...a),
    report: async (...a) => localTracker.report(...a),
    snapshot: async (...a) => localTracker.snapshot(...a),
  };
  if (!env.MODEL_USAGE) return local;
  const stub = env.MODEL_USAGE.get(env.MODEL_USAGE.idFromName("pool"));
  const withFallback = (name) => async (...a) => {
    try {
      return await stub[name](...a);
    } catch (err) {
      console.error("Usage tracker unavailable; using this instance's counts", err);
      return local[name](...a);
    }
  };
  return { pick: withFallback("pick"), report: withFallback("report"), snapshot: withFallback("snapshot") };
}

export function estimateTokens({ system, contents }) {
  const chars = system.length + contents.reduce((n, c) => n + c.parts.reduce((k, p) => k + (p.text || "").length, 0), 0);
  return Math.ceil(chars / 4) + EXPECTED_REPLY_TOKENS;
}

// req: { system, contents } with contents in Gemini's format.
// Returns { ok: true, model, text, images } or { ok: false, reason, attempts }
// where reason is "rate" (every model is at its limit), "timeout" or "error".
export async function route(env, req, { pool = POOL, now = () => Date.now() } = {}) {
  const models = enabledModels(env, pool);
  const ids = models.map((m) => m.id);
  const byId = new Map(models.map((m) => [m.id, m]));
  const tracker = sharedTracker(env, pool);
  const estTokens = estimateTokens(req);
  const deadline = now() + TOTAL_BUDGET_MS;
  const tried = [];
  const attempts = [];

  while (tried.length < MAX_ATTEMPTS) {
    const timeLeft = deadline - now();
    if (timeLeft < MIN_ATTEMPT_MS) break;
    const { id } = await tracker.pick(ids, estTokens, tried);
    if (!id) break;
    tried.push(id);
    const m = byId.get(id);
    const system = m.plots ? req.system : req.system + TEXT_ONLY_NOTE;
    const start = now();
    const result = await callModel(m, env, { ...req, system }, Math.min(ATTEMPT_TIMEOUT_MS, timeLeft));
    const latencyMs = now() - start;
    await tracker.report(id, { ...result, text: undefined, images: undefined, latencyMs, estTokens });
    attempts.push({ id, status: result.ok ? 200 : result.status, ms: latencyMs });
    if (result.ok) {
      if (tried.length > 1) console.log("Answered after fallback", JSON.stringify(attempts));
      return { ok: true, model: id, text: result.text, images: result.images, attempts };
    }
    console.error("Model failed, trying the next one", id, result.status, result.error);
  }

  const statuses = attempts.map((a) => a.status);
  const reason = !attempts.length || statuses.every((s) => s === 429) ? "rate" : statuses.includes(504) ? "timeout" : "error";
  console.error("No model could answer", reason, JSON.stringify(attempts));
  return { ok: false, reason, attempts };
}

export async function routerStatus(env, pool = POOL) {
  const ids = enabledModels(env, pool).map((m) => m.id);
  return {
    models: await sharedTracker(env, pool).snapshot(ids),
    notConfigured: pool.filter((m) => !ids.includes(m.id)).map((m) => ({ id: m.id, needs: m.key })),
  };
}

// For tests.
export function resetLocalTracker() {
  localTracker = undefined;
}
