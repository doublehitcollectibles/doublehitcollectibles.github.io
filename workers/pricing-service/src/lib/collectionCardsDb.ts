import type { CollectionCardRecord, OwnedCollectionEntry } from "../types";

export async function listCollectionCards(db: D1Database): Promise<CollectionCardRecord[]> {
  const result = await db
    .prepare(
      `SELECT
         id,
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
    )
    .all<{
      id: number;
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

export async function insertCollectionCard(db: D1Database, entry: OwnedCollectionEntry): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO collection_cards (
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
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
    )
    .bind(
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

export async function updateCollectionCard(db: D1Database, id: number, entry: OwnedCollectionEntry): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE collection_cards
       SET card_id = ?2,
           label = ?3,
           quantity = ?4,
           purchase_price = ?5,
           purchase_date = ?6,
           price_type = ?7,
           condition = ?8,
           notes = ?9,
           updated_at = ?10
       WHERE id = ?1`,
    )
    .bind(
      id,
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

export async function deleteCollectionCard(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM collection_cards WHERE id = ?1`).bind(id).run();
}
