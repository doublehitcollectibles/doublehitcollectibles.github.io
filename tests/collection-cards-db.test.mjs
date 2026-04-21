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

function transpileModule(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

test("listCollectionCards falls back to the legacy column set when the custom-entry migration is missing", async () => {
  const source = readFile("workers/pricing-service/src/lib/collectionCardsDb.ts");
  const stripped = source.replace(/^import type .*$/gm, "");
  const moduleFactory = new Function(
    "exports",
    "module",
    `${transpileModule(stripped)}; return module.exports;`,
  );
  const module = { exports: {} };
  const exports = moduleFactory(module.exports, module);

  const queries = [];
  let attempt = 0;
  const db = {
    prepare(query) {
      queries.push(query);
      return {
        async all() {
          attempt += 1;

          if (attempt === 1) {
            throw new Error("no such column: source");
          }

          return {
            results: [
              {
                id: 7,
                owner_username: "Clutch",
                card_id: "svp-52",
                source: null,
                label: "Mewtwo",
                game: null,
                category: null,
                series: null,
                variant: null,
                item_number: null,
                image: null,
                artist: null,
                description: null,
                currency: null,
                current_price: null,
                price_source: null,
                quantity: 1,
                purchase_price: 35,
                purchase_date: null,
                price_type: "holofoil",
                ownership_price_variant: "psa10",
                condition: "nm",
                notes: null,
                created_at: "2026-04-20T00:00:00.000Z",
                updated_at: "2026-04-20T00:00:00.000Z",
              },
            ],
          };
        },
      };
    },
  };

  const cards = await exports.listCollectionCards(db);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].cardId, "svp-52");
  assert.equal(cards[0].source, "api");
  assert.equal(cards[0].ownershipPriceVariant, "psa10");
  assert.equal(queries.length, 2);
  assert.match(queries[0], /\bsource\b/);
  assert.match(queries[1], /NULL AS source/);
  assert.match(queries[1], /NULL AS ownership_price_variant/);
});
