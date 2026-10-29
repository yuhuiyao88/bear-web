// One shared copy of the usage counts for every Worker instance, so the router
// sees all of BEAR's traffic, not just the requests one instance handled.
// Free plan: 100,000 requests a day; BEAR makes two per model attempt.

import { DurableObject } from "cloudflare:workers";
import { POOL } from "./models.js";
import { UsageTracker } from "./usage.js";

export class ModelUsage extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.tracker = new UsageTracker(POOL, (await ctx.storage.get("state")) || {});
    });
  }

  async pick(ids, estTokens, exclude) {
    const result = this.tracker.pick(ids, estTokens, exclude);
    await this.save();
    return result;
  }

  async report(id, outcome) {
    this.tracker.report(id, outcome);
    await this.save();
  }

  snapshot(ids) {
    return this.tracker.snapshot(ids);
  }

  save() {
    return this.ctx.storage.put("state", this.tracker.state);
  }
}
