import type { NormalizedCardQuery } from "../types";

const NOISE_KEYWORDS = [
  "lot",
  "proxy",
  "custom",
  "orica",
  "digital",
  "playmat",
  "binder",
  "empty box",
  "code card",
  "coins",
  "coin",
  "booster box",
  "pack art",
  "opened",
];

const GRADED_KEYWORDS = ["psa", "bgs", "cgc", "sgc", "beckett", "slab", "graded"];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCardQuery(input: string): NormalizedCardQuery {
  const display = input.replace(/\s+/g, " ").trim();
  const normalized = normalizeText(display);
  const searchTerms = normalized.split(" ").filter(Boolean);
  const cardNumber = searchTerms.find((term) => /^\d{1,4}[a-z]?$/i.test(term));

  return {
    raw: input,
    display,
    normalized,
    searchTerms,
    cardNumber,
  };
}

export function titleMatchesQuery(title: string, query: NormalizedCardQuery): boolean {
  const normalizedTitle = normalizeText(title);
  return query.searchTerms.every((term) => normalizedTitle.includes(term));
}

export function hasGradingIntent(query: NormalizedCardQuery): boolean {
  return query.searchTerms.some((term) => GRADED_KEYWORDS.includes(term));
}

export function classifyConditionFromTitle(title: string): "graded" | "raw" | "unknown" {
  const normalizedTitle = normalizeText(title);

  if (GRADED_KEYWORDS.some((keyword) => normalizedTitle.includes(keyword))) {
    return "graded";
  }

  if (normalizedTitle.length > 0) {
    return "raw";
  }

  return "unknown";
}

export function isLikelyNoiseResult(title: string): boolean {
  const normalizedTitle = normalizeText(title);
  return NOISE_KEYWORDS.some((keyword) => normalizedTitle.includes(keyword));
}
