import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

function loadLayoutApi() {
  const filePath = path.resolve("assets/js/collection-grid-layout.js");
  const source = fs.readFileSync(filePath, "utf8");
  const context = {
    console,
    globalThis: {},
  };

  context.window = context.globalThis;
  vm.runInNewContext(source, context, { filename: filePath });
  return context.globalThis.CollectionGridLayout;
}

function buildCards(ids) {
  return ids.map((id) => ({ id }));
}

function summarize(items) {
  return Array.from(items, (item) => {
    if (item.type === "detail") {
      return `detail:${item.cardId}:${item.span}`;
    }

    return item.card.id;
  });
}

test("keeps the selected card followed by an inline detail slot when the row has room", () => {
  const api = loadLayoutApi();
  const items = api.buildInlineDetailLayout(buildCards(["a", "b", "c", "d"]), "b", 4);

  assert.deepEqual(summarize(items), ["a", "b", "detail:b:2", "c", "d"]);
});

test("moves the selected card earlier in its row when needed so the detail stays on the right", () => {
  const api = loadLayoutApi();
  const items = api.buildInlineDetailLayout(buildCards(["a", "b", "c", "d", "e"]), "d", 4);

  assert.deepEqual(summarize(items), ["a", "d", "detail:d:2", "b", "c", "e"]);
});

test("uses a one-column detail slot on tighter two-column grids", () => {
  const api = loadLayoutApi();
  const items = api.buildInlineDetailLayout(buildCards(["a", "b", "c"]), "b", 2);

  assert.deepEqual(summarize(items), ["b", "detail:b:1", "a", "c"]);
});
