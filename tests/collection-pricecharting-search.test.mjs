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

test("pricecharting collectible search rows map sealed product and other TCG items into stable ids", () => {
  const source = readFile("workers/pricing-service/src/lib/priceCharting.ts");
  const helperBlock = extractBetween(source, "function normalizeQueryPart", "function includesAllTokens");
  const buildHelpers = new Function(`const exports = {}; const PRICECHARTING_BASE_URL = "https://www.pricecharting.com"; ${transpile(helperBlock)}; return { buildPriceChartingCollectionId, priceChartingCollectionIdToUrl, parseSearchResultRows };`);
  const { buildPriceChartingCollectionId, priceChartingCollectionIdToUrl, parseSearchResultRows } = buildHelpers();

  const html = `
    <tr id="product-10560623" data-product="10560623">
      <td class="image">
        <div>
          <a href="https://www.pricecharting.com/game/riftbound-origins/booster-display" title="10560623">
            <img class="photo" loading="lazy" src="https://storage.googleapis.com/images.pricecharting.com/upxnjhfjqgnlau67/60.jpg" />
          </a>
        </div>
      </td>
      <td class="title">
        <a href="https://www.pricecharting.com/game/riftbound-origins/booster-display" title="10560623">
          Booster Display</a>
        <div class="console-in-title">
          <a href="/console/riftbound-origins">Riftbound Origins</a>
        <div>
      </td>
      <td class="price numeric used_price"><span class="js-price">$325.60</span></td>
    </tr>
    <tr id="product-11748912" data-product="11748912">
      <td class="image">
        <div>
          <a href="https://www.pricecharting.com/game/pokemon-ascended-heroes/booster-bundle" title="11748912">
            <img class="photo" loading="lazy" src="https://storage.googleapis.com/images.pricecharting.com/aovdfqgyeftmekpl/60.jpg" />
          </a>
        </div>
      </td>
      <td class="title">
        <a href="https://www.pricecharting.com/game/pokemon-ascended-heroes/booster-bundle" title="11748912">
          Booster Bundle</a>
        <div class="console-in-title">
          <a href="/console/pokemon-ascended-heroes">Pokemon Ascended Heroes</a>
        <div>
      </td>
      <td class="price numeric used_price"><span class="js-price">$78.91</span></td>
    </tr>
  `;

  const results = parseSearchResultRows(html);

  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    id: "pricecharting:/game/riftbound-origins/booster-display",
    sourceUrl: "https://www.pricecharting.com/game/riftbound-origins/booster-display",
    title: "Booster Display",
    setName: "Riftbound Origins",
    thumbnail: "https://storage.googleapis.com/images.pricecharting.com/upxnjhfjqgnlau67/60.jpg",
    currentPrice: 325.6,
  });
  assert.equal(
    buildPriceChartingCollectionId("https://www.pricecharting.com/game/pokemon-ascended-heroes/booster-bundle"),
    "pricecharting:/game/pokemon-ascended-heroes/booster-bundle",
  );
  assert.equal(
    priceChartingCollectionIdToUrl("pricecharting:/game/pokemon-ascended-heroes/booster-bundle"),
    "https://www.pricecharting.com/game/pokemon-ascended-heroes/booster-bundle",
  );
});

test("pricecharting collectible detail metadata identifies sealed Pokemon products and Riftbound cards", () => {
  const source = readFile("workers/pricing-service/src/lib/priceCharting.ts");
  const helperBlock = extractBetween(source, "function normalizeQueryPart", "async function resolveProductPage");
  const buildHelpers = new Function(`const exports = {}; ${transpile(helperBlock)}; return { extractCollectiblePageMetadata };`);
  const { extractCollectiblePageMetadata } = buildHelpers();

  const sealedHtml = `
    <title>Booster Bundle Prices | Pokemon Ascended Heroes | Pokemon Cards</title>
    <div class="item_breadcrumbs">
      <span>
        <a href="/category/pokemon-cards">Pokemon Cards</a> &gt;
        <a href="/console/pokemon-ascended-heroes">Pokemon Ascended Heroes</a>
      </span>
    </div>
    <meta itemprop="name" content="Booster Bundle" />
    <meta itemprop="operatingSystem" content="Pokemon Ascended Heroes" />
    <table>
      <tr><td>Genre:</td><td>Sealed Product</td></tr>
      <tr><td>Card Number:</td><td>none</td></tr>
      <tr><td>Description:</td><td>Factory sealed bundle</td></tr>
    </table>
    <div id="js-dialog-large-image" class="dialog">
      <img src='https://storage.googleapis.com/images.pricecharting.com/aovdfqgyeftmekpl/1600.jpg' />
    </div>
  `;

  const riftboundHtml = `
    <title>Harnessed Dragon #234 Prices | Riftbound Origins | Other TCG Cards</title>
    <div class="item_breadcrumbs">
      <span>
        <a href="/trading-cards">Trading Cards</a> &gt;
        <a href="/category/other-tcg-cards">Other TCG Cards</a> &gt;
        <a href="/console/riftbound-origins">Riftbound Origins</a>
      </span>
    </div>
    <meta itemprop="name" content="Harnessed Dragon" />
    <meta itemprop="operatingSystem" content="Riftbound Origins" />
    <table>
      <tr><td>Genre:</td><td>Trading Card</td></tr>
      <tr><td>Card Number:</td><td>#234</td></tr>
      <tr><td>Description:</td><td>Origins rare</td></tr>
    </table>
    <div id="js-dialog-large-image" class="dialog">
      <img src='https://storage.googleapis.com/images.pricecharting.com/example-riftbound/1600.jpg' />
    </div>
  `;

  assert.deepEqual(
    extractCollectiblePageMetadata(
      "https://www.pricecharting.com/game/pokemon-ascended-heroes/booster-bundle",
      sealedHtml,
    ),
    {
      title: "Booster Bundle",
      game: "Pokemon",
      category: "Sealed Product",
      series: "Ascended Heroes",
      itemNumber: "",
      description: "Factory sealed bundle",
      image: "https://storage.googleapis.com/images.pricecharting.com/aovdfqgyeftmekpl/1600.jpg",
      setName: "Pokemon Ascended Heroes",
    },
  );

  assert.deepEqual(
    extractCollectiblePageMetadata(
      "https://www.pricecharting.com/game/riftbound-origins/harnessed-dragon-234",
      riftboundHtml,
    ),
    {
      title: "Harnessed Dragon",
      game: "Riftbound",
      category: "Trading Card",
      series: "Origins",
      itemNumber: "234",
      description: "Origins rare",
      image: "https://storage.googleapis.com/images.pricecharting.com/example-riftbound/1600.jpg",
      setName: "Riftbound Origins",
    },
  );
});

test("pricecharting search query expansion keeps sealed searches clean and adds metal variant coverage for numbered cards", () => {
  const source = readFile("workers/pricing-service/src/lib/priceCharting.ts");
  const helperBlock = extractBetween(source, "function normalizeQueryPart", "async function fetchHtml");
  const buildHelpers = new Function(
    `const exports = {}; const PRICECHARTING_BASE_URL = "https://www.pricecharting.com"; ${transpile(helperBlock)}; return { buildExpandedSearchQueries };`,
  );
  const { buildExpandedSearchQueries } = buildHelpers();

  const numberedCardQueries = buildExpandedSearchQueries("mew 205");
  assert.deepEqual(numberedCardQueries.slice(0, 3), [
    "mew 205",
    "mew 205 metal",
    "mew 205 hyper rare",
  ]);
  assert.ok(numberedCardQueries.includes("mew 205 full art"));
  assert.ok(numberedCardQueries.includes("mew 205 ultra rare"));
  assert.ok(numberedCardQueries.includes("mew 205 illustration rare"));
  assert.ok(numberedCardQueries.includes("mew 205 special illustration rare"));

  const metalQueries = buildExpandedSearchQueries("mew 205 metal");
  assert.equal(metalQueries[0], "mew 205 metal");
  assert.ok(metalQueries.includes("mew 205 metal hyper rare"));
  assert.ok(metalQueries.includes("mew 205 metal full art"));
  assert.deepEqual(buildExpandedSearchQueries("booster bundle"), ["booster bundle"]);
});

test("public explorer and admin workspace both use pricecharting-backed collectible search routes", () => {
  const collectionSource = readFile("assets/js/collection.js");
  const adminSource = readFile("assets/js/collection-admin.js");
  const workerSource = readFile("workers/pricing-service/src/index.ts");
  const publicSearchBlock = extractBetween(collectionSource, "async function searchCards(query)", "function bindEvents");

  assert.match(collectionSource, /\/api\/collectibles\/search\?q=/);
  assert.match(adminSource, /\/api\/collectibles\/search\?q=/);
  assert.doesNotMatch(adminSource, /\/api\/pokemon\/cards\/search\?q=/);
  assert.doesNotMatch(publicSearchBlock, /directApiBase/);
  assert.match(collectionSource, /Enter a card name, number, or variant search\./);
  assert.match(collectionSource, /Searching PriceCharting-backed collectible results\.\.\./);
  assert.match(collectionSource, /No collectible results found\. Try a card number, variant name, or sealed product search\./);
  assert.match(workerSource, /\/api\/collectibles\/search/);
  assert.match(workerSource, /\/api\/pricecharting\/search/);
  assert.match(workerSource, /\/api\/pricecharting\/item/);
});
