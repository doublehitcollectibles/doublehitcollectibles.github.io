import {
  MarketSourceDisabledError,
  extractFirstMatch,
  fetchHtml,
  parseMoney,
  parseSoldDate,
  stripTags,
} from "../lib/http";
import {
  classifyConditionFromTitle,
  hasGradingIntent,
  isLikelyNoiseResult,
  titleMatchesQuery,
} from "../lib/query";
import type { Env, NormalizedCardQuery, PricingConfig, ProviderSnapshot, SoldComp } from "../types";
import type { SoldPricingProvider } from "./provider";

const ITEM_PATTERN = /<li\b[^>]*class="[^"]*\bs-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;

function extractTitle(chunk: string): string | null {
  const raw =
    extractFirstMatch(chunk, /class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|h3)>/i) ??
    extractFirstMatch(chunk, /class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/span>/i);

  if (!raw) {
    return null;
  }

  return stripTags(raw);
}

function extractListingUrl(chunk: string): string | null {
  return extractFirstMatch(chunk, /class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"/i);
}

function extractItemId(url: string | null): string | null {
  if (!url) {
    return null;
  }

  const match = url.match(/\/(\d{9,15})(?:\?|$)/) ?? url.match(/[?&]item=(\d{9,15})(?:&|$)/);
  return match?.[1] ?? null;
}

function extractShippingPrice(chunk: string): number {
  const shippingText = extractFirstMatch(
    chunk,
    /class="[^"]*s-item__shipping[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  );

  return parseMoney(stripTags(shippingText ?? ""));
}

function extractSoldDateText(chunk: string): string | null {
  const text = stripTags(chunk);
  const soldMatch =
    text.match(/Sold\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i) ??
    text.match(/Ended\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i);

  return soldMatch?.[1] ?? null;
}

function toSoldComp(chunk: string, query: NormalizedCardQuery): SoldComp | null {
  const title = extractTitle(chunk);

  if (!title || /Shop on eBay|New Listing/i.test(title)) {
    return null;
  }

  if (!titleMatchesQuery(title, query) || isLikelyNoiseResult(title)) {
    return null;
  }

  const conditionBucket = classifyConditionFromTitle(title);

  if (!hasGradingIntent(query) && conditionBucket === "graded") {
    return null;
  }

  const listingUrl = extractListingUrl(chunk);
  const priceText = extractFirstMatch(chunk, /class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  const salePrice = parseMoney(stripTags(priceText ?? ""));

  if (!salePrice) {
    return null;
  }

  const shippingPrice = extractShippingPrice(chunk);
  const soldDate = parseSoldDate(extractSoldDateText(chunk));

  return {
    providerItemId: extractItemId(listingUrl) ?? crypto.randomUUID(),
    title,
    listingUrl: listingUrl ?? "",
    salePrice,
    shippingPrice,
    totalPrice: salePrice + shippingPrice,
    currency: "USD",
    soldAt: soldDate,
    conditionBucket,
    rawPayload: {
      title,
      listingUrl,
      salePrice,
      shippingPrice,
      soldDate,
    },
  };
}

export class EbaySoldHtmlProvider implements SoldPricingProvider {
  readonly key = "ebay_sold_html";

  async fetchSnapshot(_env: Env, query: NormalizedCardQuery, config: PricingConfig): Promise<ProviderSnapshot> {
    if (!config.ebayScrapeEnabled) {
      throw new MarketSourceDisabledError(
        "EBAY_SCRAPE_ENABLED is false. Enable it only after you are comfortable with the source access model.",
      );
    }

    const sourceUrl =
      `${config.ebayBaseUrl}/sch/i.html?_nkw=${encodeURIComponent(query.display)}` +
      "&LH_Complete=1&LH_Sold=1&_ipg=60&rt=nc";

    const html = await fetchHtml(sourceUrl, config);
    const comps: SoldComp[] = [];

    for (const match of html.matchAll(ITEM_PATTERN)) {
      const chunk = match[1];
      const comp = toSoldComp(chunk, query);

      if (comp) {
        comps.push(comp);
      }

      if (comps.length >= 20) {
        break;
      }
    }

    comps.sort((left, right) => {
      if (!left.soldAt && !right.soldAt) {
        return 0;
      }

      if (!left.soldAt) {
        return 1;
      }

      if (!right.soldAt) {
        return -1;
      }

      return right.soldAt.localeCompare(left.soldAt);
    });

    return {
      provider: this.key,
      sourceUrl,
      rawPayload: {
        fetchedResultCount: comps.length,
      },
      comps,
    };
  }
}
