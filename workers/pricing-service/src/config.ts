import type { Env, PricingConfig } from "./types";

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

export function getPricingConfig(env: Env): PricingConfig {
  return {
    adminApiKey: env.ADMIN_API_KEY,
    adminUsername: env.ADMIN_USERNAME,
    adminPasswordHash: env.ADMIN_PASSWORD_HASH,
    adminPassword: env.ADMIN_PASSWORD,
    sessionSecret: env.SESSION_SECRET,
    cacheTtlMinutes: parseNumber(env.CACHE_TTL_MINUTES, 240),
    staleTtlHours: parseNumber(env.STALE_TTL_HOURS, 72),
    watchlistRefreshBatch: parseNumber(env.WATCHLIST_REFRESH_BATCH, 25),
    lockTtlSeconds: parseNumber(env.LOCK_TTL_SECONDS, 90),
    ebayScrapeEnabled: parseBoolean(env.EBAY_SCRAPE_ENABLED, false),
    ebayBaseUrl: env.EBAY_BASE_URL ?? "https://www.ebay.com",
    pokemonTcgApiKey: env.POKEMON_TCG_API_KEY,
    pokemonTcgApiBaseUrl: env.POKEMON_TCG_API_BASE_URL ?? "https://api.pokemontcg.io/v2",
    pokemonTcgCacheTtlMinutes: parseNumber(env.POKEMON_TCG_CACHE_TTL_MINUTES, 360),
    pokemonTcgRefreshHours: parseNumber(env.POKEMON_TCG_REFRESH_HOURS, 6),
    userAgent:
      env.USER_AGENT ??
      "DoubleHitCollectiblesPricingBot/0.1 (+https://doublehitcollectibles.github.io)",
  };
}

export function isAuthorizedAdmin(request: Request, config: PricingConfig): boolean {
  if (!config.adminApiKey) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${config.adminApiKey}`;
}
