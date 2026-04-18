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
