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

test("inline detail template keeps the selected-card title on the card instead of repeating it in the detail", () => {
  const collectionSource = readFile("assets/js/collection.js");
  const inlineDetailBlock = extractBetween(collectionSource, "function renderInlineDetail", "function renderStatus");

  assert.match(inlineDetailBlock, /class="collection-inline-detail-close"/);
  assert.doesNotMatch(inlineDetailBlock, /collection-inline-detail-title/);
  assert.doesNotMatch(inlineDetailBlock, /collection-inline-detail-media/);
  assert.doesNotMatch(inlineDetailBlock, /collection-eyebrow/);
  assert.doesNotMatch(inlineDetailBlock, /collection-inline-detail-copy/);
});

test("inline detail template renders compact stat rows with inline labels and values", () => {
  const collectionSource = readFile("assets/js/collection.js");
  const inlineDetailBlock = extractBetween(collectionSource, "function renderInlineDetail", "function renderStatus");

  assert.match(
    inlineDetailBlock,
    /<article class="collection-inline-detail-stat">\s*<span class="collection-inline-detail-stat-label">Raw<\/span>\s*<span class="collection-inline-detail-stat-value">\$\{formatCurrency\(rawPrice\?\.currentPrice, rawPrice\?\.currency \|\| card\.pricing\?\.currency\)\}<\/span>\s*<\/article>/,
  );
  assert.match(
    inlineDetailBlock,
    /<article class="collection-inline-detail-stat">\s*<span class="collection-inline-detail-stat-label">PSA10<\/span>\s*<span class="collection-inline-detail-stat-value">\$\{formatCurrency\(psa10Price\?\.currentPrice, psa10Price\?\.currency \|\| card\.pricing\?\.currency\)\}<\/span>\s*<\/article>/,
  );
});

test("inline detail styles keep the shell flush and the stat tiles compact", () => {
  const stylesheet = readFile("_sass/_collection.scss");

  assert.match(
    stylesheet,
    /\.collection-inline-detail-shell\s*\{[\s\S]*?grid-template-areas:\s*"header"\s*"body";[\s\S]*?padding:\s*0;[\s\S]*?\}/,
  );
  assert.match(
    stylesheet,
    /\.collection-inline-detail-body\s*\{[\s\S]*?grid-template-areas:\s*"pills"\s*"stats"\s*"history";[\s\S]*?\}/,
  );
  assert.match(
    stylesheet,
    /\.collection-inline-detail-stats\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?width:\s*min\(100%,\s*228px\);[\s\S]*?\}/,
  );
  assert.match(
    stylesheet,
    /\.collection-inline-detail-stat\s*\{[\s\S]*?min-block-size:\s*14px;[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*auto minmax\(0,\s*1fr\);[\s\S]*?\}/,
  );
  assert.match(
    stylesheet,
    /\.collection-inline-detail-stat-label\s*\{[\s\S]*?font-size:\s*6px;[\s\S]*?\}/,
  );
  assert.match(
    stylesheet,
    /\.collection-inline-detail-stat-value\s*\{[\s\S]*?font-size:\s*8px;[\s\S]*?justify-self:\s*end;[\s\S]*?\}/,
  );
});
