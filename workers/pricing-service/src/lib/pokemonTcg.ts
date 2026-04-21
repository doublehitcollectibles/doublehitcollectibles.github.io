import { getPricingConfig } from "../config";
import { listCollectionCards } from "./collectionCardsDb";
import { getOwnedCollection } from "./ownedCollection";
import { getPokemonCardHistory, getLatestPokemonCardSnapshot, writePokemonCardSnapshot } from "./pokemonCollectionDb";
import { fetchPriceChartingPricing } from "./priceCharting";
import type {
  CollectionDisplayCard,
  CollectionCardRecord,
  CustomCollectionSummary,
  Env,
  OwnedCollectionEntry,
  PokemonCardSummary,
  PokemonHistoryPoint,
  PokemonPriceHistorySeries,
  PokemonPriceVariant,
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

interface StoredPricePayload {
  payloadVersion?: number;
  pricing?: PokemonCardSummary["pricing"];
  priceVariants?: PokemonPriceVariant[];
  historySeries?: PokemonPriceHistorySeries[];
  marketSourceUrl?: string | null;
  externalPricingChecked?: boolean;
}

const STORED_PRICE_PAYLOAD_VERSION = 4;

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

function firstNumericPrice(values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number" && !Number.isNaN(value)) {
      return value;
    }
  }

  return null;
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
    const orderedTypes = [
      ...preferredOrder.filter((type) => availableTypes.includes(type)),
      ...availableTypes.filter((type) => !preferredOrder.includes(type)),
    ];

    for (const chosenType of orderedTypes) {
      const selected = tcgplayerPrices[chosenType];

      if (!selected) {
        continue;
      }

      const currentPrice = firstNumericPrice([
        selected.market,
        selected.mid,
        selected.low,
        selected.high,
        selected.directLow,
      ]);

      if (currentPrice == null) {
        continue;
      }

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
    const currentPrice = firstNumericPrice([
      cardmarket.avg30,
      cardmarket.trendPrice,
      cardmarket.averageSellPrice,
      cardmarket.lowPrice,
    ]);

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

function toTitleLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildRawVariant(basePricing: PokemonCardSummary["pricing"]): PokemonPriceVariant | null {
  if (basePricing.currentPrice == null) {
    return null;
  }

  return {
    key: "raw",
    label: "Raw",
    currency: basePricing.currency,
    currentPrice: basePricing.currentPrice,
    sourceLabel: basePricing.sourceLabel,
    updatedAt: basePricing.updatedAt,
    metrics: basePricing.metrics,
  };
}

function parseUpdatedAt(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestSeriesCapturedAt(series: PokemonPriceHistorySeries | null | undefined): string | null {
  const points = Array.isArray(series?.points) ? series.points : [];

  if (!points.length) {
    return null;
  }

  return points[points.length - 1]?.capturedAt ?? null;
}

function enrichVariantUpdatedAt(
  variant: PokemonPriceVariant,
  historySeries: PokemonPriceHistorySeries[],
): PokemonPriceVariant {
  if (variant.updatedAt) {
    return variant;
  }

  const matchingSeries = historySeries.find((series) => series.key === variant.key);
  const inferredUpdatedAt = latestSeriesCapturedAt(matchingSeries);

  return inferredUpdatedAt
    ? {
        ...variant,
        updatedAt: inferredUpdatedAt,
      }
    : variant;
}

function buildPricingFromVariant(variant: PokemonPriceVariant): PokemonCardSummary["pricing"] {
  return {
    priceType: variant.key,
    currency: variant.currency,
    currentPrice: variant.currentPrice,
    sourceLabel: variant.sourceLabel,
    metrics: variant.metrics,
    updatedAt: variant.updatedAt,
  };
}

function buildSnapshotHistorySeries(
  history: PokemonHistoryPoint[],
  pricing: PokemonCardSummary["pricing"],
): PokemonPriceHistorySeries[] {
  const points = history
    .filter((point) => typeof point.marketPrice === "number" && !Number.isNaN(point.marketPrice) && point.marketPrice > 0)
    .map((point) => ({
      capturedAt: point.capturedAt,
      price: point.marketPrice as number,
    }));

  if (points.length < 2) {
    return [];
  }

  return [
    {
      key: "snapshot",
      label: toTitleLabel(pricing.priceType === "unavailable" ? "market" : pricing.priceType),
      currency: pricing.currency,
      sourceLabel: pricing.sourceLabel,
      color: "#ff8a4c",
      points,
    },
  ];
}

function normalizeDisplayText(value: unknown): string {
  return String(value ?? "").trim();
}

function buildCustomCollectibleSubtitle(entry: OwnedCollectionEntry): string {
  return [
    normalizeDisplayText(entry.game),
    normalizeDisplayText(entry.category),
    normalizeDisplayText(entry.series),
    normalizeDisplayText(entry.variant) || normalizeDisplayText(entry.itemNumber),
  ]
    .filter(Boolean)
    .join(" | ");
}

function mapCustomCollectionSummary(entry: CollectionCardRecord, fallbackCurrency: string): CustomCollectionSummary {
  const currentPrice = entry.currentPrice != null ? Number(entry.currentPrice) : null;
  const currency = entry.currency || fallbackCurrency || "USD";
  const title = normalizeDisplayText(entry.label) || "Custom Collection Item";
  const subtitle = buildCustomCollectibleSubtitle(entry) || "Manual collectible";

  return {
    kind: "custom",
    id: entry.cardId || `custom-${entry.id}`,
    title,
    cardName: title,
    subtitle,
    image: entry.image || "",
    thumbnail: entry.image || "",
    setName: entry.game || entry.series || "",
    rarity: entry.category || entry.variant || "",
    number: entry.itemNumber || "",
    artist: entry.artist || "",
    hp: null,
    types: [],
    supertype: entry.category || entry.game || "Collection Item",
    subtypes: [],
    flavorText: entry.description || "",
    legalities: {},
    regulationMark: "",
    abilities: [],
    attacks: [],
    weaknesses: [],
    resistances: [],
    retreatCost: [],
    evolvesFrom: null,
    evolvesTo: [],
    rules: [],
    nationalPokedexNumbers: [],
    pricing: {
      priceType: "manual",
      currency,
      currentPrice,
      sourceLabel: entry.priceSource || "Manual Entry",
      metrics: {},
      updatedAt: entry.updatedAt || null,
    },
    priceVariants:
      currentPrice != null
        ? [
            {
              key: "raw",
              label: "Raw",
              currency,
              currentPrice,
              sourceLabel: entry.priceSource || "Manual Entry",
              updatedAt: entry.updatedAt || null,
              metrics: {},
            },
          ]
        : [],
    historySeries: [],
    marketSourceUrl: null,
    ownership: entry,
    ownershipMetrics: computeOwnershipMetrics(currentPrice, entry),
    history: [],
  };
}

function normalizeStoredPricePayload(payload: string | null): StoredPricePayload | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as StoredPricePayload | PokemonCardSummary["pricing"];

    if (parsed && typeof parsed === "object" && ("currentPrice" in parsed || "priceType" in parsed)) {
      return {
        pricing: parsed as PokemonCardSummary["pricing"],
      };
    }

    return parsed && typeof parsed === "object" ? (parsed as StoredPricePayload) : null;
  } catch (error) {
    console.error("Failed to parse stored Pokemon price payload.", error);
    return null;
  }
}

function hasCurrentStoredPricePayload(storedPayload: StoredPricePayload | null): boolean {
  if (!storedPayload || storedPayload.payloadVersion !== STORED_PRICE_PAYLOAD_VERSION) {
    return false;
  }

  const hasExternalPricing = Boolean(
    storedPayload.externalPricingChecked ||
      (storedPayload.priceVariants && storedPayload.priceVariants.length) ||
      (storedPayload.historySeries && storedPayload.historySeries.length),
  );
  const hasResolvedVariantTimestamps =
    !storedPayload.priceVariants?.length || storedPayload.priceVariants.every((variant) => Boolean(variant.updatedAt));

  return hasExternalPricing && hasResolvedVariantTimestamps;
}

function buildPricingPresentation(
  basePricing: PokemonCardSummary["pricing"],
  history: PokemonHistoryPoint[],
  storedPayload?: StoredPricePayload | null,
) {
  const storedHistorySeries = storedPayload?.historySeries || [];
  const externalVariants = (storedPayload?.priceVariants || []).map((variant) => enrichVariantUpdatedAt(variant, storedHistorySeries));
  const baseRawVariant = buildRawVariant(basePricing);
  const externalRawVariant = externalVariants.find((variant) => variant.key === "raw") || null;
  const preferExternalRaw = Boolean(externalRawVariant);
  const rawVariant = preferExternalRaw ? externalRawVariant : baseRawVariant || externalRawVariant;
  const otherVariants = externalVariants.filter((variant) => variant.key !== "raw");
  const priceVariants = [rawVariant, ...otherVariants].filter(Boolean) as PokemonPriceVariant[];

  const pricing =
    rawVariant && (preferExternalRaw || basePricing.currentPrice == null)
      ? buildPricingFromVariant(rawVariant)
      : basePricing;
  const snapshotHistorySeries = buildSnapshotHistorySeries(history, pricing);
  const rawHistorySeries =
    preferExternalRaw && storedHistorySeries.find((series) => series.key === "raw")
      ? [storedHistorySeries.find((series) => series.key === "raw") as PokemonPriceHistorySeries]
      : snapshotHistorySeries;
  const supplementalHistorySeries = storedHistorySeries.filter((series) => series.key !== "raw");
  const historySeries = [...rawHistorySeries, ...supplementalHistorySeries];

  return {
    pricing,
    priceVariants,
    historySeries,
    marketSourceUrl: storedPayload?.marketSourceUrl ?? null,
  };
}

export function mapPokemonCardSummary(
  card: PokemonCard,
  ownership: OwnedCollectionEntry | null,
  history: PokemonHistoryPoint[],
  storedPayload?: StoredPricePayload | null,
): PokemonCardSummary {
  const basePricing = selectPrice(card, ownership?.priceType);
  const { pricing, priceVariants, historySeries, marketSourceUrl } = buildPricingPresentation(basePricing, history, storedPayload);
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
    priceVariants,
    historySeries,
    marketSourceUrl,
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

  const cards = payload.data || [];

  const summaries = await Promise.all(
    cards.map(async (card) => {
      const basePricing = selectPrice(card);
      const fallbackPricing = await fetchPriceChartingPricing(env, {
        name: card.name,
        number: card.number,
        set: card.set,
        preferredPriceType: basePricing.priceType,
      }).catch(() => null);

      return mapPokemonCardSummary(
        card,
        null,
        [],
        fallbackPricing
          ? {
              pricing: basePricing,
              priceVariants: fallbackPricing.priceVariants,
              historySeries: fallbackPricing.historySeries,
              marketSourceUrl: fallbackPricing.sourceUrl,
              externalPricingChecked: true,
            }
          : {
              pricing: basePricing,
              externalPricingChecked: true,
            },
      );
    }),
  );

  return summaries;
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
  const storedPayload = normalizeStoredPricePayload(latestSnapshot?.price_payload ?? null);

  if (
    !forceRefresh &&
    latestSnapshot &&
    Date.now() - latestCapturedAt < cacheFreshMs &&
    hasCurrentStoredPricePayload(storedPayload)
  ) {
    const rawCard = JSON.parse(latestSnapshot.card_payload) as PokemonCard;
    const history = await getPokemonCardHistory(env.PRICING_DB, cardId, ownership?.priceType, 30);
    return mapPokemonCardSummary(rawCard, ownership, history, storedPayload);
  }

  const card = await fetchPokemonCard(env, cardId);
  const basePricing = selectPrice(card, ownership?.priceType);
  const externalPricing = await fetchPriceChartingPricing(env, {
    name: card.name,
    number: card.number,
    set: card.set,
    preferredPriceType: basePricing.priceType,
  }).catch((error) => {
    console.error("PriceCharting enrichment failed.", error);
    return null;
  });
  const historyBefore = await getPokemonCardHistory(env.PRICING_DB, cardId, ownership?.priceType, 29);
  const summary = mapPokemonCardSummary(
    card,
    ownership,
    historyBefore,
    externalPricing
      ? {
          pricing: basePricing,
          priceVariants: externalPricing.priceVariants,
          historySeries: externalPricing.historySeries,
          marketSourceUrl: externalPricing.sourceUrl,
          externalPricingChecked: true,
        }
      : {
          pricing: basePricing,
          externalPricingChecked: true,
        },
  );
  await writePokemonCardSnapshot(env.PRICING_DB, summary, card as unknown as Record<string, unknown>);
  const history = await getPokemonCardHistory(env.PRICING_DB, cardId, ownership?.priceType, 30);

  return {
    ...summary,
    history,
    historySeries: summary.historySeries.length ? summary.historySeries : buildSnapshotHistorySeries(history, summary.pricing),
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

export async function getStoredCollectionCards(env: Env): Promise<CollectionDisplayCard[]> {
  const storedCards = await listCollectionCards(env.PRICING_DB);
  const results = await Promise.allSettled(
    storedCards.map((entry) => {
      if (entry.source === "custom") {
        return Promise.resolve(mapCustomCollectionSummary(entry, getOwnedCollection().currency ?? "USD"));
      }

      return getPokemonCardDetail(env, entry.cardId || "", entry as CollectionCardRecord, false);
    }),
  );

  return results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }

    console.error("Failed to hydrate stored collection card", result.reason);
    return [];
  });
}
