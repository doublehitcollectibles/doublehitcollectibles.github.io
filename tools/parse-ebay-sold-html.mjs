#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const ITEM_PATTERN = /<li\b[^>]*class="[^"]*\bs-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
const TITLE_PATTERNS = [
  /class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|h3)>/i,
  /class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
];
const LINK_PATTERN = /class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"/i;
const PRICE_PATTERN = /class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i;
const SHIPPING_PATTERN = /class="[^"]*s-item__shipping[^"]*"[^>]*>([\s\S]*?)<\/span>/i;

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

function printHelp() {
  console.log(`Usage:
  node tools/parse-ebay-sold-html.mjs "mewtwo 281" page1.html [page2.html ...] [--limit 20] [--include-graded] [--out result.json]

Description:
  Parse one or more manually saved eBay sold-results HTML pages and compute
  a pricing summary without fetching from eBay directly.
`);
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s#+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function firstMatch(patterns, text) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function parseMoney(value) {
  if (!value) {
    return 0;
  }

  const cleaned = stripTags(value).replace(/,/g, "");
  if (cleaned.toLowerCase().includes("free")) {
    return 0;
  }

  const match = cleaned.match(/(-?\d+(?:\.\d{1,2})?)/);
  return match ? Number.parseFloat(match[1]) : 0;
}

function parseSoldDate(chunk) {
  const text = stripTags(chunk);
  const match = text.match(/(?:Sold|Ended)\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i);

  if (!match) {
    return null;
  }

  const parsed = new Date(match[1]);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function titleMatchesQuery(title, queryTerms) {
  const normalizedTitle = normalizeText(title);
  return queryTerms.every((term) => normalizedTitle.includes(term));
}

function isNoiseResult(title) {
  const normalized = normalizeText(title);
  return NOISE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function classifyCondition(title) {
  const normalized = normalizeText(title);

  if (GRADED_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "graded";
  }

  return normalized ? "raw" : "unknown";
}

function queryHasGradingIntent(queryTerms) {
  return queryTerms.some((term) => GRADED_KEYWORDS.includes(term));
}

function extractItemId(url, title) {
  if (url) {
    const urlMatch = url.match(/\/(\d{9,15})(?:\?|$)/) ?? url.match(/[?&]item=(\d{9,15})(?:&|$)/);
    if (urlMatch) {
      return urlMatch[1];
    }
  }

  return crypto.createHash("sha1").update(title).digest("hex").slice(0, 16);
}

function buildComp(chunk, queryTerms, allowGraded) {
  const rawTitle = firstMatch(TITLE_PATTERNS, chunk);
  if (!rawTitle) {
    return null;
  }

  const title = stripTags(rawTitle);
  if (!title || /shop on ebay|new listing/i.test(title)) {
    return null;
  }

  if (!titleMatchesQuery(title, queryTerms) || isNoiseResult(title)) {
    return null;
  }

  const conditionBucket = classifyCondition(title);
  if (!allowGraded && conditionBucket === "graded") {
    return null;
  }

  const listingUrl = chunk.match(LINK_PATTERN)?.[1] ?? "";
  const salePrice = parseMoney(firstMatch([PRICE_PATTERN], chunk));

  if (salePrice <= 0) {
    return null;
  }

  const shippingPrice = parseMoney(firstMatch([SHIPPING_PATTERN], chunk));
  const soldAt = parseSoldDate(chunk);

  return {
    provider_item_id: extractItemId(listingUrl, title),
    title,
    listing_url: listingUrl,
    sale_price: Number(salePrice.toFixed(2)),
    shipping_price: Number(shippingPrice.toFixed(2)),
    total_price: Number((salePrice + shippingPrice).toFixed(2)),
    currency: "USD",
    sold_at: soldAt,
    condition_bucket: conditionBucket,
  };
}

function loadComps(files, queryTerms, allowGraded) {
  const comps = [];
  const seenIds = new Set();

  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");

    for (const match of html.matchAll(ITEM_PATTERN)) {
      const comp = buildComp(match[1], queryTerms, allowGraded);
      if (!comp || seenIds.has(comp.provider_item_id)) {
        continue;
      }

      seenIds.add(comp.provider_item_id);
      comps.push(comp);
    }
  }

  comps.sort((left, right) => {
    const leftKey = left.sold_at ?? "";
    const rightKey = right.sold_at ?? "";
    return rightKey.localeCompare(leftKey);
  });

  return comps;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function trimmedMean(values) {
  if (values.length <= 2) {
    return average(values);
  }

  const sorted = [...values].sort((left, right) => left - right);
  const trimCount = Math.min(2, Math.floor(sorted.length * 0.1));
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  return average(trimmed);
}

function summarize(query, comps, sourceFiles) {
  const prices = comps.map((comp) => comp.total_price);
  const soldDates = comps.map((comp) => comp.sold_at).filter(Boolean).sort();
  const medianPrice = median(prices);

  return {
    query,
    normalized_query: normalizeText(query),
    provider: "ebay_manual_html",
    source_files: sourceFiles,
    market_price: Number(medianPrice.toFixed(2)),
    average_price: Number(average(prices).toFixed(2)),
    median_price: Number(medianPrice.toFixed(2)),
    trimmed_mean_price: Number(trimmedMean(prices).toFixed(2)),
    min_price: prices.length ? Number(Math.min(...prices).toFixed(2)) : 0,
    max_price: prices.length ? Number(Math.max(...prices).toFixed(2)) : 0,
    sample_size: comps.length,
    currency: "USD",
    sold_from: soldDates[0] ?? null,
    sold_to: soldDates[soldDates.length - 1] ?? null,
    comps,
  };
}

function parseCli(argv) {
  const args = [...argv];

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const query = args.shift();
  if (!query) {
    printHelp();
    process.exit(1);
  }

  const htmlFiles = [];
  let limit = 20;
  let includeGraded = false;
  let out = null;

  while (args.length) {
    const token = args.shift();

    if (token === "--limit") {
      limit = Number.parseInt(args.shift() ?? "20", 10);
      continue;
    }

    if (token === "--include-graded") {
      includeGraded = true;
      continue;
    }

    if (token === "--out") {
      out = args.shift() ?? null;
      continue;
    }

    htmlFiles.push(token);
  }

  if (htmlFiles.length === 0) {
    printHelp();
    process.exit(1);
  }

  return { query, htmlFiles, limit: Math.max(1, limit), includeGraded, out };
}

function main() {
  const { query, htmlFiles, limit, includeGraded, out } = parseCli(process.argv.slice(2));
  const resolvedFiles = htmlFiles.map((file) => path.resolve(file));
  const missing = resolvedFiles.filter((file) => !fs.existsSync(file));

  if (missing.length > 0) {
    console.error(JSON.stringify({ error: "Missing input files", files: missing }, null, 2));
    process.exit(2);
  }

  const queryTerms = normalizeText(query).split(" ").filter(Boolean);
  const allowGraded = includeGraded || queryHasGradingIntent(queryTerms);
  const comps = loadComps(resolvedFiles, queryTerms, allowGraded).slice(0, limit);
  const summary = summarize(query, comps, resolvedFiles);
  const payload = `${JSON.stringify(summary, null, 2)}\n`;

  if (out) {
    fs.writeFileSync(path.resolve(out), payload, "utf8");
  } else {
    process.stdout.write(payload);
  }
}

main();
