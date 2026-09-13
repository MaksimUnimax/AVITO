"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("v1.0.38 is the unified recovery build", () => {
  assert.equal(manifest.version, "1.0.38");
});

test("collection-first UI-plan AVITO_IP_BLOCK enters verified recovery instead of reporting immediately", () => {
  const start = worker.indexOf('if (working.command_mode === "AVITO_UI")');
  const end = worker.indexOf('const snapshot = await inspectAvito', start);
  const branch = worker.slice(start, end);
  assert.match(branch, /uiPlanInterruption/);
  assert.match(branch, /Recovery\.interruption\(result \|\| \{\}\)/);
  assert.match(branch, /Recovery\.replayPolicy\(plan\) === "READ_ONLY"/);
  assert.match(branch, /AVITO_UI_PLAN_CONNECTION_RECOVERY_STARTED/);
  assert.match(branch, /recoverAvitoConnectionAndReload\(retryState, verified, 0, "ui_plan_collection_connection_interruption"/);
  assert.ok(branch.indexOf('AVITO_UI_PLAN_CONNECTION_RECOVERY_STARTED') < branch.indexOf('AVITO_UI_PLAN_REPORT_READY'));
});

test("UI-plan replay preserves the bounded IP-block recovery counter", () => {
  assert.match(worker, /avito_ip_block_reload_count: Number\(latest\.avito_ip_block_reload_count \|\| 0\)/);
  assert.doesNotMatch(worker, /avito_reload_previous_time_origin: null, avito_ip_block_reload_count: 0, blocked_reason: null/);
});

test("terminal UI recovery failures use the common pinned-chat report boundary", () => {
  const start=worker.indexOf("async function recoverAvitoConnectionAndReload");
  const end=worker.indexOf("async function completeAvitoTaskUnlocked",start);
  const branch=worker.slice(start,end);
  assert.match(branch,/blockAvitoPageReady/);
  assert.match(worker,/returnAvitoRuntimeFailureToPinnedChat/);
  assert.match(worker,/REPORT_DELIVERY_CONTEXT_CHECK_FAILED/);
});
