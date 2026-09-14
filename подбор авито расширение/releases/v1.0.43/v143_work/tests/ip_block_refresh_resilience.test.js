"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const avito = fs.readFileSync(path.join(root, "avito_content.js"), "utf8");
const core = require("../core.js");

function event() { return { addListener() {}, removeListener() {} }; }
function loadReadinessHelpers() {
  const chrome = {
    runtime: { onInstalled: event(), onMessage: event(), getManifest: () => ({ version: "test" }), lastError: null },
    tabs: { query() {}, get() {}, update() {}, reload() {}, create() {}, sendMessage() {}, remove() {}, onUpdated: event(), onRemoved: event(), onCreated: event() },
    storage: { local: { get() {}, set() {}, remove() {} }, session: { get() {}, set() {}, remove() {} } },
    scripting: { executeScript() {} },
    debugger: { attach() {}, detach() {}, sendCommand() {} },
    proxy: { settings: { set() {}, get() {} } },
    declarativeNetRequest: { updateDynamicRules() {}, updateSessionRules() {}, getSessionRules() {} },
    webRequest: { onAuthRequired: event(), onCompleted: event(), onErrorOccurred: event(), handlerBehaviorChanged() {} }
  };
  const context = { globalThis: { __AF_TEST_EXPORTS: {} }, chrome, console, URL, Date, Math, setTimeout, clearTimeout, Promise, Array, String, Number, Boolean, Error, Set, Map, RegExp, fetch: async () => ({ ok: true, status: 200 }) };
  context.globalThis.globalThis = context.globalThis;
  context.globalThis.fetch = context.fetch;
  context.importScripts = (...names) => {
    for (const name of names) {
      const imported = fs.readFileSync(path.join(root, name), "utf8");
      vm.runInContext(imported, context, { filename: name });
      context.AvitoFinderCore = context.globalThis.AvitoFinderCore;
      context.AvitoFinderProxy = context.globalThis.AvitoFinderProxy;
    }
  };
  vm.createContext(context);
  vm.runInContext(worker, context, { filename: "service_worker.js" });
  return context.globalThis.__AF_TEST_EXPORTS.readiness;
}

test("state tracks same-route reload and bounded IP-block recovery counters", () => {
  const state = core.makeState({});
  assert.equal(state.avito_reload_expected, false);
  assert.equal(state.avito_reload_previous_time_origin, null);
  assert.equal(state.avito_ip_block_reload_count, 0);
  const h = loadReadinessHelpers();
  const tab = { id: 1, windowId: 2, status: "complete", url: "https://www.avito.ru/all/nastolnye_kompyutery?q=pc" };
  const waiting = { current_window_id: 2, avito_navigation_expected: false, avito_reload_expected: true, avito_reload_previous_time_origin: 1000 };
  assert.equal(h.avitoReadyProbeAccepted({ ok: true, data: { ready_state: "complete", body_present: true, href: tab.url, time_origin: 1000 } }, tab, 2, waiting), false);
  assert.equal(h.avitoReadyProbeAccepted({ ok: true, data: { ready_state: "complete", body_present: true, href: tab.url, time_origin: 2000 } }, tab, 2, waiting), true);
});

test("an equivalent requested route on an IP placeholder enters proxy recovery instead of being skipped", () => {
  assert.match(worker, /probeVisibleAvitoInterruption\(tab\)/);
  assert.match(worker, /AVITO_EQUIVALENT_ROUTE_IP_BLOCK_RELOAD_REQUIRED/);
  assert.match(worker, /reload_requested:\s*true/);
  assert.match(worker, /recoverAvitoIpBlockAndReload\(state, avito\.tab/);
  assert.match(worker, /AVITO_DIRECT_URL_NAVIGATION_SKIPPED_EQUIVALENT/);
});

test("all visible IP blocks use a common stateful recovery without an outer counter reset", () => {
  assert.match(worker,/interruption\.ip_block === true && interruption\.captcha !== true/);
  assert.match(worker,/recoverAvitoIpBlockAndReload\(latest, verified,/);
  assert.match(worker,/Recovery\.freshRecovery\(current,tab.id,Date.now\(\),interruptionKind\)/);
  assert.match(worker,/AVITO_CONNECTION_RECOVERY_STARTED/);
  assert.match(worker,/avito_reload_previous_time_origin/);
});

test("IP restriction is classified separately from CAPTCHA and no longer masquerades as a listing page", () => {
  assert.match(avito, /Core\.publicPageInterruptionProbe/);
  assert.match(avito, /block === "AVITO_IP_BLOCK" \? "ip_block"/);
  assert.match(avito, /block === "BLOCKED_LOGIN_OR_CAPTCHA" \? "captcha"/);
  assert.match(worker, /current\?\.page_kind === "ip_block" \|\| current\?\.page_kind === "captcha"/);
});

test("CAPTCHA remains a manual boundary and never invokes IP-block proxy rotation", () => {
  assert.match(worker, /interruption\.captcha === true/);
  assert.match(worker, /interruption\.ip_block === true && interruption\.captcha !== true/);
  assert.match(avito, /probe\.captcha[^\n]+BLOCKED_LOGIN_OR_CAPTCHA/);
  assert.match(worker, /SEQUENTIAL_CAPTCHA_MANUAL_PAUSE/);
  const captchaStart = worker.indexOf('if (interruption.captcha === true');
  const ipStart = worker.indexOf('if (interruption.ip_block === true', captchaStart);
  const captchaBranch = worker.slice(captchaStart, ipStart);
  assert.doesNotMatch(captchaBranch, /forceProxyExitRotation|PROXY_EGRESS_ROTATION_VERIFIED|change_ip_link/);
});

test("IP-block recovery reload explicitly bypasses local cache", () => {
  const h = loadReadinessHelpers();
  assert.equal(h.AVITO_IP_BLOCK_RELOAD_PROPERTIES.bypassCache, true);
  const start = worker.indexOf("async function performReservedConnectionRecoveryInsideLane");
  const end = worker.indexOf("async function recoverAvitoConnectionAndReload", start);
  const fn = worker.slice(start, end);
  assert.match(fn, /tabsReload\(tab\.id,\s*AVITO_IP_BLOCK_RELOAD_PROPERTIES\)/);
  assert.doesNotMatch(fn, /tabsReload\(tab\.id, \{\}\)/);
});

test("main-frame diagnostics record whether Chrome served the response from cache", () => {
  assert.match(worker, /AVITO_MAIN_FRAME_COMPLETED[\s\S]{0,260}from_cache:\s*details\.fromCache === true/);
  assert.match(worker, /request_id:\s*String\(details\.requestId/);
});

test("Avito readiness completion is single-flight per run so duplicate tab events cannot execute the same plan three times", () => {
  assert.match(worker, /const avitoCompletionLocks = new Map\(\)/);
  assert.match(worker, /async function withAvitoCompletionLock\(searchId, fn\)/);
  assert.match(worker, /async function completeAvitoTaskUnlocked/);
  assert.match(worker, /return withAvitoCompletionLock\(queuedState\?\.search_id/);
});
