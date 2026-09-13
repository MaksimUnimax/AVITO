"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const worker = fs.readFileSync(path.join(__dirname, "..", "service_worker.js"), "utf8");

test("explicit-queue checkpoint persists only for an active collection or manual CAPTCHA pause", () => {
  assert.match(worker, /kind: "assistant_explicit_public_url_queue"/);
  assert.match(worker, /paused_after_test_batch/);
  assert.match(worker, /paused_for_manual_captcha/);
  assert.match(worker, /EXPLICIT_PUBLIC_QUEUE_NO_RESUMABLE_CHECKPOINT/);
});

test("manual CAPTCHA remains a user-only boundary", () => {
  assert.match(worker, /CAPTCHA_MANUAL_REQUIRED/);
  assert.match(worker, /explicit_queue_captcha_manual_recheck/);
  for (const forbidden of ["solveCaptcha", "captchaSolver", "captchaBypass", "autoRefreshCaptcha"]) assert.equal(worker.includes(forbidden), false, forbidden);
});

test("only run-owned child tabs are closed", () => {
  const start = worker.indexOf("async function closeSequentialOwnedCard");
  const end = worker.indexOf("async function assertSequentialParent", start);
  const fn = worker.slice(start, end);
  assert.match(fn, /tab\.windowId !== windowId/);
  assert.match(fn, /tab\.openerTabId/);
  assert.match(fn, /tabsRemove/);
});
