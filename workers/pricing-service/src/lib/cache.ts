import type { CachedPricingHit, CachedPricingRecord, Env, PricingConfig, PricingSummary } from "../types";

function cacheKey(normalizedQuery: string): string {
  return `pricing:v1:${normalizedQuery}`;
}

export async function getCachedPricingSummary(
  env: Env,
  normalizedQuery: string,
  now = new Date(),
): Promise<CachedPricingHit | null> {
  const cached = await env.PRICE_CACHE.get(cacheKey(normalizedQuery), "json");

  if (!cached) {
    return null;
  }

  const record = cached as CachedPricingRecord;
  const freshness = new Date(record.freshUntil) > now ? "fresh" : "stale";

  if (new Date(record.staleUntil) <= now) {
    return null;
  }

  return { record, freshness };
}

export async function putCachedPricingSummary(
  env: Env,
  summary: PricingSummary,
  config: PricingConfig,
): Promise<void> {
  const now = new Date(summary.lastRefreshedAt);
  const freshUntil = new Date(now.getTime() + config.cacheTtlMinutes * 60_000);
  const staleUntil = new Date(now.getTime() + config.staleTtlHours * 3_600_000);
  const record: CachedPricingRecord = {
    freshUntil: freshUntil.toISOString(),
    staleUntil: staleUntil.toISOString(),
    summary,
  };

  await env.PRICE_CACHE.put(cacheKey(summary.normalizedQuery), JSON.stringify(record), {
    expirationTtl: config.staleTtlHours * 3_600,
  });
}
