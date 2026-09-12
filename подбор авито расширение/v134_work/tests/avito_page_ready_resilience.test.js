"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const Core = require("../core.js");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");

function event() { return { addListener() {}, removeListener() {} }; }
function loadReadinessHelpers(probeResult = null) {
  const chrome = {
    runtime: { onInstalled: event(), onMessage: event(), getManifest: () => ({ version: "test" }), lastError: null },
    tabs: {
      query() {}, get() {}, update() {}, create() {}, sendMessage() {}, remove() {},
      onUpdated: event(), onRemoved: event(), onCreated: event()
    },
    storage: { local: { get() {}, set() {}, remove() {} } },
    scripting: { executeScript(_details, done) { if (typeof done === "function") done(probeResult === null ? [] : [{ result: probeResult }]); } },
    debugger: { attach() {}, detach() {}, sendCommand() {} }
  };
  const context = { globalThis: { __AF_TEST_EXPORTS: {} }, chrome, console, URL, Date, Math, setTimeout, clearTimeout, Promise, Array, String, Number, Boolean, Error, Set, Map, RegExp };
  context.globalThis.globalThis = context.globalThis;
  context.importScripts = (...names) => {
    for (const name of names) {
      const imported = fs.readFileSync(path.join(root, name), "utf8");
      vm.runInContext(imported, context, { filename: name });
      context.AvitoFinderCore = context.globalThis.AvitoFinderCore;
    }
  };
  vm.createContext(context);
  vm.runInContext(worker, context, { filename: "service_worker.js" });
  return context.globalThis.__AF_TEST_EXPORTS.readiness;
}

test("state schema records an in-flight visible Avito navigation", () => {
  const state = Core.makeState({});
  assert.equal(state.version, 15);
  assert.equal(state.avito_navigation_expected, false);
  assert.equal(state.avito_navigation_from_url, null);
  assert.equal(state.avito_requested_url, null);
});

test("opaque Avito context rewrites are equivalent and must not hard-reload the bound tab", () => {
  const h = loadReadinessHelpers();
  assert.equal(h.sameVisibleAvitoRoute(
    "https://www.avito.ru/all/nastolnye_kompyutery?q=i7+8700&context=old&s=104",
    "https://www.avito.ru/all/nastolnye_kompyutery?s=104&context=new&q=i7+8700"
  ), true);
  assert.equal(h.sameVisibleAvitoRoute(
    "https://www.avito.ru/all/nastolnye_kompyutery?q=i7+8700",
    "https://www.avito.ru/all/nastolnye_kompyutery?q=i5+10400"
  ), false);
  assert.match(worker, /sameVisibleAvitoRoute\(pendingUrl, url\)/);
  assert.match(worker, /AVITO_DIRECT_URL_NAVIGATION_SKIPPED_EQUIVALENT/);
});

test("loading tab can be accepted by a DOM readiness probe after the new document committed", () => {
  const h = loadReadinessHelpers();
  const tab = { id: 7, windowId: 2, status: "loading", url: "https://www.avito.ru/all/bytovaya_elektronika?q=new" };
  const state = {
    current_window_id: 2,
    avito_navigation_expected: true,
    avito_navigation_from_url: "https://www.avito.ru/all/tovary_dlya_kompyutera?q=old",
    avito_requested_url: "https://www.avito.ru/all/bytovaya_elektronika?q=new"
  };
  const response = { ok: true, data: { ready_state: "interactive", body_present: true, href: tab.url } };
  assert.equal(h.avitoReadyProbeAccepted(response, tab, 2, state), true);
});


test("async readiness path accepts DOM interactive even when chrome tab status stays loading", async () => {
  const probe = { ready_state: "interactive", body_present: true, href: "https://www.avito.ru/all/nastolnye_kompyutery?q=new" };
  const h = loadReadinessHelpers(probe);
  const tab = { id: 9, windowId: 2, status: "loading", url: probe.href, pendingUrl: null };
  const state = { current_window_id: 2, avito_navigation_expected: false, avito_navigation_from_url: null, avito_requested_url: null };
  const result = await h.probeAvitoPageReadiness(tab, 2, state);
  assert.equal(result.ready, true);
  assert.equal(result.source, "dom_probe");
  assert.equal(result.probe.ready_state, "interactive");
});

test("readiness probe cannot accidentally accept the old document while tabs.update is still pending", () => {
  const h = loadReadinessHelpers();
  const oldUrl = "https://www.avito.ru/all/tovary_dlya_kompyutera?q=old";
  const tab = { id: 7, windowId: 2, status: "loading", url: oldUrl, pendingUrl: "https://www.avito.ru/all/bytovaya_elektronika?q=new" };
  const state = {
    current_window_id: 2,
    avito_navigation_expected: true,
    avito_navigation_from_url: oldUrl,
    avito_requested_url: tab.pendingUrl
  };
  assert.equal(h.avitoNavigationCommitObserved(tab, state, oldUrl), false);
  assert.equal(h.avitoReadyProbeAccepted({ ok: true, data: { ready_state: "complete", body_present: true, href: oldUrl } }, tab, 2, state), false);
  assert.equal(h.avitoNavigationCommitObserved(tab, state, "https://www.avito.ru/all/nastolnye_kompyutery?q=new"), true);
});

test("root readiness actively polls and timeout diagnostics include pendingUrl plus the last probe", () => {
  assert.match(worker, /const AVITO_READY_POLL_MS = 750;/);
  assert.match(worker, /scheduleAvitoReadyDeadline\(state/);
  assert.match(worker, /reconcilePendingAvitoReadiness\(\)/);
  assert.match(worker, /readiness_gate: "tab_complete_or_content_probe"/);
  assert.match(worker, /pendingUrl: tab\?\.pendingUrl/);
  assert.match(worker, /AVITO_PAGE_READY_TIMEOUT:[^\n]+tab: shortTab\(tab\), readiness/);
});

test("fixed readiness probe is local DOM state only and sequential cards use the same fallback", () => {
  assert.match(worker, /function fixedAvitoReadyDomProbe\(\)/);
  assert.match(worker, /ready_state: String\(document\.readyState/);
  assert.match(worker, /href: location\.href/);
  assert.match(worker, /body_present: Boolean\(document\.body\)/);
  assert.match(worker, /func: fixedAvitoReadyDomProbe/);
  assert.match(worker, /state\.state === "loading_avito"[\s\S]{0,400}probeAvitoPageReadiness\(tab, windowId, ownerState\)/);
  const start = worker.indexOf("function fixedAvitoReadyDomProbe");
  const end = worker.indexOf("async function probeAvitoPageReadiness", start);
  const probeFn = worker.slice(start, end);
  for (const forbidden of ["fetch(", "XMLHttpRequest", "chrome.cookies", "document.cookie", "Runtime.evaluate", "Page.navigate"]) {
    assert.equal(probeFn.includes(forbidden), false, forbidden);
  }
});
