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
  const helperBlock = extractBetween(source, "function buildWorkerStatusMessage", "async function loadCollection");
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

test("selectCard can skip the live refresh when background updates are responsible for owned cards", async () => {
  const source = readFile("assets/js/collection.js");
  const helperBlock = extractBetween(source, "function buildWorkerStatusMessage", "async function loadCollection");
  const state = {
    ownedCards: [],
    searchResults: [],
    selectedCard: null,
    inlineDetailTarget: null,
    inlineDetailCardId: null,
    selectionRequestId: 0,
  };
  let fetchWorkerCardCalls = 0;
  let fetchWorkerCustomCardCalls = 0;
  const renderStatuses = [];
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
    () => {},
    () => {},
    async () => {
      fetchWorkerCardCalls += 1;
      throw new Error("should not refresh api card");
    },
    (card) => card?.kind === "custom" && /^pricecharting:/i.test(String(card?.id || "")),
    async () => {
      fetchWorkerCustomCardCalls += 1;
      throw new Error("should not refresh custom card");
    },
    (message, mode) => {
      renderStatuses.push({ message, mode });
    },
    (card) => ({ ...card, normalized: true }),
    () => {},
  );

  await assert.doesNotReject(() =>
    selectCard(
      {
        id: "sm70",
        kind: "api",
        title: "Shining Ho-Oh",
      },
      {
        refreshLive: false,
        forceRefresh: false,
      },
    ),
  );

  assert.equal(fetchWorkerCardCalls, 0);
  assert.equal(fetchWorkerCustomCardCalls, 0);
  assert.equal(renderStatuses.length, 0);
  assert.equal(state.selectedCard.id, "sm70");
});

test("refreshOwnedCardsInBackground refreshes tracked cards sequentially and updates the selected detail", async () => {
  const source = readFile("assets/js/collection.js");
  const helperBlock = extractBetween(source, "function buildWorkerStatusMessage", "async function loadCollection");
  const state = {
    ownedCards: [
      { id: "sm70", kind: "api", title: "Shining Ho-Oh" },
      { id: "pricecharting:/game/pokemon-shining-fates/morpeko-v-37", kind: "custom", title: "Morpeko V" },
    ],
    searchResults: [],
    selectedCard: { id: "sm70", kind: "api", title: "Shining Ho-Oh" },
    inlineDetailTarget: "owned",
    inlineDetailCardId: "sm70",
    selectionRequestId: 0,
    sourceMode: "worker",
    ownedCardRefreshRunId: 0,
  };
  const order = [];
  const statuses = [];
  const detailRenders = [];
  const summarySnapshots = [];
  const buildHelpers = new Function(
    "state",
    "apiBase",
    "window",
    "renderStatus",
    "syncCardAcrossCollections",
    "renderSummary",
    "renderAllCardGrids",
    "renderDetail",
    "fetchWorkerCard",
    "isPriceChartingCardRecord",
    "fetchWorkerCustomCard",
    "normalizeCollectionCardRecord",
    "console",
    `const OWNED_CARD_REFRESH_DELAY_MS = 0; ${helperBlock}; return { refreshOwnedCardsInBackground };`,
  );
  const { refreshOwnedCardsInBackground } = buildHelpers(
    state,
    "https://worker.example",
    {
      setTimeout(callback) {
        callback();
        return 0;
      },
    },
    (message, mode) => {
      statuses.push({ message, mode });
    },
    (updatedCard) => {
      const replace = (card) => (card.id === updatedCard.id ? updatedCard : card);
      state.ownedCards = state.ownedCards.map(replace);
      state.searchResults = state.searchResults.map(replace);
    },
    (cards) => {
      summarySnapshots.push(cards.map((card) => card.id));
    },
    () => {},
    (card) => {
      detailRenders.push(card);
    },
    async (cardId) => {
      order.push(cardId);
      return { id: cardId, kind: "api", title: "Shining Ho-Oh", refreshed: true };
    },
    (card) => card?.kind === "custom" && /^pricecharting:/i.test(String(card?.id || "")),
    async (cardId) => {
      order.push(cardId);
      return { id: cardId, kind: "custom", title: "Morpeko V", refreshed: true };
    },
    (card) => ({ ...card, normalized: true }),
    { error() {} },
  );

  await refreshOwnedCardsInBackground(state.ownedCards.slice());

  assert.deepEqual(order, [
    "sm70",
    "pricecharting:/game/pokemon-shining-fates/morpeko-v-37",
  ]);
  assert.equal(state.ownedCards.every((card) => card.refreshed === true), true);
  assert.equal(state.selectedCard.refreshed, true);
  assert.equal(detailRenders.length, 1);
  assert.ok(summarySnapshots.length >= 2);
  assert.match(statuses[0].message, /Refreshing tracked cards 0\/2/);
  assert.match(statuses.at(-1).message, /Refreshed all 2 tracked cards/);
});

test("loadCollection selects cached data first and then starts the staggered owned-card refresh queue", () => {
  const source = readFile("assets/js/collection.js");
  const loadBlock = extractBetween(source, "async function loadCollection", "async function searchCards");

  assert.match(loadBlock, /await selectCard\(state\.ownedCards\[0\],\s*\{\s*refreshLive:\s*false,\s*forceRefresh:\s*false,\s*\}\);/s);
  assert.match(loadBlock, /refreshOwnedCardsInBackground\(state\.ownedCards\.slice\(\)\)\.catch/);
});
