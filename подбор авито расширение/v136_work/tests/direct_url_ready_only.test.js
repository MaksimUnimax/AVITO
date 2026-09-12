"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("direct Avito page URL is applied as visible navigation and no longer ignored", () => {
  const worker = fs.readFileSync(path.join(__dirname, "..", "service_worker.js"), "utf8");
  assert.match(worker, /function directPublicAvitoUrl\(/);
  assert.match(worker, /AVITO_DIRECT_URL_NAVIGATED/);
  assert.match(worker, /requestedUrl,/);
  assert.doesNotMatch(worker, /AVITO_COMMAND_URL_IGNORED/);
});

test("sequential next card uses the persisted runtime card-gap setting after readiness and prior-tab closure", () => {
  const worker = fs.readFileSync(path.join(__dirname, "..", "service_worker.js"), "utf8");
  assert.match(worker, /const SEQUENTIAL_REVIEW_DEFAULT_CARD_GAP_MS = 0;/);
  assert.match(worker, /function checkpointCardGapMs\(plan, checkpoint\)/);
  assert.match(worker, /const cardGapMs\s*=\s*normalizeSequentialCardGapMs\(checkpoint\.card_gap_ms\)/);
  assert.match(worker, /checkpoint\.resume_after=.*Date\.now\(\)\+cardGapMs/);
  assert.match(worker, /waitForSequentialCardReady/);
  assert.match(worker, /closeSequentialOwnedCard/);
});

test("collector returns the visible price text without a local price-quality judgement", () => {
  const worker = fs.readFileSync(path.join(__dirname, "..", "service_worker.js"), "utf8");
  assert.doesNotMatch(worker, /function confirmedPriceText\(/);
  assert.match(worker, /price: detail\.price \|\| summary\?\.price \|\| ""/);
});
