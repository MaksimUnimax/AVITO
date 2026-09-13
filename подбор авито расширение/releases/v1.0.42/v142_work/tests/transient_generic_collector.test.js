"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");
test("runtime has no product-domain scoring or carried completed inventory", () => {
  const core = fs.readFileSync(path.join(root, "core.js"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
  for (const forbidden of ["coreldraw", "CorelDRAW", "seller_rating_reviews_desc", "delivery_fastest", "price_asc", "all_candidates", "sortPublicCandidates", "missingRequiredFieldCandidates"]) {
    assert.equal(core.includes(forbidden) || worker.includes(forbidden), false, forbidden);
  }
  assert.match(core, /explicitPublicQueueUrls/);
  assert.match(worker, /assistant_explicit_url_order/);
  assert.match(worker, /sequential_review: null/);
  assert.match(worker, /report: null/);
});
