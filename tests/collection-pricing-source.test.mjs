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

function transpile(snippet) {
  return ts.transpileModule(snippet, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

test("pricing presentation prefers the fresher raw source and keeps raw history aligned with it", () => {
  const source = readFile("workers/pricing-service/src/lib/pokemonTcg.ts");
  const helperBlock = extractBetween(source, "function toTitleLabel", "export function mapPokemonCardSummary");
  const buildHelpers = new Function(`${transpile(helperBlock)}; return { buildPricingPresentation };`);
  const { buildPricingPresentation } = buildHelpers();

  const basePricing = {
    priceType: "normal",
    currency: "USD",
    currentPrice: 46.92,
    sourceLabel: "TCGplayer Market",
    metrics: {},
    updatedAt: "2026-04-17T12:00:00.000Z",
  };
  const history = [
    { capturedAt: "2026-04-18T00:00:00.000Z", marketPrice: 45.12, currency: "USD", priceType: "raw", priceSource: "TCGplayer Market" },
    { capturedAt: "2026-04-19T00:00:00.000Z", marketPrice: 46.92, currency: "USD", priceType: "raw", priceSource: "TCGplayer Market" },
  ];
  const storedPayload = {
    priceVariants: [
      {
        key: "raw",
        label: "Raw",
        currency: "USD",
        currentPrice: 39.5,
        sourceLabel: "PriceCharting Ungraded",
        updatedAt: "2026-04-19T00:00:00.000Z",
        metrics: {},
      },
      {
        key: "psa10",
        label: "PSA 10",
        currency: "USD",
        currentPrice: 138.22,
        sourceLabel: "PriceCharting PSA 10",
        updatedAt: "2026-04-19T00:00:00.000Z",
        metrics: {},
      },
    ],
    historySeries: [
      {
        key: "raw",
        label: "Raw",
        currency: "USD",
        sourceLabel: "PriceCharting Ungraded",
        color: "#4aa8ff",
        points: [
          { capturedAt: "2026-04-18T00:00:00.000Z", price: 31.94 },
          { capturedAt: "2026-04-19T00:00:00.000Z", price: 39.5 },
        ],
      },
      {
        key: "psa10",
        label: "PSA 10",
        currency: "USD",
        sourceLabel: "PriceCharting PSA 10",
        color: "#ffd84a",
        points: [
          { capturedAt: "2026-04-18T00:00:00.000Z", price: 126.5 },
          { capturedAt: "2026-04-19T00:00:00.000Z", price: 138.22 },
        ],
      },
    ],
  };

  const presentation = buildPricingPresentation(basePricing, history, storedPayload);

  assert.equal(presentation.pricing.currentPrice, 39.5);
  assert.equal(presentation.pricing.sourceLabel, "PriceCharting Ungraded");
  assert.equal(presentation.priceVariants[0]?.currentPrice, 39.5);
  assert.equal(presentation.historySeries[0]?.key, "raw");
  assert.equal(presentation.historySeries[0]?.sourceLabel, "PriceCharting Ungraded");
  assert.equal(presentation.historySeries[0]?.points.at(-1)?.price, 39.5);
});

test("pricing presentation keeps snapshot history when tcgplayer is fresher than pricecharting raw", () => {
  const source = readFile("workers/pricing-service/src/lib/pokemonTcg.ts");
  const helperBlock = extractBetween(source, "function toTitleLabel", "export function mapPokemonCardSummary");
  const buildHelpers = new Function(`${transpile(helperBlock)}; return { buildPricingPresentation };`);
  const { buildPricingPresentation } = buildHelpers();

  const basePricing = {
    priceType: "normal",
    currency: "USD",
    currentPrice: 41.15,
    sourceLabel: "TCGplayer Market",
    metrics: {},
    updatedAt: "2026-04-20T08:00:00.000Z",
  };
  const history = [
    { capturedAt: "2026-04-19T08:00:00.000Z", marketPrice: 39.8, currency: "USD", priceType: "normal", priceSource: "TCGplayer Market" },
    { capturedAt: "2026-04-20T08:00:00.000Z", marketPrice: 41.15, currency: "USD", priceType: "normal", priceSource: "TCGplayer Market" },
  ];
  const storedPayload = {
    priceVariants: [
      {
        key: "raw",
        label: "Raw",
        currency: "USD",
        currentPrice: 39.5,
        sourceLabel: "PriceCharting Ungraded",
        updatedAt: "2026-04-19T00:00:00.000Z",
        metrics: {},
      },
    ],
    historySeries: [
      {
        key: "raw",
        label: "Raw",
        currency: "USD",
        sourceLabel: "PriceCharting Ungraded",
        color: "#4aa8ff",
        points: [
          { capturedAt: "2026-04-18T00:00:00.000Z", price: 31.94 },
          { capturedAt: "2026-04-19T00:00:00.000Z", price: 39.5 },
        ],
      },
    ],
  };

  const presentation = buildPricingPresentation(basePricing, history, storedPayload);

  assert.equal(presentation.pricing.currentPrice, 41.15);
  assert.equal(presentation.pricing.sourceLabel, "TCGplayer Market");
  assert.equal(presentation.priceVariants[0]?.currentPrice, 41.15);
  assert.equal(presentation.historySeries[0]?.key, "snapshot");
  assert.equal(presentation.historySeries[0]?.sourceLabel, "TCGplayer Market");
  assert.equal(presentation.historySeries[0]?.points.at(-1)?.price, 41.15);
});

test("stored price payload validation rejects legacy snapshots without a version marker", () => {
  const source = readFile("workers/pricing-service/src/lib/pokemonTcg.ts");
  const helperBlock = extractBetween(source, "const STORED_PRICE_PAYLOAD_VERSION", "export function mapPokemonCardSummary");
  const buildHelpers = new Function(`${transpile(helperBlock)}; return { hasCurrentStoredPricePayload };`);
  const { hasCurrentStoredPricePayload } = buildHelpers();

  const legacyPayload = {
    externalPricingChecked: true,
    priceVariants: [
      {
        key: "raw",
        label: "Raw",
        currency: "USD",
        currentPrice: 39.5,
        sourceLabel: "PriceCharting Ungraded",
        updatedAt: "2026-04-19T00:00:00.000Z",
        metrics: {},
      },
    ],
    historySeries: [
      {
        key: "raw",
        label: "Raw",
        currency: "USD",
        sourceLabel: "PriceCharting Ungraded",
        color: "#4aa8ff",
        points: [{ capturedAt: "2026-04-19T00:00:00.000Z", price: 39.5 }],
      },
    ],
  };
  const currentPayload = {
    ...legacyPayload,
    payloadVersion: 1,
  };

  assert.equal(hasCurrentStoredPricePayload(legacyPayload), false);
  assert.equal(hasCurrentStoredPricePayload(currentPayload), true);
  assert.match(source, /hasCurrentStoredPricePayload\(storedPayload\)/);
});

test("pricecharting candidate scoring rejects loose cross-card matches like Mewtwo and Mew GX for Mewtwo 52", () => {
  const source = readFile("workers/pricing-service/src/lib/priceCharting.ts");
  const helperBlock = extractBetween(source, "function normalizeQueryPart", "async function resolveProductPage");
  const buildHelpers = new Function(`${transpile(helperBlock)}; return { scoreCandidate };`);
  const { scoreCandidate } = buildHelpers();

  const card = {
    name: "Mewtwo",
    number: "52",
    preferredPriceType: "normal",
    set: {
      name: "Scarlet & Violet Black Star Promos",
    },
  };

  const correctCandidate = {
    url: "https://www.pricecharting.com/game/pokemon-scarlet-&-violet-black-star-promos/mewtwo-52",
    title: "Mewtwo #52",
    setName: "Pokemon Promo",
  };

  const wrongCandidate = {
    url: "https://www.pricecharting.com/game/pokemon-japanese-tag-all-stars/mewtwo-&-mew-gx-52",
    title: "Mewtwo & Mew GX #52",
    setName: "Pokemon Japanese Tag All Stars",
  };

  const wrongSameNumberCandidate = {
    url: "https://www.pricecharting.com/game/pokemon-evolutions/mewtwo-ex-52",
    title: "Mewtwo EX #52",
    setName: "Pokemon Evolutions",
  };

  assert.ok(scoreCandidate(card, correctCandidate) > scoreCandidate(card, wrongCandidate));
  assert.ok(scoreCandidate(card, correctCandidate) > scoreCandidate(card, wrongSameNumberCandidate));
});

test("pricecharting product-page validation rejects direct redirects to the wrong card page", () => {
  const source = readFile("workers/pricing-service/src/lib/priceCharting.ts");
  const helperBlock = extractBetween(source, "function normalizeQueryPart", "async function resolveProductPage");
  const buildHelpers = new Function(`${transpile(helperBlock)}; return { productPageMatchesCard };`);
  const { productPageMatchesCard } = buildHelpers();

  const card = {
    name: "Mewtwo",
    number: "52",
    preferredPriceType: "normal",
    set: {
      name: "Scarlet & Violet Black Star Promos",
    },
  };

  const correctHtml = "<title>Mewtwo #52 Prices | Pokemon Promo | Pokemon Cards</title>";
  const wrongHtml = "<title>Mewtwo & Mew GX #52 Prices | Pokemon Japanese Tag All Stars | Pokemon Cards</title>";

  assert.equal(
    productPageMatchesCard(card, "https://www.pricecharting.com/game/pokemon-promo/mewtwo-52", correctHtml),
    true,
  );
  assert.equal(
    productPageMatchesCard(
      card,
      "https://www.pricecharting.com/game/pokemon-japanese-tag-all-stars/mewtwo-&-mew-gx-52",
      wrongHtml,
    ),
    false,
  );
  assert.match(source, /productPageMatchesCard\(card, finalUrl, html\)/);
});

test("snapshot writes persist a version marker for future price-payload invalidation", () => {
  const source = readFile("workers/pricing-service/src/lib/pokemonCollectionDb.ts");

  assert.match(source, /const STORED_PRICE_PAYLOAD_VERSION = 1/);
  assert.match(source, /payloadVersion:\s*STORED_PRICE_PAYLOAD_VERSION/);
});
