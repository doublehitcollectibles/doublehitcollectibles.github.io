import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

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

test("collection admin can build a custom collectible payload for sealed and non-Pokemon entries", () => {
  const adminSource = readFile("assets/js/collection-admin.js");
  const helperBlock = extractBetween(adminSource, "function normalizeEntrySource", "function escapeHtml");
  const buildHelpers = new Function(`${helperBlock}; return { normalizeEntrySource, buildCustomSubtitle, buildCollectionEntryPayload };`);
  const { normalizeEntrySource, buildCustomSubtitle, buildCollectionEntryPayload } = buildHelpers();

  assert.equal(normalizeEntrySource("custom"), "custom");
  assert.equal(normalizeEntrySource("api"), "api");
  assert.equal(normalizeEntrySource("unexpected"), "api");

  assert.equal(
    buildCustomSubtitle({
      game: "Riftbound",
      category: "Sealed Product",
      series: "Origins",
      variant: "Booster Box",
    }),
    "Riftbound | Sealed Product | Origins | Booster Box",
  );

  assert.deepEqual(
    buildCollectionEntryPayload(
      {
        label: "Ascended Heroes Pokemon Center Elite Trainer Box",
        quantity: "2",
        purchasePrice: "350.00",
        purchaseDate: "2026-04-20",
        condition: "Sealed",
        notes: "Pokemon Center exclusive ETB.",
        game: "Pokemon",
        category: "Sealed Product",
        series: "Ascended Heroes",
        variant: "Pokemon Center Elite Trainer Box",
        itemNumber: "PC-ETB",
        image: "https://example.com/etb.png",
        currentPrice: "469.40",
        priceSource: "Manual Market",
        description: "Factory sealed collector box",
        currency: "USD",
      },
      "custom",
    ),
    {
      source: "custom",
      label: "Ascended Heroes Pokemon Center Elite Trainer Box",
      quantity: 2,
      purchasePrice: 350,
      purchaseDate: "2026-04-20",
      condition: "Sealed",
      notes: "Pokemon Center exclusive ETB.",
      game: "Pokemon",
      category: "Sealed Product",
      series: "Ascended Heroes",
      variant: "Pokemon Center Elite Trainer Box",
      itemNumber: "PC-ETB",
      image: "https://example.com/etb.png",
      currentPrice: 469.4,
      priceSource: "Manual Market",
      description: "Factory sealed collector box",
      currency: "USD",
    },
  );
});

test("manage collection page exposes a mixed collectibles mode and manual item fields", () => {
  const pageSource = readFile("pages/manage-collection.md");

  assert.match(pageSource, /data-admin-mode-switch/);
  assert.match(pageSource, /data-admin-mode="api"[\s\S]*Pokemon Cards/);
  assert.match(pageSource, /data-admin-mode="custom"[\s\S]*(Sealed|Other Games)/);
  assert.match(pageSource, /name="source"/);
  assert.match(pageSource, /name="game"/);
  assert.match(pageSource, /name="category"/);
  assert.match(pageSource, /name="series"/);
  assert.match(pageSource, /name="variant"/);
  assert.match(pageSource, /name="itemNumber"/);
  assert.match(pageSource, /name="image"/);
  assert.match(pageSource, /name="currentPrice"/);
  assert.match(pageSource, /name="priceSource"/);
});

test("custom collection items include game-aware subtitles on the live collection page", () => {
  const collectionSource = readFile("assets/js/collection.js");
  const helperBlock = extractBetween(collectionSource, "function normalizeDisplayText", "function getPriceVariant");
  const buildHelpers = new Function(`
    const state = { ownedCollection: { currency: "USD" } };
    function computeOwnershipMetrics(currentPrice, ownership) {
      const quantity = Number(ownership?.quantity || 1);
      const purchasePrice = ownership?.purchasePrice != null ? Number(ownership.purchasePrice) : null;
      return {
        quantity,
        purchasePrice,
        investedValue: purchasePrice != null ? purchasePrice * quantity : null,
        currentValue: currentPrice != null ? currentPrice * quantity : null,
        deltaAmount: purchasePrice != null && currentPrice != null ? currentPrice * quantity - purchasePrice * quantity : null,
        deltaPercent: purchasePrice != null && currentPrice != null && purchasePrice > 0
          ? ((currentPrice * quantity - purchasePrice * quantity) / (purchasePrice * quantity)) * 100
          : null,
      };
    }
    ${helperBlock};
    return { buildCustomCollectibleSubtitle, mapCustomEntry };
  `);
  const { buildCustomCollectibleSubtitle, mapCustomEntry } = buildHelpers();

  assert.equal(
    buildCustomCollectibleSubtitle({
      game: "Riftbound",
      category: "Single",
      series: "Origins",
      variant: "Showcase",
    }),
    "Riftbound | Single | Origins | Showcase",
  );

  const mapped = mapCustomEntry({
    id: "custom-1",
    label: "Miss Fortune - Bounty Hunter",
    game: "Riftbound",
    category: "Single",
    series: "Origins",
    variant: "Showcase",
    currentPrice: 174.62,
    quantity: 1,
  });

  assert.equal(mapped.title, "Miss Fortune - Bounty Hunter");
  assert.equal(mapped.subtitle, "Riftbound | Single | Origins | Showcase");
  assert.equal(mapped.supertype, "Single");
});
