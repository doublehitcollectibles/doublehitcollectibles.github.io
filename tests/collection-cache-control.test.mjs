import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function readFile(relativePath) {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

test("collection client fetches worker data with no-store caching disabled", () => {
  const source = readFile("assets/js/collection.js");

  assert.match(source, /async function fetchJson\(url\)\s*\{\s*const response = await fetch\(url,\s*\{\s*cache:\s*"no-store"/s);
  assert.match(source, /"cache-control":\s*"no-cache"/);
  assert.match(source, /pragma:\s*"no-cache"/);
});

test("worker json responses send no-store cache headers", () => {
  const source = readFile("workers/pricing-service/src/lib/response.ts");

  assert.match(source, /headers\.set\("cache-control",\s*"no-store, max-age=0"\)/);
  assert.match(source, /headers\.set\("pragma",\s*"no-cache"\)/);
});
