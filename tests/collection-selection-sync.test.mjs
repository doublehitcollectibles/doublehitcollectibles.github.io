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

test("selecting a card syncs refreshed worker pricing back into the visible grids", () => {
  const collectionSource = readFile("assets/js/collection.js");
  const syncBlock = extractBetween(collectionSource, "function syncCardAcrossCollections", "async function selectCard");
  const selectBlock = extractBetween(collectionSource, "async function selectCard", "async function loadCollection");

  assert.match(syncBlock, /state\.ownedCards = state\.ownedCards\.map\(replaceCard\);/);
  assert.match(syncBlock, /state\.searchResults = state\.searchResults\.map\(replaceCard\);/);
  assert.match(selectBlock, /state\.selectedCard = selectedCard;\s*syncCardAcrossCollections\(selectedCard\);/);
});
