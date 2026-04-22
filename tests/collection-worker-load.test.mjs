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

function transpileModule(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

test("stored collection loads custom items and API cards from persisted snapshots before live rehydrating", async () => {
  const source = readFile("workers/pricing-service/src/lib/pokemonTcg.ts");
  const start = source.indexOf("export async function getStoredCollectionCards");

  if (start === -1) {
    throw new Error("Unable to locate getStoredCollectionCards");
  }

  const getStoredCollectionCardsSource = transpileModule(
    source.slice(start).replace("export async function", "async function"),
  );
  const liveHydrationCalls = [];
  const mappedCards = [];
  const storedSnapshotHydrations = [];
  const buildHelpers = new Function(
    "listCollectionCards",
    "getOwnedCollection",
    "mapCustomCollectionSummary",
    "getRecentPokemonCardSnapshots",
    "selectPreferredStoredSnapshot",
    "getPokemonCardHistory",
    "mapPokemonCardSummary",
    "getPokemonCardDetail",
    `${getStoredCollectionCardsSource}; return { getStoredCollectionCards };`,
  );
  const { getStoredCollectionCards } = buildHelpers(
    async () => [
      {
        id: 1,
        source: "custom",
        cardId: "pricecharting:/game/pokemon-shining-fates/morpeko-v-37",
        label: "Morpeko V",
        currentPrice: 12.5,
      },
      {
        id: 2,
        source: "api",
        cardId: "sm70",
      },
    ],
    () => ({ currency: "USD" }),
    (entry, fallbackCurrency) => {
      mappedCards.push({ entry, fallbackCurrency });
      return { kind: "custom", id: entry.cardId, title: entry.label || "Custom" };
    },
    async (_db, cardId) => (
      cardId === "sm70"
        ? [{ card_payload: JSON.stringify({ id: "sm70", name: "API card" }), price_payload: JSON.stringify({ pricing: { currentPrice: 42 } }) }]
        : []
    ),
    (snapshots) => snapshots[0] ? { snapshot: snapshots[0], payload: { pricing: { currentPrice: 42 } } } : null,
    async () => [],
    (rawCard, entry) => {
      storedSnapshotHydrations.push({ rawCard, entry });
      return { kind: "api", id: rawCard.id, title: rawCard.name };
    },
    async (_env, cardId) => {
      liveHydrationCalls.push(cardId);
      return { kind: "api", id: cardId, title: "Live API card" };
    },
  );

  const cards = await getStoredCollectionCards({ PRICING_DB: {} });

  assert.equal(cards.length, 2);
  assert.equal(cards[0].id, "pricecharting:/game/pokemon-shining-fates/morpeko-v-37");
  assert.equal(cards[1].id, "sm70");
  assert.equal(mappedCards.length, 1);
  assert.equal(storedSnapshotHydrations.length, 1);
  assert.deepEqual(liveHydrationCalls, []);
});
