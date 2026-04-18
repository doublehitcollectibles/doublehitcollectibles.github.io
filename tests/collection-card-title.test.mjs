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

test("card title normalization falls back to the card name when the saved label is blank", () => {
  const collectionSource = readFile("assets/js/collection.js");
  const titleHelpers = extractBetween(collectionSource, "function normalizeDisplayText", "function renderDetail");
  const buildHelpers = new Function(`${titleHelpers}; return { normalizeDisplayText, getCardDisplayTitle };`);
  const { normalizeDisplayText, getCardDisplayTitle } = buildHelpers();

  assert.equal(normalizeDisplayText("   "), "");
  assert.equal(
    getCardDisplayTitle({
      title: "   ",
      cardName: "Moltres & Zapdos & Articuno-GX",
      name: "Fallback Name",
    }),
    "Moltres & Zapdos & Articuno-GX",
  );
  assert.equal(
    getCardDisplayTitle({
      title: "  Shining Rayquaza  ",
      cardName: "Ignored Name",
    }),
    "Shining Rayquaza",
  );
});

test("collection card normalization rebuilds a visible title and subtitle for worker-backed cards", () => {
  const collectionSource = readFile("assets/js/collection.js");
  const titleHelpers = extractBetween(collectionSource, "function normalizeDisplayText", "function renderDetail");
  const buildHelpers = new Function(
    `${titleHelpers}; return { normalizeCollectionCardRecord };`,
  );
  const { normalizeCollectionCardRecord } = buildHelpers();

  const normalized = normalizeCollectionCardRecord({
    id: "sv1-5",
    title: "   ",
    cardName: "   ",
    name: "Moltres & Zapdos & Articuno-GX",
    subtitle: "   ",
    setName: "Hidden Fates",
    rarity: "Rare Holo GX",
    number: "44",
    image: "   ",
    thumbnail: "/card.png",
  });

  assert.equal(normalized.title, "Moltres & Zapdos & Articuno-GX");
  assert.equal(normalized.cardName, "Moltres & Zapdos & Articuno-GX");
  assert.equal(normalized.subtitle, "Hidden Fates | Rare Holo GX | 44");
  assert.equal(normalized.image, "/card.png");
  assert.equal(normalized.thumbnail, "/card.png");
});

test("card markup uses dedicated title classes so the name and subtitle can be styled explicitly", () => {
  const collectionSource = readFile("assets/js/collection.js");
  const renderCardMarkupBlock = extractBetween(collectionSource, "function renderCardMarkup", "function renderCardGrid");

  assert.match(
    renderCardMarkupBlock,
    /<h3 class="collection-card-title">\$\{escapeHtml\(displayTitle\)\}<\/h3>/,
  );
  assert.match(
    renderCardMarkupBlock,
    /<p class="collection-card-copy collection-card-subtitle">\$\{escapeHtml\(displaySubtitle\)\}<\/p>/,
  );
});

test("collection card styles make the title and subtitle more noticeable", () => {
  const stylesheet = readFile("_sass/_collection.scss");

  assert.match(
    stylesheet,
    /\.collection-grid-wrap--tracked \.collection-card \.collection-card-title,\s*\.collection-search-results \.collection-card \.collection-card-title\s*\{[\s\S]*?color:\s*#fff4cf\s*!important;[\s\S]*?text-shadow:\s*0 1px 1px rgba\(0, 0, 0, 0\.42\);[\s\S]*?\}/,
  );
  assert.match(
    stylesheet,
    /\.collection-grid-wrap--tracked \.collection-card \.collection-card-subtitle,\s*\.collection-search-results \.collection-card \.collection-card-subtitle\s*\{[\s\S]*?color:\s*rgba\(234, 241, 245, 0\.76\)\s*!important;[\s\S]*?\}/,
  );
});
