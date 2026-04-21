import { getPricingConfig } from "../config";
import type {
  Env,
  PokemonPriceHistorySeries,
  PokemonPriceVariant,
} from "../types";

interface PriceChartingLookupCard {
  name: string;
  number?: string;
  preferredPriceType?: string;
  set?: {
    name?: string;
  };
}

interface PriceChartingProductPage {
  sourceUrl: string;
  html: string;
}

export interface PriceChartingSearchResult {
  id: string;
  sourceUrl: string;
  title: string;
  setName: string;
  thumbnail: string;
  currentPrice: number | null;
}

export interface PriceChartingPricing {
  sourceUrl: string;
  priceVariants: PokemonPriceVariant[];
  historySeries: PokemonPriceHistorySeries[];
}

export interface PriceChartingCollectibleDetail extends PriceChartingPricing {
  id: string;
  title: string;
  game: string;
  category: string;
  series: string;
  itemNumber: string;
  description: string;
  image: string;
  thumbnail: string;
  setName: string;
}

const PRICECHARTING_BASE_URL = "https://www.pricecharting.com";
const PRICECHARTING_SEARCH_URL = `${PRICECHARTING_BASE_URL}/search-products`;
const DEFAULT_HEADERS: Record<string, string> = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

function normalizeQueryPart(value: string | undefined): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string | undefined): string {
  return String(value || "")
    .replace(/&#39;/g, "'")
    .replace(/&#43;/g, "+")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeForMatch(value: string | undefined): string {
  return normalizeQueryPart(decodeHtmlEntities(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseUsdValue(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const numeric = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function stripHtmlTags(value: string | undefined): string {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPriceChartingCollectionId(sourceUrl: string): string {
  try {
    const pathname = new URL(sourceUrl).pathname;
    return `pricecharting:${pathname}`;
  } catch {
    return `pricecharting:${String(sourceUrl || "").trim()}`;
  }
}

export function isPriceChartingCollectionId(value: string | undefined): boolean {
  return /^pricecharting:(\/game\/|https:\/\/www\.pricecharting\.com\/game\/)/i.test(String(value || "").trim());
}

export function priceChartingCollectionIdToUrl(value: string | undefined): string | null {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  if (/^https:\/\/www\.pricecharting\.com\/game\//i.test(normalized)) {
    return normalized.split("?")[0];
  }

  if (!isPriceChartingCollectionId(normalized)) {
    return null;
  }

  const path = normalized.replace(/^pricecharting:/i, "");
  return new URL(path, PRICECHARTING_BASE_URL).toString().split("?")[0];
}

function extractThumbnailFromHtml(html: string): string {
  const dialogImageMatch = html.match(/<div id="js-dialog-large-image"[\s\S]*?<img[^>]+src=['"]([^'"]+)['"]/i);
  const metaImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
  return decodeHtmlEntities(dialogImageMatch?.[1] || metaImageMatch?.[1] || "");
}

function extractTitleSegments(html: string): { itemTitle: string; setName: string; categoryLabel: string } {
  const titleMatch = html.match(/<title>\s*([^<]+?)\s*<\/title>/i);
  const rawTitle = normalizeQueryPart(decodeHtmlEntities(titleMatch?.[1]));
  const [rawItemTitle = "", rawSetName = "", rawCategoryLabel = ""] = rawTitle.split("|").map((segment) => normalizeQueryPart(segment));

  return {
    itemTitle: normalizeQueryPart(rawItemTitle.replace(/\s+prices?$/i, "")),
    setName: rawSetName,
    categoryLabel: rawCategoryLabel,
  };
}

function extractDetailValue(html: string, label: string): string {
  const pattern = new RegExp(
    `<tr>[\\s\\S]*?<td[^>]*>\\s*${escapeRegex(label)}\\s*:?\\s*<\\/td>[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>[\\s\\S]*?<\\/tr>`,
    "i",
  );
  const match = html.match(pattern);
  const cleaned = stripHtmlTags(match?.[1]);

  if (!cleaned || cleaned.toLowerCase() === "none" || cleaned.toLowerCase() === "n/a") {
    return "";
  }

  return cleaned;
}

function extractBreadcrumbCategory(html: string): string {
  const matches = Array.from(html.matchAll(/<a href="\/category\/[^"]+">\s*([^<]+?)\s*<\/a>/gi));
  return normalizeQueryPart(decodeHtmlEntities(matches[matches.length - 1]?.[1]));
}

function normalizeGameName(setName: string, breadcrumbCategory: string): string {
  const normalizedCategory = normalizeQueryPart(breadcrumbCategory);
  const normalizedSet = normalizeQueryPart(setName);

  if (!normalizedSet) {
    return "";
  }

  if (/other tcg cards/i.test(normalizedCategory)) {
    return normalizeQueryPart(normalizedSet.split(" ")[0]);
  }

  if (/cards?$/i.test(normalizedCategory)) {
    return normalizeQueryPart(normalizedCategory.replace(/\s*cards?$/i, ""));
  }

  return normalizeQueryPart(normalizedSet.split(" ")[0]);
}

function normalizeSeriesName(setName: string, game: string): string {
  const normalizedSet = normalizeQueryPart(setName);
  const normalizedGame = normalizeQueryPart(game);

  if (!normalizedSet) {
    return "";
  }

  if (normalizedGame && normalizedSet.toLowerCase().startsWith(`${normalizedGame.toLowerCase()} `)) {
    return normalizedSet.slice(normalizedGame.length).trim();
  }

  return normalizedSet;
}

export function extractCollectiblePageMetadata(sourceUrl: string, html: string) {
  const titleSegments = extractTitleSegments(html);
  const rawSetName =
    normalizeQueryPart(extractDetailValue(html, "Set")) ||
    normalizeQueryPart(extractDetailValue(html, "Platform")) ||
    normalizeQueryPart(extractDetailValue(html, "Series")) ||
    normalizeQueryPart(titleSegments.setName) ||
    normalizeQueryPart(decodeHtmlEntities(html.match(/<meta itemprop="operatingSystem" content="([^"]+)"/i)?.[1]));
  const breadcrumbCategory = extractBreadcrumbCategory(html) || normalizeQueryPart(titleSegments.categoryLabel);
  const game = normalizeGameName(rawSetName, breadcrumbCategory);
  const itemTitle =
    normalizeQueryPart(decodeHtmlEntities(html.match(/<meta itemprop="name" content="([^"]+)"/i)?.[1])) ||
    titleSegments.itemTitle;
  const image = extractThumbnailFromHtml(html);

  return {
    title: itemTitle,
    game,
    category: normalizeQueryPart(extractDetailValue(html, "Genre")) || "Collectible",
    series: normalizeSeriesName(rawSetName, game),
    itemNumber: normalizeQueryPart(extractDetailValue(html, "Card Number")).replace(/^#/, ""),
    description: normalizeQueryPart(extractDetailValue(html, "Description")),
    image,
    setName: rawSetName,
  };
}

export function parseSearchResultRows(html: string): PriceChartingSearchResult[] {
  const rowPattern = /<tr id="product-\d+"[\s\S]*?<\/tr>/gi;
  const results: PriceChartingSearchResult[] = [];

  for (const match of html.matchAll(rowPattern)) {
    const row = match[0];
    const linkMatch = row.match(/<td class="title">[\s\S]*?<a href="(https:\/\/www\.pricecharting\.com\/game\/[^"]+)"[^>]*>\s*([\s\S]*?)<\/a>/i);
    const setMatch = row.match(/<div class="console-in-title">[\s\S]*?<a [^>]*>\s*([\s\S]*?)<\/a>/i);
    const imageMatch = row.match(/<img[^>]+src="([^"]+)"/i);
    const priceMatch = row.match(/class="price numeric used_price"[\s\S]*?<span class="js-price">\s*\$([0-9,]+(?:\.[0-9]+)?)<\/span>/i);

    if (!linkMatch?.[1] || !linkMatch?.[2]) {
      continue;
    }

    const sourceUrl = decodeHtmlEntities(linkMatch[1]).split("?")[0];
    results.push({
      id: buildPriceChartingCollectionId(sourceUrl),
      sourceUrl,
      title: normalizeQueryPart(stripHtmlTags(linkMatch[2])),
      setName: normalizeQueryPart(stripHtmlTags(setMatch?.[1])),
      thumbnail: decodeHtmlEntities(imageMatch?.[1] || ""),
      currentPrice: parseUsdValue(priceMatch?.[1]),
    });
  }

  return results;
}

function extractPriceFromCell(html: string, cellId: string): number | null {
  const pattern = new RegExp(
    `id="${escapeRegex(cellId)}"[\\s\\S]*?<span class="price js-price">\\s*\\$([0-9,]+(?:\\.[0-9]+)?)`,
    "i",
  );
  const match = html.match(pattern);
  return parseUsdValue(match?.[1]);
}

function extractPriceChangeFromCell(html: string, cellId: string): number | null {
  const pattern = new RegExp(
    `id="${escapeRegex(cellId)}"[\\s\\S]*?<span class="change"[^>]*>\\s*(?:&#43;|\\+|-)?\\s*<span class="js-price">\\$([0-9,]+(?:\\.[0-9]+)?)<\\/span>`,
    "i",
  );
  const cellPattern = new RegExp(`id="${escapeRegex(cellId)}"[\\s\\S]*?<span class="change"[^>]*>([\\s\\S]*?)<\\/span>`, "i");
  const cellMatch = html.match(cellPattern);
  const amountMatch = html.match(pattern);
  const amount = parseUsdValue(amountMatch?.[1]);

  if (amount == null || !cellMatch?.[1]) {
    return null;
  }

  const rawChangeMarkup = decodeHtmlEntities(cellMatch[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  if (rawChangeMarkup.startsWith("-")) {
    return -amount;
  }

  if (rawChangeMarkup.startsWith("+") || rawChangeMarkup.startsWith(amountMatch?.[1] ? `$${amountMatch[1]}` : "")) {
    return amount;
  }

  return amount;
}

function buildDailyChangeMetrics(currentPrice: number | null, changeAmount: number | null): Record<string, number | null> {
  if (currentPrice == null || changeAmount == null) {
    return {};
  }

  const previousPrice = currentPrice - changeAmount;
  const changePercent = previousPrice > 0 ? (changeAmount / previousPrice) * 100 : null;

  return {
    dailyChangeAmount: changeAmount,
    dailyChangePercent: changePercent,
  };
}

function parseChartData(html: string): Record<string, Array<[number, number]>> {
  const match = html.match(/VGPC\.chart_data = (\{.*?\});/s);

  if (!match) {
    return {};
  }

  try {
    return JSON.parse(match[1]) as Record<string, Array<[number, number]>>;
  } catch (error) {
    console.error("Failed to parse PriceCharting chart data.", error);
    return {};
  }
}

function buildSeriesPoints(points: Array<[number, number]> | undefined) {
  return (points || [])
    .filter((point) => Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number" && point[1] > 0)
    .map(([timestamp, cents]) => ({
      capturedAt: new Date(timestamp).toISOString(),
      price: cents / 100,
    }));
}

function latestSeriesCapturedAt(points: Array<{ capturedAt: string; price: number }>): string | null {
  if (!points.length) {
    return null;
  }

  return points[points.length - 1]?.capturedAt ?? null;
}

function latestSeriesPrice(points: Array<{ capturedAt: string; price: number }>): number | null {
  if (!points.length) {
    return null;
  }

  return points[points.length - 1]?.price ?? null;
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  return queries.filter((query) => {
    const normalized = normalizeQueryPart(query).toLowerCase();

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

const SEALED_SEARCH_HINTS = [
  "blister",
  "booster",
  "box",
  "bundle",
  "collection",
  "deck",
  "display",
  "elite trainer",
  "etb",
  "pack",
  "starter",
  "tin",
];

const CARD_VARIANT_SEARCH_HINTS = [
  "metal",
  "hyper rare",
  "special illustration rare",
  "illustration rare",
  "ultra rare",
  "full art",
];

function buildExpandedSearchQueries(query: string): string[] {
  const normalizedQuery = normalizeQueryPart(query);
  const normalizedMatch = normalizeForMatch(query);

  if (!normalizedQuery) {
    return [];
  }

  const looksLikeSealedSearch = SEALED_SEARCH_HINTS.some((hint) => normalizedMatch.includes(hint));
  const hasNumberToken = /\b\d+[a-z]?\b/.test(normalizedMatch);
  const queries = [normalizedQuery];

  if (looksLikeSealedSearch || !hasNumberToken) {
    return queries;
  }

  CARD_VARIANT_SEARCH_HINTS.forEach((hint) => {
    if (!normalizedMatch.includes(hint)) {
      queries.push(`${normalizedQuery} ${hint}`);
    }
  });

  return dedupeQueries(queries);
}

function toVariantHints(priceType: string | undefined): string[] {
  const normalized = normalizeForMatch(priceType);

  if (!normalized || normalized === "normal" || normalized === "unavailable") {
    return [];
  }

  if (normalized.includes("reverse")) {
    return ["reverse holo", "reverse holofoil"];
  }

  if (normalized.includes("1st edition")) {
    return normalized.includes("holo") ? ["1st edition holo"] : ["1st edition"];
  }

  if (normalized.includes("holo")) {
    return ["holo", "holofoil"];
  }

  return [normalized];
}

function buildSearchQueries(card: PriceChartingLookupCard): string[] {
  const name = normalizeQueryPart(card.name);
  const number = normalizeQueryPart(card.number);
  const setName = normalizeQueryPart(card.set?.name);
  const variantHints = toVariantHints(card.preferredPriceType);

  return dedupeQueries([
    ...variantHints.flatMap((hint) => [
      `${name} ${hint} ${number} ${setName}`,
      `${name} ${hint} ${number}`,
      `${name} ${hint} ${setName}`,
    ]),
    `${name} ${number} ${setName}`,
    `${name} ${number}`,
    `${name} ${setName}`,
    name,
  ]);
}

async function fetchHtml(env: Env, url: string): Promise<Response> {
  const config = getPricingConfig(env);
  const headers = new Headers(DEFAULT_HEADERS);
  headers.set("user-agent", config.userAgent);
  return fetch(url, {
    headers,
    redirect: "follow",
  });
}

function firstGamePath(html: string): string | null {
  const match = html.match(/href="(\/game\/[^"?]+(?:\?[^"]*)?)"/i);
  return match?.[1] ? new URL(decodeHtmlEntities(match[1]), PRICECHARTING_BASE_URL).toString() : null;
}

function isProductPageHtml(html: string): boolean {
  return /VGPC\.chart_data\s*=/.test(html) || /id="used_price"/i.test(html) || /id="manual_only_price"/i.test(html);
}

interface PriceChartingSearchCandidate {
  url: string;
  title: string;
  setName: string;
}

const IGNORED_TITLE_TOKENS = new Set([
  "card",
  "cards",
  "english",
  "holo",
  "holofoil",
  "japanese",
  "pokemon",
  "promo",
  "promos",
  "reverse",
  "sv",
  "swsh",
  "xy",
]);

function parseSearchCandidates(html: string): PriceChartingSearchCandidate[] {
  const candidates: PriceChartingSearchCandidate[] = [];
  const rowPattern =
    /<tr id="product-\d+"[\s\S]*?<td class="title">[\s\S]*?<a href="(https:\/\/www\.pricecharting\.com\/game\/[^"]+)"[^>]*>\s*([^<]+?)<\/a>[\s\S]*?<div class="console-in-title">[\s\S]*?<a href="\/console\/[^"]+">\s*([^<]+?)\s*<\/a>/gi;

  for (const match of html.matchAll(rowPattern)) {
    const url = decodeHtmlEntities(match[1]).split("?")[0];
    const title = normalizeQueryPart(decodeHtmlEntities(match[2]));
    const setName = normalizeQueryPart(decodeHtmlEntities(match[3]));

    if (!url || !title) {
      continue;
    }

    candidates.push({ url, title, setName });
  }

  return candidates;
}

function includesAllTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

function overlapCount(tokens: string[], haystack: string): number {
  return tokens.filter((token) => haystack.includes(token)).length;
}

function tokenizeNormalized(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

function buildSetAliasTokens(normalizedSet: string): string[] {
  const aliases = new Set<string>();

  if (!normalizedSet) {
    return [];
  }

  if (normalizedSet.includes("black star promo")) {
    aliases.add("promo");
    aliases.add("promos");
    aliases.add("pokemon promo");
  }

  if (normalizedSet.includes("trainer gallery")) {
    aliases.add("trainer gallery");
  }

  if (normalizedSet.includes("galarian gallery")) {
    aliases.add("galarian gallery");
  }

  return Array.from(aliases);
}

function isExactNameNumberMatch(
  normalizedTitle: string,
  normalizedName: string,
  normalizedNumber: string,
): boolean {
  if (!normalizedName || !normalizedNumber) {
    return false;
  }

  return normalizedTitle === `${normalizedName} ${normalizedNumber}`.trim();
}

function normalizeCandidateUrl(candidateUrl: string): string {
  try {
    const pathname = new URL(decodeHtmlEntities(candidateUrl)).pathname;
    return normalizeForMatch(pathname.replace(/^\/game\//i, "").replace(/\//g, " "));
  } catch {
    return normalizeForMatch(candidateUrl);
  }
}

function extraTitleTokenPenalty(
  normalizedTitle: string,
  nameTokens: string[],
  normalizedNumber: string,
  variantHints: string[],
): number {
  const titleTokens = tokenizeNormalized(normalizedTitle);
  const allowedTokens = new Set<string>([
    ...nameTokens,
    normalizedNumber,
    ...variantHints.flatMap((hint) => tokenizeNormalized(hint)),
  ]);
  let penalty = 0;

  for (const token of titleTokens) {
    if (!token || allowedTokens.has(token) || IGNORED_TITLE_TOKENS.has(token)) {
      continue;
    }

    penalty += 18;
  }

  return penalty;
}

function scoreCandidate(card: PriceChartingLookupCard, candidate: PriceChartingSearchCandidate): number {
  const normalizedName = normalizeForMatch(card.name);
  const normalizedNumber = normalizeForMatch(card.number);
  const normalizedSet = normalizeForMatch(card.set?.name);
  const normalizedTitle = normalizeForMatch(candidate.title);
  const normalizedCandidateSet = normalizeForMatch(candidate.setName);
  const normalizedCandidateUrl = normalizeCandidateUrl(candidate.url);
  const normalizedCandidateContext = `${normalizedCandidateSet} ${normalizedCandidateUrl}`.trim();
  const variantHints = toVariantHints(card.preferredPriceType).map((hint) => normalizeForMatch(hint));
  const nameTokens = normalizedName.split(" ").filter(Boolean);
  const setTokens = normalizedSet.split(" ").filter(Boolean);
  const setAliasTokens = buildSetAliasTokens(normalizedSet);
  let score = 0;

  if (normalizedNumber) {
    if (new RegExp(`(^|\\s)${escapeRegex(normalizedNumber)}($|\\s)`).test(normalizedTitle)) {
      score += 90;
    } else if (candidate.url.toLowerCase().includes(`-${normalizedNumber}`)) {
      score += 80;
    }
  }

  if (normalizedName) {
    if (normalizedTitle === normalizedName || normalizedTitle.startsWith(`${normalizedName} `)) {
      score += 90;
    } else if (includesAllTokens(normalizedTitle, nameTokens)) {
      score += 72;
    } else {
      score += overlapCount(nameTokens, normalizedTitle) * 12;
    }
  }

  if (isExactNameNumberMatch(normalizedTitle, normalizedName, normalizedNumber)) {
    score += 45;
  }

  if (normalizedSet) {
    if (normalizedCandidateContext === normalizedSet || normalizedCandidateContext.includes(normalizedSet)) {
      score += 70;
    } else if (includesAllTokens(normalizedCandidateContext, setTokens)) {
      score += 54;
    } else {
      score += overlapCount(setTokens, normalizedCandidateContext) * 9;
    }

    if (setAliasTokens.some((alias) => normalizedCandidateContext.includes(alias))) {
      score += 36;
    }
  }

  if (variantHints.length) {
    const matchesVariant = variantHints.some((hint) => normalizedTitle.includes(hint));
    score += matchesVariant ? 28 : -14;
  } else if (/\b(reverse holo|reverse holofoil|1st edition|holofoil|holo)\b/.test(normalizedTitle)) {
    score -= 12;
  }

  score -= extraTitleTokenPenalty(normalizedTitle, nameTokens, normalizedNumber, variantHints);

  return score;
}

function bestCandidateUrl(html: string, card: PriceChartingLookupCard): string | null {
  const candidates = parseSearchCandidates(html);

  if (!candidates.length) {
    return null;
  }

  const best = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(card, candidate),
    }))
    .sort((left, right) => right.score - left.score)[0];

  return best?.candidate.url ?? null;
}

function parseProductPageCandidate(
  sourceUrl: string,
  html: string,
): PriceChartingSearchCandidate | null {
  const titleMatch = html.match(/<title>\s*([^<]+?)\s*<\/title>/i);
  const rawTitle = normalizeQueryPart(decodeHtmlEntities(titleMatch?.[1]));

  if (!rawTitle) {
    return null;
  }

  const [titleSegment = "", setSegment = ""] = rawTitle.split("|").map((segment) => normalizeQueryPart(segment));
  const title = normalizeQueryPart(titleSegment.replace(/\s+prices?$/i, ""));
  const setName = normalizeQueryPart(setSegment);

  if (!title) {
    return null;
  }

  return {
    url: sourceUrl,
    title,
    setName,
  };
}

function productPageMatchesCard(
  card: PriceChartingLookupCard,
  sourceUrl: string,
  html: string,
): boolean {
  const candidate = parseProductPageCandidate(sourceUrl, html);

  if (!candidate) {
    return false;
  }

  const normalizedName = normalizeForMatch(card.name);
  const normalizedNumber = normalizeForMatch(card.number);
  const normalizedTitle = normalizeForMatch(candidate.title);
  const variantHints = toVariantHints(card.preferredPriceType).map((hint) => normalizeForMatch(hint));
  const nameTokens = tokenizeNormalized(normalizedName);
  const score = scoreCandidate(card, candidate);

  if (normalizedName) {
    if (!includesAllTokens(normalizedTitle, nameTokens)) {
      return false;
    }
  }

  if (extraTitleTokenPenalty(normalizedTitle, nameTokens, normalizedNumber, variantHints) > 0) {
    return false;
  }

  if (normalizedNumber) {
    const hasNumber = new RegExp(`(^|\\s)${escapeRegex(normalizedNumber)}($|\\s)`).test(normalizedTitle);

    if (!hasNumber && !candidate.url.toLowerCase().includes(`-${normalizedNumber}`)) {
      return false;
    }
  }

  return score >= 110;
}

async function resolveProductPage(env: Env, card: PriceChartingLookupCard): Promise<PriceChartingProductPage | null> {
  const queries = buildSearchQueries(card);

  for (const query of queries) {
    const searchUrl = new URL(PRICECHARTING_SEARCH_URL);
    searchUrl.searchParams.set("type", "prices");
    searchUrl.searchParams.set("q", query);

    const response = await fetchHtml(env, searchUrl.toString());

    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const finalUrl = (response.url || searchUrl.toString()).split("?")[0];

    if ((finalUrl.includes("/game/") || isProductPageHtml(html)) && productPageMatchesCard(card, finalUrl, html)) {
      return {
        sourceUrl: finalUrl,
        html,
      };
    }

    const fallbackUrl = bestCandidateUrl(html, card) || firstGamePath(html);

    if (!fallbackUrl) {
      continue;
    }

    const fallbackResponse = await fetchHtml(env, fallbackUrl);

    if (!fallbackResponse.ok) {
      continue;
    }

    const fallbackHtml = await fallbackResponse.text();
    const fallbackFinalUrl = (fallbackResponse.url || fallbackUrl).split("?")[0];

    if (!productPageMatchesCard(card, fallbackFinalUrl, fallbackHtml)) {
      continue;
    }

    return {
      sourceUrl: fallbackFinalUrl,
      html: fallbackHtml,
    };
  }

  return null;
}

async function resolveProductPageFromIdentifier(env: Env, value: string): Promise<PriceChartingProductPage | null> {
  const sourceUrl = priceChartingCollectionIdToUrl(value) || value;

  if (!/^https:\/\/www\.pricecharting\.com\/game\//i.test(String(sourceUrl || "").trim())) {
    return null;
  }

  const response = await fetchHtml(env, sourceUrl);

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const finalUrl = (response.url || sourceUrl).split("?")[0];

  if (!finalUrl.includes("/game/") || !isProductPageHtml(html)) {
    return null;
  }

  return {
    sourceUrl: finalUrl,
    html,
  };
}

function buildPriceChartingPricingFromProductPage(productPage: PriceChartingProductPage): PriceChartingPricing | null {
  const chartData = parseChartData(productPage.html);
  const rawPoints = buildSeriesPoints(chartData.used);
  const psaPoints = buildSeriesPoints(chartData.manualonly?.length ? chartData.manualonly : chartData.graded);

  const rawPrice = extractPriceFromCell(productPage.html, "used_price") ?? latestSeriesPrice(rawPoints);
  const rawChangeAmount = extractPriceChangeFromCell(productPage.html, "used_price");
  const psa10Price =
    extractPriceFromCell(productPage.html, "manual_only_price") ??
    extractPriceFromCell(productPage.html, "graded_price") ??
    latestSeriesPrice(psaPoints);
  const psa10CellId = /id="manual_only_price"/i.test(productPage.html) ? "manual_only_price" : "graded_price";
  const psa10ChangeAmount = extractPriceChangeFromCell(productPage.html, psa10CellId);

  const priceVariants: PokemonPriceVariant[] = [
    {
      key: "raw",
      label: "Raw",
      currency: "USD",
      currentPrice: rawPrice,
      sourceLabel: "PriceCharting Ungraded",
      updatedAt: latestSeriesCapturedAt(rawPoints),
      metrics: buildDailyChangeMetrics(rawPrice, rawChangeAmount),
    },
    {
      key: "psa10",
      label: "PSA 10",
      currency: "USD",
      currentPrice: psa10Price,
      sourceLabel: "PriceCharting PSA 10",
      updatedAt: latestSeriesCapturedAt(psaPoints),
      metrics: buildDailyChangeMetrics(psa10Price, psa10ChangeAmount),
    },
  ].filter((variant) => variant.currentPrice != null);

  const historySeries: PokemonPriceHistorySeries[] = [
    rawPoints.length
      ? {
          key: "raw",
          label: "Raw",
          currency: "USD",
          sourceLabel: "PriceCharting Ungraded",
          color: "#4aa8ff",
          points: rawPoints,
        }
      : null,
    psaPoints.length
      ? {
          key: "psa10",
          label: "PSA 10",
          currency: "USD",
          sourceLabel: "PriceCharting PSA 10",
          color: "#ffd84a",
          points: psaPoints,
        }
      : null,
  ].filter(Boolean) as PokemonPriceHistorySeries[];

  if (!priceVariants.length && !historySeries.length) {
    return null;
  }

  return {
    sourceUrl: productPage.sourceUrl,
    priceVariants,
    historySeries,
  };
}

function buildSearchResultFromProductPage(productPage: PriceChartingProductPage): PriceChartingSearchResult | null {
  const metadata = extractCollectiblePageMetadata(productPage.sourceUrl, productPage.html);
  const pricing = buildPriceChartingPricingFromProductPage(productPage);
  const rawVariant = pricing?.priceVariants.find((variant) => variant.key === "raw") || pricing?.priceVariants[0] || null;

  if (!metadata.title) {
    return null;
  }

  return {
    id: buildPriceChartingCollectionId(productPage.sourceUrl),
    sourceUrl: productPage.sourceUrl,
    title: metadata.title,
    setName: metadata.setName,
    thumbnail: metadata.image,
    currentPrice: rawVariant?.currentPrice ?? null,
  };
}

export async function searchPriceChartingProducts(
  env: Env,
  query: string,
  limit = 12,
): Promise<PriceChartingSearchResult[]> {
  const normalizedQuery = normalizeQueryPart(query);

  if (!normalizedQuery) {
    return [];
  }

  const results: PriceChartingSearchResult[] = [];
  const seen = new Set<string>();
  const searchQueries = buildExpandedSearchQueries(normalizedQuery);

  for (const searchQuery of searchQueries) {
    if (results.length >= Math.max(1, limit)) {
      break;
    }

    const searchUrl = new URL(PRICECHARTING_SEARCH_URL);
    searchUrl.searchParams.set("type", "prices");
    searchUrl.searchParams.set("q", searchQuery);

    const response = await fetchHtml(env, searchUrl.toString());

    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const finalUrl = (response.url || searchUrl.toString()).split("?")[0];
    const queryResults =
      finalUrl.includes("/game/") || isProductPageHtml(html)
        ? (() => {
            const directResult = buildSearchResultFromProductPage({
              sourceUrl: finalUrl,
              html,
            });

            return directResult ? [directResult] : [];
          })()
        : parseSearchResultRows(html);

    for (const result of queryResults) {
      if (!result?.id || seen.has(result.id)) {
        continue;
      }

      seen.add(result.id);
      results.push(result);

      if (results.length >= Math.max(1, limit)) {
        break;
      }
    }
  }

  return results.slice(0, Math.max(1, limit));
}

export async function fetchPriceChartingCollectible(
  env: Env,
  value: string,
): Promise<PriceChartingCollectibleDetail | null> {
  const productPage = await resolveProductPageFromIdentifier(env, value);

  if (!productPage) {
    return null;
  }

  const metadata = extractCollectiblePageMetadata(productPage.sourceUrl, productPage.html);
  const pricing = buildPriceChartingPricingFromProductPage(productPage);

  if (!metadata.title) {
    return null;
  }

  return {
    id: buildPriceChartingCollectionId(productPage.sourceUrl),
    sourceUrl: productPage.sourceUrl,
    title: metadata.title,
    game: metadata.game,
    category: metadata.category,
    series: metadata.series,
    itemNumber: metadata.itemNumber,
    description: metadata.description,
    image: metadata.image,
    thumbnail: metadata.image,
    setName: metadata.setName,
    priceVariants: pricing?.priceVariants || [],
    historySeries: pricing?.historySeries || [],
  };
}

export async function fetchPriceChartingPricing(
  env: Env,
  card: PriceChartingLookupCard,
): Promise<PriceChartingPricing | null> {
  const productPage = await resolveProductPage(env, card);

  if (!productPage) {
    return null;
  }

  return buildPriceChartingPricingFromProductPage(productPage);
}
