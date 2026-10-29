// Keeps count of each model's recent requests and tokens against its limits,
// and of its health (failures in a row, cooldowns, reply time). Pure logic
// with no Cloudflare APIs, so it runs both inside the ModelUsage Durable Object
// (one shared copy for every Worker) and in tests.

const MINUTE = 60_000;
const MAX_COOLDOWN_MS = 10 * MINUTE;
const CONFIG_ERROR_COOLDOWN_MS = 30 * MINUTE; // bad key, unknown model, ...
const DEFAULT_429_COOLDOWN_MS = MINUTE;

export class UsageTracker {
  constructor(pool, state = {}) {
    this.pool = new Map(pool.map((m) => [m.id, m]));
    this.state = state;
  }

  model(id, now) {
    const m = this.pool.get(id);
    let s = this.state[id];
    if (!s) {
      s = this.state[id] = {
        reqs: [], toks: [], day: "", dayReqs: 0, dayToks: 0,
        cooldownUntil: 0, cooldownReason: "", fails: 0, latencyMs: null, lastOk: 0, lastError: "",
      };
    }
    // Forget anything older than a minute, and start a new day when it resets.
    s.reqs = s.reqs.filter((t) => now - t < MINUTE);
    s.toks = s.toks.filter(([t]) => now - t < MINUTE);
    const day = dayKey(m.dayReset, now);
    if (s.day !== day) {
      s.day = day;
      s.dayReqs = 0;
      s.dayToks = 0;
      if (s.cooldownReason === "daily limit") s.cooldownUntil = 0;
    }
    return s;
  }

  // Share of the model's tightest limit that would be left after one more
  // request of estTokens tokens: 1 = untouched, 0 = this request uses the last
  // of it, below 0 = over the limit.
  headroom(id, estTokens, now) {
    const { limits = {} } = this.pool.get(id);
    const s = this.model(id, now);
    const minuteToks = s.toks.reduce((sum, [, n]) => sum + n, 0);
    const shares = [];
    if (limits.rpm) shares.push((limits.rpm - s.reqs.length - 1) / limits.rpm);
    if (limits.rpd) shares.push((limits.rpd - s.dayReqs - 1) / limits.rpd);
    if (limits.tpm) shares.push((limits.tpm - minuteToks - estTokens) / limits.tpm);
    if (limits.tpd) shares.push((limits.tpd - s.dayToks - estTokens) / limits.tpd);
    return shares.length ? Math.min(...shares) : 1;
  }

  // Chooses the model with the best weight x headroom among `ids`, skipping
  // `exclude`, models cooling down, and models that would go over a limit.
  // Counts the request against the chosen model straight away, so requests
  // arriving at the same moment spread out instead of all picking one model.
  pick(ids, estTokens, exclude = [], now = Date.now()) {
    let best = null;
    for (const id of ids) {
      if (!this.pool.has(id) || exclude.includes(id)) continue;
      const s = this.model(id, now);
      if (s.cooldownUntil > now) continue;
      const room = this.headroom(id, estTokens, now);
      if (room < 0) continue;
      const score = (this.pool.get(id).weight ?? 1) * room;
      const latency = s.latencyMs ?? 0;
      if (!best || score > best.score || (score === best.score && latency < best.latency)) {
        best = { id, score, latency };
      }
    }
    if (!best) return { id: null };
    const s = this.model(best.id, now);
    s.reqs.push(now);
    s.toks.push([now, estTokens]);
    s.dayReqs += 1;
    s.dayToks += estTokens;
    return { id: best.id };
  }

  // Records how a request picked above went.
  //   ok, status, latencyMs, tokens (actual total), estTokens (as passed to pick),
  //   retryAfterMs, dailyExhausted, remainingDay (requests left today, if the
  //   provider says), error (short text for the status page)
  report(id, outcome, now = Date.now()) {
    if (!this.pool.has(id)) return;
    const s = this.model(id, now);
    if (outcome.tokens != null && outcome.estTokens != null) {
      const diff = outcome.tokens - outcome.estTokens;
      s.toks.push([now, diff]);
      s.dayToks = Math.max(0, s.dayToks + diff);
    }
    const { limits = {} } = this.pool.get(id);
    if (limits.rpd && Number.isFinite(outcome.remainingDay)) {
      s.dayReqs = Math.max(0, limits.rpd - outcome.remainingDay);
    }

    if (outcome.ok) {
      s.fails = 0;
      s.lastOk = now;
      s.cooldownUntil = 0;
      s.cooldownReason = "";
      if (outcome.latencyMs != null) {
        s.latencyMs = s.latencyMs == null ? outcome.latencyMs : Math.round(0.7 * s.latencyMs + 0.3 * outcome.latencyMs);
      }
      return;
    }

    s.lastError = outcome.error || `HTTP ${outcome.status}`;
    if (outcome.status === 429) {
      // Rate limits are about capacity, not health, so they don't count as failures.
      if (outcome.dailyExhausted) {
        s.cooldownUntil = nextReset(this.pool.get(id).dayReset, now);
        s.cooldownReason = "daily limit";
      } else {
        s.cooldownUntil = now + (outcome.retryAfterMs || DEFAULT_429_COOLDOWN_MS);
        s.cooldownReason = "rate limit";
      }
      return;
    }
    s.fails += 1;
    if (outcome.status >= 400 && outcome.status < 500 && outcome.status !== 408) {
      s.cooldownUntil = now + CONFIG_ERROR_COOLDOWN_MS;
      s.cooldownReason = "request rejected";
    } else {
      // Timeouts, network errors and 5xx: back off 10 s, 20 s, 40 s, ... up to 10 min.
      s.cooldownUntil = now + Math.min(10_000 * 2 ** (s.fails - 1), MAX_COOLDOWN_MS);
      s.cooldownReason = "unhealthy";
    }
  }

  snapshot(ids, now = Date.now()) {
    return ids.filter((id) => this.pool.has(id)).map((id) => {
      const m = this.pool.get(id);
      const s = this.model(id, now);
      return {
        id,
        model: m.model,
        limits: m.limits || {},
        lastMinute: { requests: s.reqs.length, tokens: Math.max(0, s.toks.reduce((sum, [, n]) => sum + n, 0)) },
        today: { requests: s.dayReqs, tokens: s.dayToks },
        headroom: Math.round(Math.max(0, this.headroom(id, 0, now)) * 100) / 100,
        coolingDownFor: s.cooldownUntil > now ? Math.ceil((s.cooldownUntil - now) / 1000) : 0,
        cooldownReason: s.cooldownUntil > now ? s.cooldownReason : "",
        failuresInARow: s.fails,
        avgReplyMs: s.latencyMs,
        lastOk: s.lastOk ? new Date(s.lastOk).toISOString() : null,
        lastError: s.lastError,
      };
    });
  }
}

const formatters = new Map();
export function dayKey(timeZone = "UTC", now = Date.now()) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f.format(new Date(now));
}

// The first minute at which dayKey changes, i.e. midnight in that time zone.
export function nextReset(timeZone = "UTC", now = Date.now()) {
  const today = dayKey(timeZone, now);
  let t = Math.floor(now / MINUTE) * MINUTE;
  while (dayKey(timeZone, t + 3600_000) === today) t += 3600_000;
  while (dayKey(timeZone, t) === today) t += MINUTE;
  return t;
}
