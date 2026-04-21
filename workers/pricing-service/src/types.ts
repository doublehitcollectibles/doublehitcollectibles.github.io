export interface PricingJob {
  query: string;
  normalizedQuery?: string;
  force?: boolean;
  reason: "admin_force" | "search_miss" | "stale_refresh" | "watchlist";
  enqueuedAt: string;
}

export interface Env {
  ADMIN_API_KEY?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  CACHE_TTL_MINUTES: string;
  STALE_TTL_HOURS: string;
  WATCHLIST_REFRESH_BATCH: string;
  LOCK_TTL_SECONDS: string;
  EBAY_SCRAPE_ENABLED?: string;
  EBAY_BASE_URL?: string;
  POKEMON_TCG_API_KEY?: string;
  POKEMON_TCG_API_BASE_URL?: string;
  POKEMON_TCG_CACHE_TTL_MINUTES: string;
  POKEMON_TCG_REFRESH_HOURS: string;
  USER_AGENT?: string;
  PRICE_CACHE: KVNamespace;
  PRICING_DB: D1Database;
  PRICING_QUEUE: Queue<PricingJob>;
  PRICING_LOCKS: DurableObjectNamespace;
}

export interface PricingConfig {
  adminApiKey?: string;
  adminUsername?: string;
  adminPasswordHash?: string;
  adminPassword?: string;
  sessionSecret?: string;
  cacheTtlMinutes: number;
  staleTtlHours: number;
  watchlistRefreshBatch: number;
  lockTtlSeconds: number;
  ebayScrapeEnabled: boolean;
  ebayBaseUrl: string;
  pokemonTcgApiKey?: string;
  pokemonTcgApiBaseUrl: string;
  pokemonTcgCacheTtlMinutes: number;
  pokemonTcgRefreshHours: number;
  userAgent: string;
}

export interface NormalizedCardQuery {
  raw: string;
  display: string;
  normalized: string;
  searchTerms: string[];
  cardNumber?: string;
}

export interface SoldComp {
  providerItemId: string;
  title: string;
  listingUrl: string;
  salePrice: number;
  shippingPrice: number;
  totalPrice: number;
  currency: string;
  soldAt: string | null;
  conditionBucket: "graded" | "raw" | "unknown";
  rawPayload: Record<string, unknown>;
}

export interface ProviderSnapshot {
  provider: string;
  sourceUrl: string;
  rawPayload?: Record<string, unknown>;
  comps: SoldComp[];
}

export interface PricingMetrics {
  marketPrice: number;
  averagePrice: number;
  medianPrice: number;
  trimmedMeanPrice: number;
  minPrice: number;
  maxPrice: number;
  sampleSize: number;
  soldFrom: string | null;
  soldTo: string | null;
}

export interface PricingSummary extends PricingMetrics {
  query: string;
  normalizedQuery: string;
  provider: string;
  sourceUrl: string;
  currency: string;
  lastRefreshedAt: string;
  comps: SoldComp[];
}

export interface CachedPricingRecord {
  freshUntil: string;
  staleUntil: string;
  summary: PricingSummary;
}

export interface CachedPricingHit {
  record: CachedPricingRecord;
  freshness: "fresh" | "stale";
}

export interface WatchlistEntry {
  id: number;
  query: string;
  normalizedQuery: string;
  refreshEveryHours: number;
  nextRefreshAt: string;
  lastRefreshedAt: string | null;
  active: boolean;
}

export interface OwnedCollectionEntry {
  source?: "api" | "custom";
  cardId?: string;
  label?: string;
  game?: string;
  itemNumber?: string;
  quantity?: number;
  purchasePrice?: number;
  purchaseDate?: string;
  priceType?: string;
  condition?: string;
  notes?: string;
  category?: string;
  series?: string;
  variant?: string;
  image?: string;
  artist?: string;
  description?: string;
  currency?: string;
  currentPrice?: number;
  priceSource?: string;
  updatedAt?: string;
}

export interface OwnedCollectionFile {
  collectionName?: string;
  currency?: string;
  cards: OwnedCollectionEntry[];
}

export interface CollectionCardRecord extends OwnedCollectionEntry {
  id: number;
  cardId?: string;
  ownerUsername?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomCollectionSummary {
  kind: "custom";
  id: string;
  title: string;
  cardName: string;
  subtitle: string;
  source?: "custom";
  game?: string;
  category?: string;
  series?: string;
  variant?: string;
  itemNumber?: string;
  image: string;
  thumbnail: string;
  setName: string;
  rarity: string;
  number: string;
  artist: string;
  hp: null;
  types: string[];
  supertype: string;
  subtypes: string[];
  flavorText: string;
  legalities: Record<string, string>;
  regulationMark: string;
  abilities: Array<Record<string, unknown>>;
  attacks: Array<Record<string, unknown>>;
  weaknesses: Array<Record<string, unknown>>;
  resistances: Array<Record<string, unknown>>;
  retreatCost: string[];
  evolvesFrom: null;
  evolvesTo: string[];
  rules: string[];
  nationalPokedexNumbers: number[];
  pricing: {
    priceType: string;
    currency: string;
    currentPrice: number | null;
    sourceLabel: string;
    metrics: Record<string, number | null>;
    updatedAt: string | null;
  };
  priceVariants: PokemonPriceVariant[];
  historySeries: PokemonPriceHistorySeries[];
  marketSourceUrl: string | null;
  ownership: OwnedCollectionEntry | null;
  ownershipMetrics: {
    quantity: number;
    purchasePrice: number | null;
    investedValue: number | null;
    currentValue: number | null;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
  history: PokemonHistoryPoint[];
}

export type CollectionDisplayCard = PokemonCardSummary | CustomCollectionSummary;

export interface PokemonHistoryPoint {
  capturedAt: string;
  marketPrice: number | null;
  currency: string;
  priceType: string;
  priceSource: string;
}

export interface PokemonPriceVariant {
  key: string;
  label: string;
  currency: string;
  currentPrice: number | null;
  sourceLabel: string;
  updatedAt: string | null;
  metrics: Record<string, number | null>;
}

export interface PokemonPriceHistorySeriesPoint {
  capturedAt: string;
  price: number;
}

export interface PokemonPriceHistorySeries {
  key: string;
  label: string;
  currency: string;
  sourceLabel: string;
  color: string;
  points: PokemonPriceHistorySeriesPoint[];
}

export interface PokemonCardSummary {
  kind: "api";
  id: string;
  title: string;
  cardName: string;
  subtitle: string;
  image: string;
  thumbnail: string;
  setName: string;
  rarity: string;
  number: string;
  artist: string;
  hp: string | null;
  types: string[];
  supertype: string;
  subtypes: string[];
  flavorText: string;
  legalities: Record<string, string>;
  regulationMark: string;
  abilities: Array<Record<string, unknown>>;
  attacks: Array<Record<string, unknown>>;
  weaknesses: Array<Record<string, unknown>>;
  resistances: Array<Record<string, unknown>>;
  retreatCost: string[];
  evolvesFrom: string | null;
  evolvesTo: string[];
  rules: string[];
  nationalPokedexNumbers: number[];
  pricing: {
    priceType: string;
    currency: string;
    currentPrice: number | null;
    sourceLabel: string;
    metrics: Record<string, number | null>;
    updatedAt: string | null;
  };
  priceVariants: PokemonPriceVariant[];
  historySeries: PokemonPriceHistorySeries[];
  marketSourceUrl: string | null;
  ownership: OwnedCollectionEntry | null;
  ownershipMetrics: {
    quantity: number;
    purchasePrice: number | null;
    investedValue: number | null;
    currentValue: number | null;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
  history: PokemonHistoryPoint[];
}
