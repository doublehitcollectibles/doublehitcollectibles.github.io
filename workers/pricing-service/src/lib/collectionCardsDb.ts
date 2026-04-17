import type { CollectionCardRecord, OwnedCollectionEntry } from "../types";

function normalizeOwnerUsername(ownerUsername: string): string {
  return ownerUsername.trim();
}

async function mapCollectionCards(
  statement: D1PreparedStatement,
): Promise<CollectionCardRecord[]> {
  const result = await statement.all<{
    id: number;
    owner_username: string | null;
    card_id: string;
    label: string | null;
    quantity: number;
    purchase_price: number | null;
    purchase_date: string | null;
    price_type: string | null;
    condition: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>();

  return result.results.map((row) => ({
    id: row.id,
    ownerUsername: row.owner_username ?? undefined,
    cardId: row.card_id,
    label: row.label ?? undefined,
    quantity: row.quantity,
    purchasePrice: row.purchase_price ?? undefined,
    purchaseDate: row.purchase_date ?? undefined,
    priceType: row.price_type ?? undefined,
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
  return mapCollectionCards(
    db.prepare(
      `SELECT
         id,
         owner_username,
         card_id,
         label,
         quantity,
         purchase_price,
         purchase_date,
         price_type,
         condition,
         notes,
         created_at,
         updated_at
       FROM collection_cards
       ORDER BY updated_at DESC, id DESC`,
    ),
  );
}

export async function listCollectionCardsForOwner(
  db: D1Database,
  ownerUsername: string,
): Promise<CollectionCardRecord[]> {
  const normalizedOwner = normalizeOwnerUsername(ownerUsername);

  return mapCollectionCards(
    db
      .prepare(
        `SELECT
           id,
           owner_username,
           card_id,
           label,
           quantity,
           purchase_price,
           purchase_date,
           price_type,
           condition,
           notes,
           created_at,
           updated_at
         FROM collection_cards
         WHERE owner_username = ?1
         ORDER BY updated_at DESC, id DESC`,
      )
      .bind(normalizedOwner),
  );
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
         label,
         quantity,
         purchase_price,
         purchase_date,
         price_type,
         condition,
         notes,
         created_at,
         updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
    )
    .bind(
      normalizedOwner,
      entry.cardId,
      entry.label ?? null,
      Math.max(1, Math.trunc(Number(entry.quantity ?? 1))),
      entry.purchasePrice != null ? Number(entry.purchasePrice) : null,
      entry.purchaseDate ?? null,
      entry.priceType ?? null,
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
           label = ?4,
           quantity = ?5,
           purchase_price = ?6,
           purchase_date = ?7,
           price_type = ?8,
           condition = ?9,
           notes = ?10,
           updated_at = ?11
       WHERE id = ?1 AND owner_username = ?2`,
    )
    .bind(
      id,
      normalizedOwner,
      entry.cardId,
      entry.label ?? null,
      Math.max(1, Math.trunc(Number(entry.quantity ?? 1))),
      entry.purchasePrice != null ? Number(entry.purchasePrice) : null,
      entry.purchaseDate ?? null,
      entry.priceType ?? null,
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
