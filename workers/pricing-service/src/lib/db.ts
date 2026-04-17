import type { D1Result } from "@cloudflare/workers-types";
import type { PricingSummary, SoldComp, WatchlistEntry } from "../types";

interface SnapshotRow {
  id: number;
  normalized_query: string;
  display_query: string;
  provider: string;
  source_url: string;
  market_price: number;
  average_price: number;
  median_price: number;
  trimmed_mean_price: number;
  min_price: number;
  max_price: number;
  sample_size: number;
  currency: string;
  sold_from: string | null;
  sold_to: string | null;
  refreshed_at: string;
}

interface SoldCompRow {
  provider_item_id: string;
  title: string;
  listing_url: string;
  sale_price: number;
  shipping_price: number;
  total_price: number;
  currency: string;
  sold_at: string | null;
  condition_bucket: "graded" | "raw" | "unknown";
  raw_payload: string;
}

export async function writePricingSnapshot(
  db: D1Database,
  summary: PricingSummary,
  rawPayload: Record<string, unknown> | undefined,
): Promise<number> {
  await db
    .prepare(
      `INSERT INTO cards (normalized_query, display_query, card_number, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(normalized_query) DO UPDATE SET
         display_query = excluded.display_query,
         card_number = excluded.card_number,
         updated_at = excluded.updated_at`,
    )
    .bind(summary.normalizedQuery, summary.query, null, summary.lastRefreshedAt)
    .run();

  const snapshotResult = (await db
    .prepare(
      `INSERT INTO price_snapshots (
         normalized_query,
         display_query,
         provider,
         source_url,
         market_price,
         average_price,
         median_price,
         trimmed_mean_price,
         min_price,
         max_price,
         sample_size,
         currency,
         sold_from,
         sold_to,
         refreshed_at,
         raw_payload
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`,
    )
    .bind(
      summary.normalizedQuery,
      summary.query,
      summary.provider,
      summary.sourceUrl,
      summary.marketPrice,
      summary.averagePrice,
      summary.medianPrice,
      summary.trimmedMeanPrice,
      summary.minPrice,
      summary.maxPrice,
      summary.sampleSize,
      summary.currency,
      summary.soldFrom,
      summary.soldTo,
      summary.lastRefreshedAt,
      JSON.stringify(rawPayload ?? {}),
    )
    .run()) as D1Result;

  const snapshotId = Number(snapshotResult.meta.last_row_id);

  if (!snapshotId) {
    throw new Error("Failed to persist pricing snapshot.");
  }

  const inserts = summary.comps.map((comp) =>
    db
      .prepare(
        `INSERT INTO sold_comps (
           snapshot_id,
           provider_item_id,
           title,
           listing_url,
           sale_price,
           shipping_price,
           total_price,
           currency,
           sold_at,
           condition_bucket,
           raw_payload
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      )
      .bind(
        snapshotId,
        comp.providerItemId,
        comp.title,
        comp.listingUrl,
        comp.salePrice,
        comp.shippingPrice,
        comp.totalPrice,
        comp.currency,
        comp.soldAt,
        comp.conditionBucket,
        JSON.stringify(comp.rawPayload),
      ),
  );

  if (inserts.length > 0) {
    await db.batch(inserts);
  }

  return snapshotId;
}

export async function getLatestPricingSummary(
  db: D1Database,
  normalizedQuery: string,
): Promise<PricingSummary | null> {
  const snapshotResult = await db
    .prepare(
      `SELECT
         id,
         normalized_query,
         display_query,
         provider,
         source_url,
         market_price,
         average_price,
         median_price,
         trimmed_mean_price,
         min_price,
         max_price,
         sample_size,
         currency,
         sold_from,
         sold_to,
         refreshed_at
       FROM price_snapshots
       WHERE normalized_query = ?1
       ORDER BY refreshed_at DESC
       LIMIT 1`,
    )
    .bind(normalizedQuery)
    .first<SnapshotRow>();

  if (!snapshotResult) {
    return null;
  }

  const compRows = await db
    .prepare(
      `SELECT
         provider_item_id,
         title,
         listing_url,
         sale_price,
         shipping_price,
         total_price,
         currency,
         sold_at,
         condition_bucket,
         raw_payload
       FROM sold_comps
       WHERE snapshot_id = ?1
       ORDER BY sold_at DESC, total_price DESC`,
    )
    .bind(snapshotResult.id)
    .all<SoldCompRow>();

  const comps: SoldComp[] = compRows.results.map((row) => ({
    providerItemId: row.provider_item_id,
    title: row.title,
    listingUrl: row.listing_url,
    salePrice: row.sale_price,
    shippingPrice: row.shipping_price,
    totalPrice: row.total_price,
    currency: row.currency,
    soldAt: row.sold_at,
    conditionBucket: row.condition_bucket,
    rawPayload: JSON.parse(row.raw_payload) as Record<string, unknown>,
  }));

  return {
    query: snapshotResult.display_query,
    normalizedQuery: snapshotResult.normalized_query,
    provider: snapshotResult.provider,
    sourceUrl: snapshotResult.source_url,
    marketPrice: snapshotResult.market_price,
    averagePrice: snapshotResult.average_price,
    medianPrice: snapshotResult.median_price,
    trimmedMeanPrice: snapshotResult.trimmed_mean_price,
    minPrice: snapshotResult.min_price,
    maxPrice: snapshotResult.max_price,
    sampleSize: snapshotResult.sample_size,
    currency: snapshotResult.currency,
    soldFrom: snapshotResult.sold_from,
    soldTo: snapshotResult.sold_to,
    lastRefreshedAt: snapshotResult.refreshed_at,
    comps,
  };
}

export async function recordSourceError(
  db: D1Database,
  normalizedQuery: string,
  provider: string,
  stage: string,
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO source_errors (normalized_query, provider, stage, message, details)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(normalizedQuery, provider, stage, message, JSON.stringify(details ?? {}))
    .run();
}

export async function upsertWatchlistEntry(
  db: D1Database,
  query: string,
  normalizedQuery: string,
  refreshEveryHours: number,
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO watchlist (
         query,
         normalized_query,
         refresh_every_hours,
         active,
         next_refresh_at,
         updated_at
       ) VALUES (?1, ?2, ?3, 1, ?4, ?5)
       ON CONFLICT(normalized_query) DO UPDATE SET
         query = excluded.query,
         refresh_every_hours = excluded.refresh_every_hours,
         active = 1,
         next_refresh_at = excluded.next_refresh_at,
         updated_at = excluded.updated_at`,
    )
    .bind(query, normalizedQuery, refreshEveryHours, now, now)
    .run();
}

export async function listWatchlist(db: D1Database): Promise<WatchlistEntry[]> {
  const result = await db
    .prepare(
      `SELECT id, query, normalized_query, refresh_every_hours, next_refresh_at, last_refreshed_at, active
       FROM watchlist
       ORDER BY normalized_query ASC`,
    )
    .all<{
      id: number;
      query: string;
      normalized_query: string;
      refresh_every_hours: number;
      next_refresh_at: string;
      last_refreshed_at: string | null;
      active: number;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    query: row.query,
    normalizedQuery: row.normalized_query,
    refreshEveryHours: row.refresh_every_hours,
    nextRefreshAt: row.next_refresh_at,
    lastRefreshedAt: row.last_refreshed_at,
    active: row.active === 1,
  }));
}

export async function listDueWatchlistEntries(
  db: D1Database,
  limit: number,
): Promise<WatchlistEntry[]> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `SELECT id, query, normalized_query, refresh_every_hours, next_refresh_at, last_refreshed_at, active
       FROM watchlist
       WHERE active = 1 AND next_refresh_at <= ?1
       ORDER BY next_refresh_at ASC
       LIMIT ?2`,
    )
    .bind(now, limit)
    .all<{
      id: number;
      query: string;
      normalized_query: string;
      refresh_every_hours: number;
      next_refresh_at: string;
      last_refreshed_at: string | null;
      active: number;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    query: row.query,
    normalizedQuery: row.normalized_query,
    refreshEveryHours: row.refresh_every_hours,
    nextRefreshAt: row.next_refresh_at,
    lastRefreshedAt: row.last_refreshed_at,
    active: row.active === 1,
  }));
}

export async function advanceWatchlistSchedule(
  db: D1Database,
  normalizedQuery: string,
  refreshEveryHours: number,
  refreshedAt: string,
): Promise<void> {
  const nextRefreshAt = new Date(Date.parse(refreshedAt) + refreshEveryHours * 3_600_000).toISOString();

  await db
    .prepare(
      `UPDATE watchlist
       SET last_refreshed_at = ?1,
           next_refresh_at = ?2,
           updated_at = ?1
       WHERE normalized_query = ?3`,
    )
    .bind(refreshedAt, nextRefreshAt, normalizedQuery)
    .run();
}

export async function claimWatchlistSlot(
  db: D1Database,
  entry: WatchlistEntry,
): Promise<void> {
  const nextRefreshAt = new Date(Date.now() + entry.refreshEveryHours * 3_600_000).toISOString();

  await db
    .prepare(
      `UPDATE watchlist
       SET next_refresh_at = ?1,
           updated_at = ?2
       WHERE normalized_query = ?3`,
    )
    .bind(nextRefreshAt, new Date().toISOString(), entry.normalizedQuery)
    .run();
}
