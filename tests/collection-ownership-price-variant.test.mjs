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

function transpileModule(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

test("ownership metrics compare against psa10 pricing when the entry is tracked as psa10", () => {
  const source = readFile("assets/js/collection.js");
  const helperBlock = extractBetween(source, "function normalizeDisplayText", "function getSeriesDelta");
  const buildHelpers = new Function(`${helperBlock}; return { computeOwnershipMetrics };`);
  const { computeOwnershipMetrics } = buildHelpers();

  const metrics = computeOwnershipMetrics(
    {
      pricing: {
        priceType: "raw",
        currency: "USD",
        currentPrice: 20.96,
        sourceLabel: "PriceCharting Ungraded",
        metrics: {},
        updatedAt: "2026-04-21T00:00:00.000Z",
      },
      priceVariants: [
        {
          key: "raw",
          label: "Raw",
          currency: "USD",
          currentPrice: 20.96,
          sourceLabel: "PriceCharting Ungraded",
          metrics: {},
          updatedAt: "2026-04-21T00:00:00.000Z",
        },
        {
          key: "psa10",
          label: "PSA 10",
          currency: "USD",
          currentPrice: 385,
          sourceLabel: "PriceCharting PSA 10",
          metrics: {},
          updatedAt: "2026-04-21T00:00:00.000Z",
        },
      ],
    },
    {
      quantity: 1,
      purchasePrice: 350,
      ownershipPriceVariant: "psa10",
    },
  );

  assert.equal(metrics.currentValue, 385);
  assert.equal(metrics.deltaAmount, 35);
  assert.equal(Number(metrics.deltaPercent?.toFixed(2)), 10);
  assert.equal(metrics.comparisonPriceType, "psa10");
  assert.equal(metrics.comparisonPriceLabel, "PSA 10");
  assert.equal(metrics.comparisonSourceLabel, "PriceCharting PSA 10");
});

test("frontend ownership helpers append graded titles and expose the explicit cost basis label", () => {
  const source = readFile("assets/js/collection.js");
  const helperBlock = extractBetween(source, "function normalizeDisplayText", "function getSeriesDelta");
  const buildHelpers = new Function(
    `${helperBlock}; return { buildOwnershipDisplayTitle, formatOwnershipCostBasisLabel, mapCardPayload };`,
  );
  const { buildOwnershipDisplayTitle, formatOwnershipCostBasisLabel, mapCardPayload } = buildHelpers();

  assert.equal(buildOwnershipDisplayTitle("Shining Ho-Oh", { ownershipPriceVariant: "psa10" }), "Shining Ho-Oh PSA 10");
  assert.equal(buildOwnershipDisplayTitle("Shining Ho-Oh PSA 10", { ownershipPriceVariant: "raw" }), "Shining Ho-Oh");
  assert.equal(
    formatOwnershipCostBasisLabel({ comparisonPriceLabel: "PSA 10" }, { ownershipPriceVariant: "raw" }),
    "PSA 10 cost basis",
  );
  assert.equal(
    formatOwnershipCostBasisLabel({ comparisonPriceLabel: "PSA 10" }, { ownershipPriceVariant: "raw" }, { titleCase: true }),
    "PSA 10 Cost Basis",
  );

  const mappedCard = mapCardPayload(
    {
      id: "sm70",
      name: "Shining Ho-Oh",
      set: { name: "SM Black Star Promos" },
      rarity: "Promo",
      number: "SM70",
      images: { small: "small.png", large: "large.png" },
      tcgplayer: {
        updatedAt: "2026-04-21T00:00:00.000Z",
        prices: {
          holofoil: {
            market: 20.96,
          },
        },
      },
    },
    {
      quantity: 1,
      purchasePrice: 350,
      ownershipPriceVariant: "psa10",
    },
    [],
  );

  assert.equal(mappedCard.title, "Shining Ho-Oh PSA 10");
});

test("worker request parsing preserves the ownership price variant for stored collection cards", () => {
  const source = readFile("workers/pricing-service/src/index.ts");
  const helperBlock = extractBetween(source, "function normalizeEntrySource", "async function handleCollectionCardsGet");
  const moduleFactory = new Function(
    "exports",
    "module",
    `${transpileModule(helperBlock)}; return { parseCollectionCardBody };`,
  );
  const helpers = moduleFactory({}, { exports: {} });

  const entry = helpers.parseCollectionCardBody({
    source: "api",
    cardId: "sm70",
    quantity: 1,
    purchasePrice: 350,
    priceType: "holofoil",
    ownershipPriceVariant: "psa10",
    condition: "PSA 10",
  });

  assert.equal(entry.cardId, "sm70");
  assert.equal(entry.priceType, "holofoil");
  assert.equal(entry.ownershipPriceVariant, "psa10");
});

test("worker ownership title helper appends and removes the psa10 suffix consistently", () => {
  const source = readFile("workers/pricing-service/src/lib/pokemonTcg.ts");
  const helperBlock = extractBetween(source, "function normalizeOwnershipPriceVariant", "function resolveOwnershipComparisonVariant");
  const moduleFactory = new Function(
    "exports",
    "module",
    `${transpileModule(helperBlock)}; return { buildOwnershipDisplayTitle };`,
  );
  const { buildOwnershipDisplayTitle } = moduleFactory({}, { exports: {} });

  assert.equal(buildOwnershipDisplayTitle("Shining Ho-Oh", { ownershipPriceVariant: "psa10" }), "Shining Ho-Oh PSA 10");
  assert.equal(buildOwnershipDisplayTitle("Shining Ho-Oh PSA 10", { ownershipPriceVariant: "raw" }), "Shining Ho-Oh");
});
