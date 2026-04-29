import { getPricingConfig, isAuthorizedAdmin } from "./config";
import { createSessionToken, requireAuthenticatedSession, verifyAdminPassword } from "./lib/auth";
import { getCachedPricingSummary, putCachedPricingSummary } from "./lib/cache";
import {
  claimCollectionCardsForOwner,
  deleteCollectionCard,
  insertCollectionCard,
  listCollectionCards,
  listCollectionCardsForOwner,
  updateCollectionCard,
} from "./lib/collectionCardsDb";
import { getLatestPricingSummary, listWatchlist, upsertWatchlistEntry } from "./lib/db";
import { getOwnedCollection, getTrackedPokemonEntries } from "./lib/ownedCollection";
import { normalizeCardQuery } from "./lib/query";
import { json } from "./lib/response";
import {
  getVisitorStats,
  leaveVisitor,
  normalizeVisitorSiteKey,
  parseVisitorLeavePayload,
  parseVisitorTrackPayload,
  trackVisitor,
} from "./lib/visitors";
import {
  getPriceChartingCollectibleDetail,
  getPokemonCardDetail,
  searchCollectibleCards,
  searchPokemonCards,
  searchPriceChartingCollectibles,
  getStoredCollectionCards,
  refreshTrackedPokemonCollection,
} from "./lib/pokemonTcg";
import { isPriceChartingCollectionId } from "./lib/priceCharting";
import { PricingLock } from "./durableObjects/PricingLock";
import { refreshPricingJob } from "./pipeline/refresh";
import { enqueueDueWatchlistRefreshes } from "./pipeline/watchlist";
import type { Env, OwnedCollectionEntry, PricingJob } from "./types";

export { PricingLock };

async function enqueueRefresh(env: Env, job: PricingJob): Promise<void> {
  await env.PRICING_QUEUE.send(job);
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
  };
}

function resolveVisitorSiteKey(request: Request, explicitSiteKey?: unknown): string {
  const explicit = String(explicitSiteKey ?? "").trim();

  if (explicit) {
    return normalizeVisitorSiteKey(explicit);
  }

  const origin = request.headers.get("origin");

  if (origin) {
    return normalizeVisitorSiteKey(origin);
  }

  const referer = request.headers.get("referer");

  if (referer) {
    return normalizeVisitorSiteKey(referer);
  }

  return normalizeVisitorSiteKey("doublehitcollectibles.github.io");
}

function normalizeEntrySource(value: unknown): "api" | "custom" {
  return String(value || "").trim().toLowerCase() === "custom" ? "custom" : "api";
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOwnershipPriceVariant(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");

  if (!normalized) {
    return undefined;
  }

  return normalized === "psa10" ? "psa10" : "raw";
}

function slugifyCollectionValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function ensureCollectionCardId(entry: OwnedCollectionEntry): string {
  if (entry.cardId) {
    return entry.cardId;
  }

  const titleSeed = entry.label || entry.series || entry.game || entry.category || "item";
  return `custom:${slugifyCollectionValue(titleSeed)}:${crypto.randomUUID().slice(0, 8)}`;
}

function isTrackedPokemonEntry(entry: OwnedCollectionEntry): boolean {
  return Boolean(entry.cardId) && (
    normalizeEntrySource(entry.source) === "api" ||
    isPriceChartingCollectionId(entry.cardId)
  );
}

async function getAllTrackedPokemonEntries(env: Env): Promise<OwnedCollectionEntry[]> {
  const staticEntries = getTrackedPokemonEntries();
  const storedEntries = await listCollectionCards(env.PRICING_DB);
  return [...staticEntries, ...storedEntries.filter(isTrackedPokemonEntry)];
}

async function handlePriceRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q");

  if (!rawQuery) {
    return json({ error: "Missing q parameter." }, { status: 400, headers: corsHeaders() });
  }

  const query = normalizeCardQuery(rawQuery);

  if (!query.normalized) {
    return json({ error: "Search query could not be normalized." }, { status: 400, headers: corsHeaders() });
  }

  const cached = await getCachedPricingSummary(env, query.normalized);

  if (cached?.freshness === "fresh") {
    return json(
      {
        status: "fresh",
        refreshing: false,
        summary: cached.record.summary,
      },
      { headers: corsHeaders() },
    );
  }

  const refreshJob: PricingJob = {
    query: query.display,
    normalizedQuery: query.normalized,
    reason: cached ? "stale_refresh" : "search_miss",
    enqueuedAt: new Date().toISOString(),
  };

  await enqueueRefresh(env, refreshJob);

  if (cached) {
    return json(
      {
        status: "stale",
        refreshing: true,
        summary: cached.record.summary,
      },
      { headers: corsHeaders() },
    );
  }

  const latest = await getLatestPricingSummary(env.PRICING_DB, query.normalized);
  const config = getPricingConfig(env);

  if (latest) {
    await putCachedPricingSummary(env, latest, config);
    return json(
      {
        status: "stale",
        refreshing: true,
        summary: latest,
      },
      { headers: corsHeaders() },
    );
  }

  return json(
    {
      status: "pending",
      refreshing: true,
      query: query.display,
      normalizedQuery: query.normalized,
    },
    { status: 202, headers: corsHeaders() },
  );
}

async function handleRefreshRequest(request: Request, env: Env): Promise<Response> {
  const config = getPricingConfig(env);

  if (!isAuthorizedAdmin(request, config)) {
    return json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const body = (await request.json()) as { query?: string };
  const rawQuery = body.query?.trim();

  if (!rawQuery) {
    return json({ error: "Missing query in request body." }, { status: 400, headers: corsHeaders() });
  }

  const result = await refreshPricingJob(env, {
    query: rawQuery,
    reason: "admin_force",
    force: true,
    enqueuedAt: new Date().toISOString(),
  });

  return json(result, { headers: corsHeaders() });
}

async function handleWatchlistList(request: Request, env: Env): Promise<Response> {
  const config = getPricingConfig(env);

  if (!isAuthorizedAdmin(request, config)) {
    return json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const watchlist = await listWatchlist(env.PRICING_DB);
  return json({ watchlist }, { headers: corsHeaders() });
}

async function handleWatchlistUpsert(request: Request, env: Env): Promise<Response> {
  const config = getPricingConfig(env);

  if (!isAuthorizedAdmin(request, config)) {
    return json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const body = (await request.json()) as { query?: string; refreshEveryHours?: number };
  const rawQuery = body.query?.trim();

  if (!rawQuery) {
    return json({ error: "Missing query in request body." }, { status: 400, headers: corsHeaders() });
  }

  const query = normalizeCardQuery(rawQuery);
  const refreshEveryHours = Math.max(1, Math.min(24, Math.trunc(body.refreshEveryHours ?? 4)));
  await upsertWatchlistEntry(env.PRICING_DB, query.display, query.normalized, refreshEveryHours);
  await enqueueRefresh(env, {
    query: query.display,
    normalizedQuery: query.normalized,
    reason: "watchlist",
    enqueuedAt: new Date().toISOString(),
  });

  return json(
    {
      ok: true,
      query: query.display,
      normalizedQuery: query.normalized,
      refreshEveryHours,
    },
    { headers: corsHeaders() },
  );
}

async function handleAuthLogin(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";
  const configuredUsername = getPricingConfig(env).adminUsername?.trim() || username;

  if (!username || !password) {
    return json({ error: "Username and password are required." }, { status: 400, headers: corsHeaders() });
  }

  const ok = await verifyAdminPassword(env, username, password);

  if (!ok) {
    return json({ error: "Invalid credentials." }, { status: 401, headers: corsHeaders() });
  }

  try {
    const token = await createSessionToken(env, configuredUsername);
    return json({ ok: true, token, user: { username: configuredUsername } }, { headers: corsHeaders() });
  } catch (error) {
    console.error("Failed to create admin session token.", error);
    return json(
      { error: "Admin authentication is misconfigured. Reset the Worker auth secrets and redeploy." },
      { status: 500, headers: corsHeaders() },
    );
  }
}

async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);

  if (!session) {
    return json({ authenticated: false }, { status: 401, headers: corsHeaders() });
  }

  return json({ authenticated: true, user: session }, { headers: corsHeaders() });
}

function parseCollectionCardBody(body: Record<string, unknown>): OwnedCollectionEntry {
  const source = normalizeEntrySource(body.source);
  const entry: OwnedCollectionEntry = {
    source,
    cardId: normalizeOptionalText(body.cardId),
    label: normalizeOptionalText(body.label),
    quantity: body.quantity != null ? Number(body.quantity) : 1,
    purchasePrice: normalizeOptionalNumber(body.purchasePrice),
    purchaseDate: normalizeOptionalText(body.purchaseDate),
    ownershipPriceVariant: normalizeOwnershipPriceVariant(body.ownershipPriceVariant),
    condition: normalizeOptionalText(body.condition),
    notes: normalizeOptionalText(body.notes),
  };

  if (source === "custom") {
    entry.cardId = ensureCollectionCardId(entry);
    entry.game = normalizeOptionalText(body.game);
    entry.category = normalizeOptionalText(body.category);
    entry.series = normalizeOptionalText(body.series);
    entry.variant = normalizeOptionalText(body.variant);
    entry.itemNumber = normalizeOptionalText(body.itemNumber);
    entry.image = normalizeOptionalText(body.image);
    entry.artist = normalizeOptionalText(body.artist);
    entry.description = normalizeOptionalText(body.description);
    entry.currency = normalizeOptionalText(body.currency) || "USD";
    entry.currentPrice = normalizeOptionalNumber(body.currentPrice);
    entry.priceSource = normalizeOptionalText(body.priceSource);
    return entry;
  }

  entry.priceType = normalizeOptionalText(body.priceType);
  return entry;
}

async function handleCollectionCardsGet(_request: Request, env: Env): Promise<Response> {
  const baseCollection = getOwnedCollection();
  const cards = await getStoredCollectionCards(env);

  return json(
    {
      collectionName: baseCollection.collectionName ?? "Double Hit Collection",
      currency: baseCollection.currency ?? "USD",
      cards,
    },
    { headers: corsHeaders() },
  );
}

async function handleCollectionCardsAdminGet(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);

  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  await claimCollectionCardsForOwner(env.PRICING_DB, session.username);
  const cards = await listCollectionCardsForOwner(env.PRICING_DB, session.username);
  return json({ cards }, { headers: corsHeaders() });
}

async function handleCollectionCardsCreate(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);

  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const entry = parseCollectionCardBody(body);

  if (normalizeEntrySource(entry.source) === "api" && !entry.cardId) {
    return json({ error: "cardId is required." }, { status: 400, headers: corsHeaders() });
  }

  if (normalizeEntrySource(entry.source) === "custom" && !entry.label) {
    return json({ error: "label is required for custom collection entries." }, { status: 400, headers: corsHeaders() });
  }

  await claimCollectionCardsForOwner(env.PRICING_DB, session.username);
  await insertCollectionCard(env.PRICING_DB, session.username, entry);
  if (isTrackedPokemonEntry(entry)) {
    await refreshTrackedPokemonCollection(env, [entry]);
  }
  return json({ ok: true }, { headers: corsHeaders() });
}

async function handleCollectionCardsUpdate(request: Request, env: Env, id: number): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);

  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const entry = parseCollectionCardBody(body);

  if (normalizeEntrySource(entry.source) === "api" && !entry.cardId) {
    return json({ error: "cardId is required." }, { status: 400, headers: corsHeaders() });
  }

  if (normalizeEntrySource(entry.source) === "custom" && !entry.label) {
    return json({ error: "label is required for custom collection entries." }, { status: 400, headers: corsHeaders() });
  }

  await claimCollectionCardsForOwner(env.PRICING_DB, session.username);
  const updated = await updateCollectionCard(env.PRICING_DB, id, session.username, entry);

  if (!updated) {
    return json(
      { error: "This collection card was not found for the signed-in user." },
      { status: 404, headers: corsHeaders() },
    );
  }

  if (isTrackedPokemonEntry(entry)) {
    await refreshTrackedPokemonCollection(env, [entry]);
  }
  return json({ ok: true }, { headers: corsHeaders() });
}

async function handleCollectionCardsDelete(request: Request, env: Env, id: number): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);

  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  await claimCollectionCardsForOwner(env.PRICING_DB, session.username);
  const deleted = await deleteCollectionCard(env.PRICING_DB, id, session.username);

  if (!deleted) {
    return json(
      { error: "This collection card was not found for the signed-in user." },
      { status: 404, headers: corsHeaders() },
    );
  }

  return json({ ok: true }, { headers: corsHeaders() });
}

async function handlePokemonCardSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  if (!query.trim()) {
    return json({ cards: [] }, { headers: corsHeaders() });
  }

  const cards = await searchPokemonCards(env, query);
  return json({ cards }, { headers: corsHeaders() });
}

async function handleCollectibleSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  if (!query.trim()) {
    return json({ cards: [] }, { headers: corsHeaders() });
  }

  const cards = await searchCollectibleCards(env, query);
  return json({ cards }, { headers: corsHeaders() });
}

async function handlePriceChartingSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  if (!query.trim()) {
    return json({ cards: [] }, { headers: corsHeaders() });
  }

  const results = await searchPriceChartingCollectibles(env, query);
  return json({ cards: results }, { headers: corsHeaders() });
}

async function handlePokemonCardDetail(request: Request, env: Env, cardId: string): Promise<Response> {
  const url = new URL(request.url);
  const priceType = url.searchParams.get("priceType") ?? undefined;
  const ownershipPriceVariant = normalizeOwnershipPriceVariant(url.searchParams.get("ownershipPriceVariant"));
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const ownership = {
    cardId,
    ...(priceType ? { priceType } : {}),
    ...(ownershipPriceVariant ? { ownershipPriceVariant } : {}),
  };
  const card = await getPokemonCardDetail(env, cardId, ownership, forceRefresh);
  return json({ card }, { headers: corsHeaders() });
}

async function handlePriceChartingItemDetail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const itemId = url.searchParams.get("id") ?? "";

  if (!itemId.trim()) {
    return json({ error: "Missing id parameter." }, { status: 400, headers: corsHeaders() });
  }

  const card = await getPriceChartingCollectibleDetail(env, itemId, null);
  return json({ card }, { headers: corsHeaders() });
}

async function handleVisitorStatsRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const siteKey = resolveVisitorSiteKey(request, url.searchParams.get("siteKey"));
  const stats = await getVisitorStats(env.PRICING_DB, siteKey);
  return json(stats, { headers: corsHeaders() });
}

async function handleVisitorTrackRequest(request: Request, env: Env): Promise<Response> {
  try {
    const fallbackSiteKey = resolveVisitorSiteKey(request);
    const body = await request.json().catch(() => ({}));
    const payload = parseVisitorTrackPayload(body, fallbackSiteKey);
    const stats = await trackVisitor(env.PRICING_DB, payload);
    return json(stats, { headers: corsHeaders() });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid visitor track payload." },
      { status: 400, headers: corsHeaders() },
    );
  }
}

async function handleVisitorLeaveRequest(request: Request, env: Env): Promise<Response> {
  try {
    const fallbackSiteKey = resolveVisitorSiteKey(request);
    const body = await request.json().catch(() => ({}));
    const payload = parseVisitorLeavePayload(body, fallbackSiteKey);
    const stats = await leaveVisitor(env.PRICING_DB, payload);
    return json(stats, { headers: corsHeaders() });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid visitor leave payload." },
      { status: 400, headers: corsHeaders() },
    );
  }
}

const worker: ExportedHandler<Env, PricingJob> = {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json(
        {
          ok: true,
          service: "doublehit-pricing-service",
          now: new Date().toISOString(),
        },
        { headers: corsHeaders() },
      );
    }

    if (request.method === "GET" && url.pathname === "/api/price") {
      return handlePriceRequest(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/refresh") {
      return handleRefreshRequest(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/watchlist") {
      return handleWatchlistList(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/watchlist") {
      return handleWatchlistUpsert(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      return handleAuthLogin(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      return handleAuthSession(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      return json({ ok: true }, { headers: corsHeaders() });
    }

    if (request.method === "GET" && url.pathname === "/api/collection/cards") {
      ctx.waitUntil(
        getAllTrackedPokemonEntries(env)
          .then((entries) => refreshTrackedPokemonCollection(env, entries))
          .catch((error) => {
            console.error("Background collection refresh failed.", error);
          }),
      );
      return handleCollectionCardsGet(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/collection/cards") {
      return handleCollectionCardsAdminGet(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/admin/collection/cards") {
      return handleCollectionCardsCreate(request, env);
    }

    if (pathParts[0] === "api" && pathParts[1] === "admin" && pathParts[2] === "collection" && pathParts[3] === "cards" && pathParts[4]) {
      const id = Number.parseInt(pathParts[4], 10);

      if (!Number.isFinite(id)) {
        return json({ error: "Invalid collection card id." }, { status: 400, headers: corsHeaders() });
      }

      if (request.method === "PUT") {
        return handleCollectionCardsUpdate(request, env, id);
      }

      if (request.method === "DELETE") {
        return handleCollectionCardsDelete(request, env, id);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/pokemon/cards/search") {
      return handlePokemonCardSearch(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/collectibles/search") {
      return handleCollectibleSearch(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/pricecharting/search") {
      return handlePriceChartingSearch(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/pricecharting/item") {
      return handlePriceChartingItemDetail(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/visitors") {
      return handleVisitorStatsRequest(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/visitors/track") {
      return handleVisitorTrackRequest(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/visitors/leave") {
      return handleVisitorLeaveRequest(request, env);
    }

    if (request.method === "GET" && pathParts[0] === "api" && pathParts[1] === "pokemon" && pathParts[2] === "cards" && pathParts[3]) {
      return handlePokemonCardDetail(request, env, pathParts[3]);
    }

    return json({ error: "Not found" }, { status: 404, headers: corsHeaders() });
  },

  async queue(batch, env, ctx): Promise<void> {
    for (const message of batch.messages) {
      ctx.waitUntil(
        refreshPricingJob(env, message.body).catch((error) => {
          console.error("Queue refresh failed", error);
          throw error;
        }),
      );
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(enqueueDueWatchlistRefreshes(env, getPricingConfig(env)));
    ctx.waitUntil(
      getAllTrackedPokemonEntries(env).then((entries) => refreshTrackedPokemonCollection(env, entries)),
    );
  },
};

export default worker;
