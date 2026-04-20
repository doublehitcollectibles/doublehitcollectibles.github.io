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

export interface PriceChartingPricing {
  sourceUrl: string;
  priceVariants: PokemonPriceVariant[];
  historySeries: PokemonPriceHistorySeries[];
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

function extractPriceFromCell(html: string, cellId: string): number | null {
  const pattern = new RegExp(
    `id="${escapeRegex(cellId)}"[\\s\\S]*?<span class="price js-price">\\s*\\$([0-9,]+(?:\\.[0-9]+)?)`,
    "i",
  );
  const match = html.match(pattern);
  return parseUsdValue(match?.[1]);
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
  "ex",
  "gx",
  "holo",
  "holofoil",
  "japanese",
  "pokemon",
  "promo",
  "promos",
  "reverse",
  "sv",
  "swsh",
  "v",
  "vmax",
  "vstar",
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

  if (normalizedSet) {
    if (normalizedCandidateContext === normalizedSet || normalizedCandidateContext.includes(normalizedSet)) {
      score += 70;
    } else if (includesAllTokens(normalizedCandidateContext, setTokens)) {
      score += 54;
    } else {
      score += overlapCount(setTokens, normalizedCandidateContext) * 9;
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

    if (finalUrl.includes("/game/") || isProductPageHtml(html)) {
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

    return {
      sourceUrl: fallbackUrl.split("?")[0],
      html: await fallbackResponse.text(),
    };
  }

  return null;
}

export async function fetchPriceChartingPricing(
  env: Env,
  card: PriceChartingLookupCard,
): Promise<PriceChartingPricing | null> {
  const productPage = await resolveProductPage(env, card);

  if (!productPage) {
    return null;
  }

  const chartData = parseChartData(productPage.html);
  const rawPoints = buildSeriesPoints(chartData.used);
  const psaPoints = buildSeriesPoints(chartData.manualonly?.length ? chartData.manualonly : chartData.graded);

  const rawPrice = extractPriceFromCell(productPage.html, "used_price") ?? latestSeriesPrice(rawPoints);
  const psa10Price =
    extractPriceFromCell(productPage.html, "manual_only_price") ??
    extractPriceFromCell(productPage.html, "graded_price") ??
    latestSeriesPrice(psaPoints);

  const priceVariants: PokemonPriceVariant[] = [
    {
      key: "raw",
      label: "Raw",
      currency: "USD",
      currentPrice: rawPrice,
      sourceLabel: "PriceCharting Ungraded",
      updatedAt: latestSeriesCapturedAt(rawPoints),
      metrics: {},
    },
    {
      key: "psa10",
      label: "PSA 10",
      currency: "USD",
      currentPrice: psa10Price,
      sourceLabel: "PriceCharting PSA 10",
      updatedAt: latestSeriesCapturedAt(psaPoints),
      metrics: {},
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
