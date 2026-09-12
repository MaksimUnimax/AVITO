"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function event() { return { addListener() {} }; }
function loadWorkerExports() {
  const source = fs.readFileSync(path.join(__dirname, "..", "service_worker.js"), "utf8");
  const listeners = {};
  const chrome = {
    runtime: { onInstalled: event(), onMessage: event(), getManifest: () => ({ version: "test" }), lastError: null },
    tabs: {
      query: () => Promise.resolve([]), get: () => Promise.resolve(null), update: () => Promise.resolve(null), create: () => Promise.resolve(null), sendMessage: () => Promise.resolve(null),
      onUpdated: event(), onRemoved: event(), onCreated: event()
    },
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
    scripting: { executeScript: () => Promise.resolve() },
    debugger: { attach: () => Promise.resolve(), detach: () => Promise.resolve(), sendCommand: () => Promise.resolve() }
  };
  const context = { globalThis: { __AF_TEST_EXPORTS: {} }, chrome, console, URL, Date, Math, setTimeout, clearTimeout, Promise, Array, String, Number, Boolean, Error, Set, Map, RegExp };
  context.globalThis.globalThis = context.globalThis;
  context.importScripts = (...names) => {
    for (const name of names) {
      const imported = fs.readFileSync(path.join(__dirname, "..", name), "utf8");
      vm.runInContext(imported, context, { filename: name });
      context.AvitoFinderCore = context.globalThis.AvitoFinderCore;
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "service_worker.js" });
  return context.globalThis.__AF_TEST_EXPORTS.uiClickHandoff;
}

test("child handoff accepts the same public listing pathname despite rewritten query context", () => {
  const helpers = loadWorkerExports();
  assert.equal(helpers.expectedNavigationPathMatches(
    "https://www.avito.ru/zlatoust/noutbuki/demo_7825162046?context=rewritten",
    "/zlatoust/noutbuki/demo_7825162046?context=old"
  ), true);
});

test("child handoff rejects another listing and a non-Avito URL", () => {
  const helpers = loadWorkerExports();
  assert.equal(helpers.expectedNavigationPathMatches(
    "https://www.avito.ru/zlatoust/noutbuki/other_0000000000",
    "/zlatoust/noutbuki/demo_7825162046"
  ), false);
  assert.equal(helpers.expectedNavigationPathMatches(
    "https://example.com/zlatoust/noutbuki/demo_7825162046",
    "/zlatoust/noutbuki/demo_7825162046"
  ), false);
});

test("only a recorded same-window child of the clicked source tab is eligible", () => {
  const helpers = loadWorkerExports();
  const state = { current_window_id: 7, pending_ui_click: { tab_id: 11, child_tab_ids: [12] } };
  assert.equal(helpers.isPendingUiClickChildTab(state, { id: 12, windowId: 7, openerTabId: 11 }), true);
  assert.equal(helpers.isPendingUiClickChildTab(state, { id: 13, windowId: 7, openerTabId: 11 }), false);
  assert.equal(helpers.isPendingUiClickChildTab(state, { id: 12, windowId: 8, openerTabId: 11 }), false);
  assert.equal(helpers.isPendingUiClickChildTab(state, { id: 12, windowId: 7, openerTabId: 10 }), false);
});


test("same-tab visible form submit without href is accepted only after its URL changes", () => {
  const helpers = loadWorkerExports();
  const state = {
    current_window_id: 7,
    pending_ui_click: { tab_id: 11, step_index: 2, dispatch_id: "run:click:2:test", child_tab_ids: [12], page_url: "https://www.avito.ru/", expected_navigation_path: "" }
  };
  assert.equal(helpers.pendingUiClickNavigationMatches(state, { id: 11, windowId: 7, openerTabId: null, url: "https://www.avito.ru/zlatoust/noutbuki?q=%D0%BD%D0%BE%D1%83%D1%82%D0%B1%D1%83%D0%BA%D0%B8" }), true);
  assert.equal(helpers.pendingUiClickNavigationMatches(state, { id: 11, windowId: 7, openerTabId: null, url: "https://www.avito.ru/" }), false);
  assert.equal(helpers.pendingUiClickNavigationMatches(state, { id: 12, windowId: 7, openerTabId: 11, url: "https://www.avito.ru/zlatoust/noutbuki?q=x" }), false);
});

test("visible anchor handoff still requires the expected public pathname", () => {
  const helpers = loadWorkerExports();
  const state = {
    current_window_id: 7,
    pending_ui_click: { tab_id: 11, step_index: 1, dispatch_id: "run:click:1:test", child_tab_ids: [12], page_url: "https://www.avito.ru/zlatoust/noutbuki?q=x", expected_navigation_path: "/zlatoust/noutbuki/demo_7825162046" }
  };
  assert.equal(helpers.pendingUiClickNavigationMatches(state, { id: 11, windowId: 7, url: "https://www.avito.ru/zlatoust/noutbuki/demo_7825162046?context=rewritten" }), true);
  assert.equal(helpers.pendingUiClickNavigationMatches(state, { id: 12, windowId: 7, openerTabId: 11, url: "https://www.avito.ru/zlatoust/noutbuki/other_0000000000" }), false);
});
