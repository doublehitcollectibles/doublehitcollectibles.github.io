import { claimWatchlistSlot, listDueWatchlistEntries } from "../lib/db";
import type { Env, PricingConfig, PricingJob } from "../types";

export async function enqueueDueWatchlistRefreshes(env: Env, config: PricingConfig): Promise<number> {
  const dueEntries = await listDueWatchlistEntries(env.PRICING_DB, config.watchlistRefreshBatch);

  for (const entry of dueEntries) {
    const job: PricingJob = {
      query: entry.query,
      normalizedQuery: entry.normalizedQuery,
      reason: "watchlist",
      enqueuedAt: new Date().toISOString(),
    };

    await env.PRICING_QUEUE.send(job);
    await claimWatchlistSlot(env.PRICING_DB, entry);
  }

  return dueEntries.length;
}
