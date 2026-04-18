import { getPricingConfig } from "../config";
import type {
  Env,
  PokemonPriceHistorySeries,
  PokemonPriceVariant,
} from "../types";

interface PriceChartingLookupCard {
  name: string;
  number?: string;
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

function buildSearchQueries(card: PriceChartingLookupCard): string[] {
  const name = normalizeQueryPart(card.name);
  const number = normalizeQueryPart(card.number);
  const setName = normalizeQueryPart(card.set?.name);

  return dedupeQueries([
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
  return match?.[1] ? new URL(match[1], PRICECHARTING_BASE_URL).toString() : null;
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

    if (finalUrl.includes("/game/")) {
      return {
        sourceUrl: finalUrl,
        html,
      };
    }

    const fallbackUrl = firstGamePath(html);

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
      updatedAt: null,
      metrics: {},
    },
    {
      key: "psa10",
      label: "PSA 10",
      currency: "USD",
      currentPrice: psa10Price,
      sourceLabel: "PriceCharting PSA 10",
      updatedAt: null,
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
