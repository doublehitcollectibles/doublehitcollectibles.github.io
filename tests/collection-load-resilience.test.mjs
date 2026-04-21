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

test("selectCard keeps the cached card visible when live detail refresh fails", async () => {
  const source = readFile("assets/js/collection.js");
  const helperBlock = extractBetween(source, "function buildDetailRefreshWarning", "async function loadCollection");
  const state = {
    ownedCards: [],
    searchResults: [],
    selectedCard: null,
    inlineDetailTarget: null,
    inlineDetailCardId: null,
    selectionRequestId: 0,
  };
  const renderStatuses = [];
  const detailRenders = [];
  const gridRenders = [];
  const syncedCards = [];
  const buildHelpers = new Function(
    "state",
    "apiBase",
    "renderAllCardGrids",
    "renderDetail",
    "fetchWorkerCard",
    "isPriceChartingCardRecord",
    "fetchWorkerCustomCard",
    "renderStatus",
    "normalizeCollectionCardRecord",
    "syncCardAcrossCollections",
    `${helperBlock}; return { selectCard };`,
  );
  const { selectCard } = buildHelpers(
    state,
    "https://worker.example",
    () => {
      gridRenders.push("grid");
    },
    (card) => {
      detailRenders.push(card);
    },
    async () => {
      throw new Error("Request failed (500)");
    },
    (card) => card?.kind === "custom" && /^pricecharting:/i.test(String(card?.id || "")),
    async () => {
      throw new Error("Request failed (500)");
    },
    (message, mode) => {
      renderStatuses.push({ message, mode });
    },
    (card) => ({ ...card, normalized: true }),
    (card) => {
      syncedCards.push(card);
    },
  );

  const cachedCard = {
    id: "pricecharting:/game/pokemon-shining-fates/morpeko-v-37",
    kind: "custom",
    title: "Morpeko V",
    ownership: { quantity: 1 },
  };

  await assert.doesNotReject(() => selectCard(cachedCard));

  assert.equal(state.selectedCard.id, cachedCard.id);
  assert.equal(state.selectedCard.normalized, true);
  assert.equal(gridRenders.length, 2);
  assert.equal(detailRenders.length, 2);
  assert.equal(syncedCards.length, 1);
  assert.equal(renderStatuses.length, 1);
  assert.equal(renderStatuses[0].mode, "error");
  assert.match(renderStatuses[0].message, /Showing the cached tracked collection data instead\./);
  assert.match(renderStatuses[0].message, /Request failed \(500\)/);
});

test("loadCollection sets the baseline status before the initial selected-card refresh", () => {
  const source = readFile("assets/js/collection.js");
  const loadBlock = extractBetween(source, "async function loadCollection", "async function searchCards");

  assert.match(loadBlock, /renderStatus\([\s\S]*\);\s*await selectCard\(state\.ownedCards\[0\]\);/);
  assert.doesNotMatch(loadBlock, /await selectCard\(state\.ownedCards\[0\]\);\s*renderStatus\(/);
});
