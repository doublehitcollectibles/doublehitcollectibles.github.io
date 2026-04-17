import { getPricingConfig } from "../config";
import { listCollectionCards } from "./collectionCardsDb";
import { getPokemonCardHistory, getLatestPokemonCardSnapshot, writePokemonCardSnapshot } from "./pokemonCollectionDb";
import type {
  CollectionCardRecord,
  Env,
  OwnedCollectionEntry,
  PokemonCardSummary,
  PokemonHistoryPoint,
} from "../types";

interface PokemonApiResponse<T> {
  data: T;
  page?: number;
  pageSize?: number;
  count?: number;
  totalCount?: number;
}

interface PokemonSet {
  id?: string;
  name?: string;
  series?: string;
  releaseDate?: string;
}

interface PokemonCard {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  evolvesTo?: string[];
  rules?: string[];
  abilities?: Array<Record<string, unknown>>;
  attacks?: Array<Record<string, unknown>>;
  weaknesses?: Array<Record<string, unknown>>;
  resistances?: Array<Record<string, unknown>>;
  retreatCost?: string[];
  convertedRetreatCost?: number;
  set?: PokemonSet;
  number?: string;
  artist?: string;
  rarity?: string;
  flavorText?: string;
  nationalPokedexNumbers?: number[];
  legalities?: Record<string, string>;
  regulationMark?: string;
  images?: {
    small?: string;
    large?: string;
  };
  tcgplayer?: {
    updatedAt?: string;
    prices?: Record<string, Record<string, number | null>>;
  };
  cardmarket?: {
    updatedAt?: string;
    prices?: Record<string, number | null>;
  };
}

const CARD_SELECT_FIELDS = [
  "id",
  "name",
  "supertype",
  "subtypes",
  "hp",
  "types",
  "evolvesFrom",
  "evolvesTo",
  "rules",
  "abilities",
  "attacks",
  "weaknesses",
  "resistances",
  "retreatCost",
  "convertedRetreatCost",
  "set",
  "number",
  "artist",
  "rarity",
  "flavorText",
  "nationalPokedexNumbers",
  "legalities",
  "regulationMark",
  "images",
  "tcgplayer",
  "cardmarket",
].join(",");

function normalizeSearchInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s#+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPokemonSearchQuery(input: string): string {
  const normalized = normalizeSearchInput(input);

  if (!normalized) {
    return "";
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const cardNumber = tokens[tokens.length - 1];

  if (/^\d+[a-z]?$/i.test(cardNumber) && tokens.length > 1) {
    const cardName = tokens.slice(0, -1).join(" ");
    return `name:"${cardName}" number:"${cardNumber}"`;
  }

  if (tokens.length === 1) {
    return `name:${tokens[0]}*`;
  }

  return `name:"${normalized}"`;
}

function computeOwnershipMetrics(currentPrice: number | null, ownership: OwnedCollectionEntry | null) {
  const quantity = Number(ownership?.quantity || 1);
  const purchasePrice = ownership?.purchasePrice != null ? Number(ownership.purchasePrice) : null;

  if (purchasePrice == null || currentPrice == null) {
    return {
      quantity,
      purchasePrice,
      investedValue: purchasePrice != null ? purchasePrice * quantity : null,
      currentValue: currentPrice != null ? currentPrice * quantity : null,
      deltaAmount: null,
      deltaPercent: null,
    };
  }

  const investedValue = purchasePrice * quantity;
  const currentValue = currentPrice * quantity;
  const deltaAmount = currentValue - investedValue;
  const deltaPercent = investedValue > 0 ? (deltaAmount / investedValue) * 100 : null;

  return {
    quantity,
    purchasePrice,
    investedValue,
    currentValue,
    deltaAmount,
    deltaPercent,
  };
}

function selectPrice(card: PokemonCard, preferredPriceType?: string) {
  const tcgplayerPrices = card.tcgplayer?.prices || null;
  const cardmarket = card.cardmarket?.prices || null;
  const preferredOrder = [
    preferredPriceType,
    "normal",
    "holofoil",
    "reverseHolofoil",
    "1stEditionHolofoil",
    "1stEditionNormal",
    "unlimitedHolofoil",
    "unlimitedNormal",
  ].filter(Boolean) as string[];

  if (tcgplayerPrices) {
    const availableTypes = Object.keys(tcgplayerPrices);
    const chosenType = preferredOrder.find((type) => availableTypes.includes(type)) || availableTypes[0];
    const selected = tcgplayerPrices[chosenType];

    if (selected) {
      const currentPrice =
        selected.market ??
        selected.mid ??
        selected.low ??
        selected.high ??
        selected.directLow ??
        null;

      return {
        priceType: chosenType,
        currency: "USD",
        currentPrice,
        sourceLabel: selected.market != null ? "TCGplayer Market" : "TCGplayer",
        metrics: {
          low: selected.low ?? null,
          mid: selected.mid ?? null,
          high: selected.high ?? null,
          market: selected.market ?? null,
          directLow: selected.directLow ?? null,
        } as Record<string, number | null>,
        updatedAt: card.tcgplayer?.updatedAt ?? null,
      };
    }
  }

  if (cardmarket) {
    const currentPrice = cardmarket.avg30 ?? cardmarket.trendPrice ?? cardmarket.averageSellPrice ?? null;

    return {
      priceType: preferredPriceType || "averageSellPrice",
      currency: "EUR",
      currentPrice,
      sourceLabel: cardmarket.avg30 != null ? "Cardmarket Avg30" : "Cardmarket",
      metrics: {
        averageSellPrice: cardmarket.averageSellPrice ?? null,
        lowPrice: cardmarket.lowPrice ?? null,
        trendPrice: cardmarket.trendPrice ?? null,
        avg1: cardmarket.avg1 ?? null,
        avg7: cardmarket.avg7 ?? null,
        avg30: cardmarket.avg30 ?? null,
      } as Record<string, number | null>,
      updatedAt: card.cardmarket?.updatedAt ?? null,
    };
  }

  return {
    priceType: preferredPriceType || "unavailable",
    currency: "USD",
    currentPrice: null,
    sourceLabel: "Unavailable",
    metrics: {},
    updatedAt: null,
  };
}

export function mapPokemonCardSummary(
  card: PokemonCard,
  ownership: OwnedCollectionEntry | null,
  history: PokemonHistoryPoint[],
): PokemonCardSummary {
  const pricing = selectPrice(card, ownership?.priceType);
  const ownershipMetrics = computeOwnershipMetrics(pricing.currentPrice, ownership);
  const setName = card.set?.name || "Unknown Set";
  const subtitle = [setName, card.rarity, card.number].filter(Boolean).join(" | ");

  return {
    kind: "api",
    id: card.id,
    title: ownership?.label || card.name,
    cardName: card.name,
    subtitle,
    image: card.images?.large || card.images?.small || "",
    thumbnail: card.images?.small || card.images?.large || "",
    setName,
    rarity: card.rarity || "",
    number: card.number || "",
    artist: card.artist || "",
    hp: card.hp || null,
    types: card.types || [],
    supertype: card.supertype || "",
    subtypes: card.subtypes || [],
    flavorText: card.flavorText || "",
    legalities: card.legalities || {},
    regulationMark: card.regulationMark || "",
    abilities: card.abilities || [],
    attacks: card.attacks || [],
    weaknesses: card.weaknesses || [],
    resistances: card.resistances || [],
    retreatCost: card.retreatCost || [],
    evolvesFrom: card.evolvesFrom || null,
    evolvesTo: card.evolvesTo || [],
    rules: card.rules || [],
    nationalPokedexNumbers: card.nationalPokedexNumbers || [],
    pricing,
    ownership,
    ownershipMetrics,
    history,
  };
}

async function fetchPokemonApi<T>(env: Env, path: string, params?: Record<string, string>): Promise<T> {
  const config = getPricingConfig(env);
  const url = new URL(`${config.pokemonTcgApiBaseUrl}${path}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  const headers = new Headers({
    "user-agent": config.userAgent,
  });

  if (config.pokemonTcgApiKey) {
    headers.set("X-Api-Key", config.pokemonTcgApiKey);
  }

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    throw new Error(`Pokemon TCG API request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export async function searchPokemonCards(env: Env, input: string): Promise<PokemonCardSummary[]> {
  const query = buildPokemonSearchQuery(input);

  if (!query) {
    return [];
  }

  const payload = await fetchPokemonApi<PokemonApiResponse<PokemonCard[]>>(env, "/cards", {
    q: query,
    pageSize: "12",
    orderBy: "-set.releaseDate",
    select: CARD_SELECT_FIELDS,
  });

  return (payload.data || []).map((card) => mapPokemonCardSummary(card, null, []));
}

async function fetchPokemonCard(env: Env, cardId: string): Promise<PokemonCard> {
  const payload = await fetchPokemonApi<PokemonApiResponse<PokemonCard>>(env, `/cards/${cardId}`, {
    select: CARD_SELECT_FIELDS,
  });

  return payload.data;
}

export async function getPokemonCardDetail(
  env: Env,
  cardId: string,
  ownership: OwnedCollectionEntry | null,
  forceRefresh = false,
): Promise<PokemonCardSummary> {
  const config = getPricingConfig(env);
  const latestSnapshot = await getLatestPokemonCardSnapshot(env.PRICING_DB, cardId, ownership?.priceType);
  const latestCapturedAt = latestSnapshot ? Date.parse(latestSnapshot.captured_at) : 0;
  const cacheFreshMs = config.pokemonTcgCacheTtlMinutes * 60_000;

  if (!forceRefresh && latestSnapshot && Date.now() - latestCapturedAt < cacheFreshMs) {
    const rawCard = JSON.parse(latestSnapshot.card_payload) as PokemonCard;
    const history = await getPokemonCardHistory(env.PRICING_DB, cardId, ownership?.priceType, 30);
    return mapPokemonCardSummary(rawCard, ownership, history);
  }

  const card = await fetchPokemonCard(env, cardId);
  const historyBefore = await getPokemonCardHistory(env.PRICING_DB, cardId, ownership?.priceType, 29);
  const summary = mapPokemonCardSummary(card, ownership, historyBefore);
  await writePokemonCardSnapshot(env.PRICING_DB, summary, card as unknown as Record<string, unknown>);
  const history = await getPokemonCardHistory(env.PRICING_DB, cardId, ownership?.priceType, 30);

  return {
    ...summary,
    history,
  };
}

export async function refreshTrackedPokemonCollection(env: Env, trackedEntries: OwnedCollectionEntry[]): Promise<void> {
  const uniqueEntries = new Map<string, OwnedCollectionEntry>();

  trackedEntries.forEach((entry) => {
    if (!entry.cardId) {
      return;
    }

    const key = `${entry.cardId}:${entry.priceType || "auto"}`;
    if (!uniqueEntries.has(key)) {
      uniqueEntries.set(key, entry);
    }
  });

  for (const entry of uniqueEntries.values()) {
    const latestSnapshot = await getLatestPokemonCardSnapshot(env.PRICING_DB, entry.cardId || "", entry.priceType);
    const refreshCutoff = getPricingConfig(env).pokemonTcgRefreshHours * 3_600_000;

    if (latestSnapshot && Date.now() - Date.parse(latestSnapshot.captured_at) < refreshCutoff) {
      continue;
    }

    await getPokemonCardDetail(env, entry.cardId || "", entry, true);
  }
}

export async function getStoredCollectionCards(env: Env): Promise<PokemonCardSummary[]> {
  const storedCards = await listCollectionCards(env.PRICING_DB);
  const results = await Promise.allSettled(
    storedCards.map((entry) =>
      getPokemonCardDetail(env, entry.cardId, entry as CollectionCardRecord, false),
    ),
  );

  return results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }

    console.error("Failed to hydrate stored collection card", result.reason);
    return [];
  });
}
