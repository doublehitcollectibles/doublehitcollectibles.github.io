import collectionData from "../../../../assets/data/owned-cards.json";
import type { OwnedCollectionEntry, OwnedCollectionFile } from "../types";

export function getOwnedCollection(): OwnedCollectionFile {
  const payload = collectionData as OwnedCollectionFile;

  return {
    collectionName: payload.collectionName ?? "Double Hit Collection",
    currency: payload.currency ?? "USD",
    cards: Array.isArray(payload.cards) ? payload.cards : [],
  };
}

export function getTrackedPokemonEntries(): OwnedCollectionEntry[] {
  return getOwnedCollection().cards.filter((entry) => entry.source !== "custom" && Boolean(entry.cardId));
}
