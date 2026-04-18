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
    /\.collection-inline-detail-stats\s*\{[\s\S]*?width:\s*min\(100%,\s*184px\);[\s\S]*?\}/,
  );
  assert.match(
    stylesheet,
    /\.collection-inline-detail-stat\s*\{[\s\S]*?min-block-size:\s*24px;[\s\S]*?\}/,
  );
});
