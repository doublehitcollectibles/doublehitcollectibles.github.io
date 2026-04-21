import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require(path.resolve("workers/pricing-service/node_modules/typescript"));

function readFile(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

function extractBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Unable to extract block between ${startToken} and ${endToken}`);
  }

  return source.slice(start, end);
}

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

test("custom tracked cards reuse persisted PriceCharting payloads for PSA 10 values and history", () => {
  const source = readFile("workers/pricing-service/src/lib/pokemonTcg.ts");
  const helperBlock = extractBetween(source, "const STORED_PRICE_PAYLOAD_VERSION", "export function mapPokemonCardSummary");
  const buildHelpers = new Function(
    "fetchPriceChartingCollectible",
    "updateCollectionCardsPriceSnapshot",
    `${transpile(helperBlock)}; return { mapCustomCollectionSummary };`,
  );
  const { mapCustomCollectionSummary } = buildHelpers(
    async () => {
      throw new Error("not used");
    },
    async () => {
      throw new Error("not used");
    },
  );

  const entry = {
    id: 41,
    source: "custom",
    cardId: "pricecharting:/game/pokemon-surging-sparks/castform-sunny-form-195",
    label: "Castform Sunny Form #195 PSA 10",
    game: "Pokemon",
    category: "Pokemon Card",
    series: "Surging Sparks",
    itemNumber: "195",
    quantity: 1,
    purchasePrice: 65,
    ownershipPriceVariant: "psa10",
    priceSource: "PriceCharting Ungraded",
    currency: "USD",
    currentPrice: 6.95,
    marketSourceUrl: "https://www.pricecharting.com/game/pokemon-surging-sparks/castform-sunny-form-195",
    priceRefreshedAt: new Date().toISOString(),
    pricePayload: JSON.stringify({
      payloadVersion: 4,
      externalPricingChecked: true,
      marketSourceUrl: "https://www.pricecharting.com/game/pokemon-surging-sparks/castform-sunny-form-195",
      priceVariants: [
        {
          key: "raw",
          label: "Raw",
          currency: "USD",
          currentPrice: 6.95,
          sourceLabel: "PriceCharting Ungraded",
          updatedAt: "2026-04-01T06:00:00.000Z",
          metrics: { dailyChangeAmount: 1.52, dailyChangePercent: 27.99 },
        },
        {
          key: "psa10",
          label: "PSA 10",
          currency: "USD",
          currentPrice: 68.42,
          sourceLabel: "PriceCharting PSA 10",
          updatedAt: "2026-04-01T06:00:00.000Z",
          metrics: { dailyChangeAmount: 3.17, dailyChangePercent: 4.85 },
        },
      ],
      historySeries: [
        {
          key: "raw",
          label: "Raw",
          currency: "USD",
          sourceLabel: "PriceCharting Ungraded",
          color: "#4aa8ff",
          points: [{ capturedAt: "2026-04-01T06:00:00.000Z", price: 6.95 }],
        },
        {
          key: "psa10",
          label: "PSA 10",
          currency: "USD",
          sourceLabel: "PriceCharting PSA 10",
          color: "#ffd84a",
          points: [{ capturedAt: "2026-04-01T06:00:00.000Z", price: 68.42 }],
        },
      ],
    }),
  };

  const mapped = mapCustomCollectionSummary(entry, "USD");

  assert.equal(mapped.pricing.currentPrice, 6.95);
  assert.equal(mapped.priceVariants.length, 2);
  assert.equal(mapped.priceVariants.find((variant) => variant.key === "psa10")?.currentPrice, 68.42);
  assert.equal(mapped.historySeries.length, 2);
  assert.equal(mapped.marketSourceUrl, entry.marketSourceUrl);
  assert.equal(mapped.ownershipMetrics.currentValue, 68.42);
  assert.equal(mapped.ownershipMetrics.deltaAmount, 3.4200000000000017);
});

test("custom tracked-card payload freshness is based on priceRefreshedAt, not the chart timestamp", () => {
  const source = readFile("workers/pricing-service/src/lib/pokemonTcg.ts");
  const helperBlock = extractBetween(source, "const STORED_PRICE_PAYLOAD_VERSION", "export function mapPokemonCardSummary");
  const buildHelpers = new Function(
    "fetchPriceChartingCollectible",
    "updateCollectionCardsPriceSnapshot",
    `${transpile(helperBlock)}; return { hasCurrentCustomStoredPricePayload };`,
  );
  const { hasCurrentCustomStoredPricePayload } = buildHelpers(
    async () => {
      throw new Error("not used");
    },
    async () => {
      throw new Error("not used");
    },
  );

  const storedPayload = {
    payloadVersion: 4,
    externalPricingChecked: true,
    priceVariants: [
      {
        key: "raw",
        label: "Raw",
        currency: "USD",
        currentPrice: 6.95,
        sourceLabel: "PriceCharting Ungraded",
        updatedAt: "2026-04-01T06:00:00.000Z",
        metrics: {},
      },
    ],
    historySeries: [],
  };

  assert.equal(
    hasCurrentCustomStoredPricePayload(
      { priceRefreshedAt: new Date().toISOString() },
      storedPayload,
      6 * 60 * 60 * 1000,
    ),
    true,
  );
  assert.equal(
    hasCurrentCustomStoredPricePayload(
      { priceRefreshedAt: "2026-04-01T06:00:00.000Z" },
      storedPayload,
      6 * 60 * 60 * 1000,
    ),
    false,
  );
});

test("tracked collection refresh path now includes PriceCharting-backed custom entries", () => {
  const source = readFile("workers/pricing-service/src/index.ts");

  assert.match(source, /isPriceChartingCollectionId\(entry\.cardId\)/);
  assert.match(source, /ctx\.waitUntil\(\s*getAllTrackedPokemonEntries\(env\)/s);
});
