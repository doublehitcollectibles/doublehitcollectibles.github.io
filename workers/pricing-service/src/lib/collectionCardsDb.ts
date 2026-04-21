import type { CollectionCardRecord, OwnedCollectionEntry } from "../types";

function normalizeOwnerUsername(ownerUsername: string): string {
  return ownerUsername.trim();
}

function isMissingColumnError(error: unknown): boolean {
  return /\bno such column\b/i.test(String(error ?? ""));
}

function buildCollectionCardsSelectQuery(options?: { ownerScoped?: boolean; legacy?: boolean }): string {
  const ownerScoped = Boolean(options?.ownerScoped);
  const legacy = Boolean(options?.legacy);

  const selectFields = legacy
    ? `id,
       owner_username,
       card_id,
       NULL AS source,
       label,
       NULL AS game,
       NULL AS category,
       NULL AS series,
       NULL AS variant,
       NULL AS item_number,
       NULL AS image,
       NULL AS artist,
       NULL AS description,
       NULL AS currency,
       NULL AS current_price,
       NULL AS price_source,
       quantity,
       purchase_price,
       purchase_date,
       price_type,
       NULL AS ownership_price_variant,
       condition,
       notes,
       created_at,
       updated_at`
    : `id,
       owner_username,
       card_id,
       source,
       label,
       game,
       category,
       series,
       variant,
       item_number,
       image,
       artist,
       description,
       currency,
       current_price,
       price_source,
       quantity,
       purchase_price,
       purchase_date,
       price_type,
       ownership_price_variant,
       condition,
       notes,
       created_at,
       updated_at`;

  return `SELECT
            ${selectFields}
          FROM collection_cards
          ${ownerScoped ? "WHERE owner_username = ?1" : ""}
          ORDER BY updated_at DESC, id DESC`;
}

async function mapCollectionCards(
  statement: D1PreparedStatement,
): Promise<CollectionCardRecord[]> {
  const result = await statement.all<{
    id: number;
    owner_username: string | null;
    card_id: string;
    source: string | null;
    label: string | null;
    game: string | null;
    category: string | null;
    series: string | null;
    variant: string | null;
    item_number: string | null;
    image: string | null;
    artist: string | null;
    description: string | null;
    currency: string | null;
    current_price: number | null;
    price_source: string | null;
    quantity: number;
    purchase_price: number | null;
    purchase_date: string | null;
    price_type: string | null;
    ownership_price_variant: string | null;
    condition: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>();

  return result.results.map((row) => ({
    id: row.id,
    ownerUsername: row.owner_username ?? undefined,
    cardId: row.card_id,
    source: row.source === "custom" ? "custom" : "api",
    label: row.label ?? undefined,
    game: row.game ?? undefined,
    category: row.category ?? undefined,
    series: row.series ?? undefined,
    variant: row.variant ?? undefined,
    itemNumber: row.item_number ?? undefined,
    image: row.image ?? undefined,
    artist: row.artist ?? undefined,
    description: row.description ?? undefined,
    currency: row.currency ?? undefined,
    currentPrice: row.current_price ?? undefined,
    priceSource: row.price_source ?? undefined,
    quantity: row.quantity,
    purchasePrice: row.purchase_price ?? undefined,
    purchaseDate: row.purchase_date ?? undefined,
    priceType: row.price_type ?? undefined,
    ownershipPriceVariant: row.ownership_price_variant ?? undefined,
    condition: row.condition ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function claimCollectionCardsForOwner(db: D1Database, ownerUsername: string): Promise<void> {
  const normalizedOwner = normalizeOwnerUsername(ownerUsername);

  await db
    .prepare(
      `UPDATE collection_cards
       SET owner_username = ?1
       WHERE owner_username IS NULL OR TRIM(owner_username) = ''`,
    )
    .bind(normalizedOwner)
    .run();
}

export async function listCollectionCards(db: D1Database): Promise<CollectionCardRecord[]> {
  try {
    return await mapCollectionCards(db.prepare(buildCollectionCardsSelectQuery()));
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    return mapCollectionCards(db.prepare(buildCollectionCardsSelectQuery({ legacy: true })));
  }
}

export async function listCollectionCardsForOwner(
  db: D1Database,
  ownerUsername: string,
): Promise<CollectionCardRecord[]> {
  const normalizedOwner = normalizeOwnerUsername(ownerUsername);

  try {
    return await mapCollectionCards(db.prepare(buildCollectionCardsSelectQuery({ ownerScoped: true })).bind(normalizedOwner));
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    return mapCollectionCards(
      db.prepare(buildCollectionCardsSelectQuery({ ownerScoped: true, legacy: true })).bind(normalizedOwner),
    );
  }
}

export async function insertCollectionCard(
  db: D1Database,
  ownerUsername: string,
  entry: OwnedCollectionEntry,
): Promise<void> {
  const now = new Date().toISOString();
  const normalizedOwner = normalizeOwnerUsername(ownerUsername);

  await db
    .prepare(
      `INSERT INTO collection_cards (
         owner_username,
         card_id,
         source,
         label,
         game,
         category,
         series,
         variant,
         item_number,
         image,
         artist,
         description,
         currency,
         current_price,
         price_source,
         quantity,
         purchase_price,
         purchase_date,
         price_type,
         ownership_price_variant,
         condition,
         notes,
         created_at,
         updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?23)`,
    )
    .bind(
      normalizedOwner,
      entry.cardId,
      entry.source === "custom" ? "custom" : "api",
      entry.label ?? null,
      entry.game ?? null,
      entry.category ?? null,
      entry.series ?? null,
      entry.variant ?? null,
      entry.itemNumber ?? null,
      entry.image ?? null,
      entry.artist ?? null,
      entry.description ?? null,
      entry.currency ?? null,
      entry.currentPrice != null ? Number(entry.currentPrice) : null,
      entry.priceSource ?? null,
      Math.max(1, Math.trunc(Number(entry.quantity ?? 1))),
      entry.purchasePrice != null ? Number(entry.purchasePrice) : null,
      entry.purchaseDate ?? null,
      entry.priceType ?? null,
      entry.ownershipPriceVariant ?? null,
      entry.condition ?? null,
      entry.notes ?? null,
      now,
    )
    .run();
}

export async function updateCollectionCard(
  db: D1Database,
  id: number,
  ownerUsername: string,
  entry: OwnedCollectionEntry,
): Promise<boolean> {
  const now = new Date().toISOString();
  const normalizedOwner = normalizeOwnerUsername(ownerUsername);
  const result = await db
    .prepare(
      `UPDATE collection_cards
       SET card_id = ?3,
           source = ?4,
           label = ?5,
           game = ?6,
           category = ?7,
           series = ?8,
           variant = ?9,
           item_number = ?10,
           image = ?11,
           artist = ?12,
           description = ?13,
           currency = ?14,
           current_price = ?15,
           price_source = ?16,
           quantity = ?17,
           purchase_price = ?18,
           purchase_date = ?19,
           price_type = ?20,
           ownership_price_variant = ?21,
           condition = ?22,
           notes = ?23,
           updated_at = ?24
       WHERE id = ?1 AND owner_username = ?2`,
    )
    .bind(
      id,
      normalizedOwner,
      entry.cardId,
      entry.source === "custom" ? "custom" : "api",
      entry.label ?? null,
      entry.game ?? null,
      entry.category ?? null,
      entry.series ?? null,
      entry.variant ?? null,
      entry.itemNumber ?? null,
      entry.image ?? null,
      entry.artist ?? null,
      entry.description ?? null,
      entry.currency ?? null,
      entry.currentPrice != null ? Number(entry.currentPrice) : null,
      entry.priceSource ?? null,
      Math.max(1, Math.trunc(Number(entry.quantity ?? 1))),
      entry.purchasePrice != null ? Number(entry.purchasePrice) : null,
      entry.purchaseDate ?? null,
      entry.priceType ?? null,
      entry.ownershipPriceVariant ?? null,
      entry.condition ?? null,
      entry.notes ?? null,
      now,
    )
    .run();

  return Number(result.meta?.changes || 0) > 0;
}

export async function deleteCollectionCard(
  db: D1Database,
  id: number,
  ownerUsername: string,
): Promise<boolean> {
  const normalizedOwner = normalizeOwnerUsername(ownerUsername);
  const result = await db
    .prepare(`DELETE FROM collection_cards WHERE id = ?1 AND owner_username = ?2`)
    .bind(id, normalizedOwner)
    .run();

  return Number(result.meta?.changes || 0) > 0;
}
