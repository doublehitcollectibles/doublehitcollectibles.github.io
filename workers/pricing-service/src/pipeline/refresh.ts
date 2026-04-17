import { getPricingConfig } from "../config";
import { putCachedPricingSummary } from "../lib/cache";
import { advanceWatchlistSchedule, recordSourceError, writePricingSnapshot } from "../lib/db";
import { normalizeCardQuery } from "../lib/query";
import { computePricingMetrics } from "../lib/stats";
import { EbaySoldHtmlProvider } from "../providers/ebaySoldHtmlProvider";
import type { Env, PricingJob, PricingSummary } from "../types";

async function acquireLock(env: Env, normalizedQuery: string, ttlSeconds: number): Promise<string | null> {
  const id = env.PRICING_LOCKS.idFromName(normalizedQuery);
  const stub = env.PRICING_LOCKS.get(id);
  const holder = crypto.randomUUID();
  const response = await stub.fetch("https://pricing-lock/acquire", {
    method: "POST",
    body: JSON.stringify({ holder, ttlSeconds }),
  });

  if (!response.ok) {
    return null;
  }

  return holder;
}

async function releaseLock(env: Env, normalizedQuery: string, holder: string): Promise<void> {
  const id = env.PRICING_LOCKS.idFromName(normalizedQuery);
  const stub = env.PRICING_LOCKS.get(id);
  await stub.fetch("https://pricing-lock/release", {
    method: "POST",
    body: JSON.stringify({ holder }),
  });
}

export async function refreshPricingJob(
  env: Env,
  job: PricingJob,
): Promise<{ status: "locked" | "ok"; summary?: PricingSummary }> {
  const config = getPricingConfig(env);
  const query = normalizeCardQuery(job.query);
  const lockHolder = await acquireLock(env, query.normalized, config.lockTtlSeconds);

  if (!lockHolder) {
    return { status: "locked" };
  }

  try {
    const provider = new EbaySoldHtmlProvider();
    const snapshot = await provider.fetchSnapshot(env, query, config);
    const refreshedAt = new Date().toISOString();
    const metrics = computePricingMetrics(snapshot.comps);
    const summary: PricingSummary = {
      query: query.display,
      normalizedQuery: query.normalized,
      provider: snapshot.provider,
      sourceUrl: snapshot.sourceUrl,
      currency: snapshot.comps[0]?.currency ?? "USD",
      lastRefreshedAt: refreshedAt,
      comps: snapshot.comps,
      ...metrics,
    };

    await writePricingSnapshot(env.PRICING_DB, summary, snapshot.rawPayload);
    await putCachedPricingSummary(env, summary, config);

    const watchlist = await env.PRICING_DB
      .prepare(`SELECT refresh_every_hours FROM watchlist WHERE normalized_query = ?1 AND active = 1`)
      .bind(query.normalized)
      .first<{ refresh_every_hours: number }>();

    if (watchlist) {
      await advanceWatchlistSchedule(
        env.PRICING_DB,
        query.normalized,
        watchlist.refresh_every_hours,
        refreshedAt,
      );
    }

    return { status: "ok", summary };
  } catch (error) {
    await recordSourceError(
      env.PRICING_DB,
      query.normalized,
      "ebay_sold_html",
      "refresh",
      error instanceof Error ? error.message : "Unknown refresh error",
      {
        query: query.display,
        reason: job.reason,
      },
    );
    throw error;
  } finally {
    await releaseLock(env, query.normalized, lockHolder);
  }
}
