import type { PricingConfig } from "../types";

export class MarketSourceBlockedError extends Error {
  override name = "MarketSourceBlockedError";
}

export class MarketSourceDisabledError extends Error {
  override name = "MarketSourceDisabledError";
}

export async function fetchHtml(url: string, config: PricingConfig): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent": config.userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source HTML (${response.status})`);
  }

  const html = await response.text();

  if (/Pardon Our Interruption|automated access|captcha|Access to this page has been denied/i.test(html)) {
    throw new MarketSourceBlockedError("The upstream source challenged the automated request.");
  }

  return html;
}

export function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractFirstMatch(input: string, pattern: RegExp): string | null {
  const match = input.match(pattern);
  return match?.[1]?.trim() ?? null;
}

export function parseMoney(input: string | null): number {
  if (!input) {
    return 0;
  }

  const normalized = input.replace(/,/g, "");
  const match = normalized.match(/(-?\d+(?:\.\d{1,2})?)/);

  if (!match) {
    return /free/i.test(input) ? 0 : 0;
  }

  return Number.parseFloat(match[1]);
}

export function parseSoldDate(input: string | null): string | null {
  if (!input) {
    return null;
  }

  const cleaned = input.replace(/\./g, "").replace(/\s+/g, " ").trim();
  const parsed = new Date(cleaned);

  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString();
}
