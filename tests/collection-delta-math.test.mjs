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

test("series delta prefers explicit daily change metrics over sparse chart spacing", () => {
  const source = readFile("assets/js/collection.js");
  const helperBlock = extractBetween(source, "function getPriceVariant", "function normalizeHistorySeries");
  const buildHelpers = new Function(`${helperBlock}; return { getSeriesDelta };`);
  const { getSeriesDelta } = buildHelpers();

  const sparseMonthlySeries = {
    key: "raw",
    points: [
      { capturedAt: "2026-03-01T07:00:00.000Z", price: 43.88 },
      { capturedAt: "2026-04-01T06:00:00.000Z", price: 53.12 },
    ],
  };

  const delta = getSeriesDelta(sparseMonthlySeries, 53.12, {
    dailyChangeAmount: 2.45,
    dailyChangePercent: (2.45 / (53.12 - 2.45)) * 100,
  });

  assert.equal(Number(delta?.delta?.toFixed(2)), 2.45);
  assert.equal(Number(delta?.percent?.toFixed(2)), 4.84);
});

test("series delta falls back to chart-point comparison when explicit metrics are unavailable", () => {
  const source = readFile("assets/js/collection.js");
  const helperBlock = extractBetween(source, "function getPriceVariant", "function normalizeHistorySeries");
  const buildHelpers = new Function(`${helperBlock}; return { getSeriesDelta };`);
  const { getSeriesDelta } = buildHelpers();

  const series = {
    key: "raw",
    points: [
      { capturedAt: "2026-04-18T00:00:00.000Z", price: 31.94 },
      { capturedAt: "2026-04-19T00:00:00.000Z", price: 39.5 },
    ],
  };

  const delta = getSeriesDelta(series, 39.5, {});

  assert.equal(Number(delta?.delta?.toFixed(2)), 7.56);
  assert.equal(Number(delta?.percent?.toFixed(2)), 23.67);
});
