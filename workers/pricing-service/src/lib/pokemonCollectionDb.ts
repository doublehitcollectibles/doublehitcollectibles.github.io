import type { PokemonCardSummary, PokemonHistoryPoint } from "../types";

interface PokemonSnapshotRow {
  card_id: string;
  card_name: string;
  set_name: string | null;
  card_number: string | null;
  rarity: string | null;
  image_small: string | null;
  image_large: string | null;
  price_type: string;
  price_source: string;
  currency: string;
  market_price: number | null;
  captured_at: string;
  tcgplayer_updated_at: string | null;
  cardmarket_updated_at: string | null;
  card_payload: string;
  price_payload: string;
}

const STORED_PRICE_PAYLOAD_VERSION = 1;

export async function writePokemonCardSnapshot(
  db: D1Database,
  summary: PokemonCardSummary,
  rawCard: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pokemon_card_snapshots (
         card_id,
         card_name,
         set_id,
         set_name,
         card_number,
         rarity,
         image_small,
         image_large,
         price_type,
         price_source,
         currency,
         market_price,
         captured_at,
         tcgplayer_updated_at,
         cardmarket_updated_at,
         card_payload,
         price_payload
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
    )
    .bind(
      summary.id,
      summary.cardName,
      (rawCard.set as { id?: string } | undefined)?.id ?? null,
      summary.setName,
      summary.number,
      summary.rarity,
      summary.thumbnail,
      summary.image,
      summary.pricing.priceType,
      summary.pricing.sourceLabel,
      summary.pricing.currency,
      summary.pricing.currentPrice,
      new Date().toISOString(),
      (rawCard.tcgplayer as { updatedAt?: string } | undefined)?.updatedAt ?? null,
      (rawCard.cardmarket as { updatedAt?: string } | undefined)?.updatedAt ?? null,
      JSON.stringify(rawCard),
      JSON.stringify({
        payloadVersion: STORED_PRICE_PAYLOAD_VERSION,
        pricing: summary.pricing,
        priceVariants: summary.priceVariants,
        historySeries: summary.historySeries,
        marketSourceUrl: summary.marketSourceUrl,
        externalPricingChecked: true,
      }),
    )
    .run();
}

export async function getLatestPokemonCardSnapshot(
  db: D1Database,
  cardId: string,
  priceType?: string,
): Promise<PokemonSnapshotRow | null> {
  const priceTypeClause = priceType ? "AND price_type = ?2" : "";
  const statement = db.prepare(
    `SELECT
       card_id,
       card_name,
       set_name,
       card_number,
       rarity,
       image_small,
       image_large,
       price_type,
       price_source,
       currency,
       market_price,
       captured_at,
       tcgplayer_updated_at,
       cardmarket_updated_at,
       card_payload,
       price_payload
     FROM pokemon_card_snapshots
     WHERE card_id = ?1 ${priceTypeClause}
     ORDER BY captured_at DESC
     LIMIT 1`,
  );

  return priceType ? statement.bind(cardId, priceType).first<PokemonSnapshotRow>() : statement.bind(cardId).first<PokemonSnapshotRow>();
}

export async function getPokemonCardHistory(
  db: D1Database,
  cardId: string,
  priceType?: string,
  limit = 30,
): Promise<PokemonHistoryPoint[]> {
  const priceTypeClause = priceType ? "AND price_type = ?2" : "";
  const limitParam = priceType ? "?3" : "?2";
  const statement = db.prepare(
    `SELECT
       captured_at,
       market_price,
       currency,
       price_type,
       price_source
     FROM pokemon_card_snapshots
     WHERE card_id = ?1 ${priceTypeClause}
     ORDER BY captured_at ASC
     LIMIT ${limitParam}`,
  );

  const result = priceType
    ? await statement.bind(cardId, priceType, limit).all<{
        captured_at: string;
        market_price: number | null;
        currency: string;
        price_type: string;
        price_source: string;
      }>()
    : await statement.bind(cardId, limit).all<{
        captured_at: string;
        market_price: number | null;
        currency: string;
        price_type: string;
        price_source: string;
      }>();

  return result.results.map((row) => ({
    capturedAt: row.captured_at,
    marketPrice: row.market_price,
    currency: row.currency,
    priceType: row.price_type,
    priceSource: row.price_source,
  }));
}
