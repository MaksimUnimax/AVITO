"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const Core = require("../core.js");

const root = path.join(__dirname, "..");
const content = fs.readFileSync(path.join(root, "avito_content.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const chat = fs.readFileSync(path.join(root, "chatgpt_content.js"), "utf8");
const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "popup.html"), "utf8");

function event() { return { addListener() {} }; }
function loadOptionalLoginHelpers() {
  const chrome = {
    runtime: { onInstalled: event(), onMessage: event(), getManifest: () => ({ version: "test" }), lastError: null },
    tabs: {
      query: () => Promise.resolve([]), get: () => Promise.resolve(null), update: () => Promise.resolve(null), create: () => Promise.resolve(null), sendMessage: () => Promise.resolve(null),
      onUpdated: event(), onRemoved: event(), onCreated: event()
    },
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve(), remove: () => Promise.resolve() } },
    scripting: { executeScript: () => Promise.resolve() },
    debugger: { attach: () => Promise.resolve(), detach: () => Promise.resolve(), sendCommand: () => Promise.resolve() }
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
  return context.globalThis.__AF_TEST_EXPORTS.optionalLogin;
}

test("ordinary login produces a nonempty assistant-facing observation report; it is not auto-closed", () => {
  const report = Core.formatOptionalLoginPopupObservedReport(
    "af-test",
    { page_kind: "search_results", city: "Златоуст", query: "новый смартфон 1 тб" },
    { url: "https://www.avito.ru/zlatoust/telefony#login", page_kind: "search_results", city: "Златоуст", query: "новый смартфон 1 тб", login_popup: true },
    [{ kind: "preflight_confirmed", page_kind: "search_results", city: "Златоуст", query: "новый смартфон 1 тб" }]
  );
  assert.ok(report.length > 300);
  assert.match(report, /Статус: OPTIONAL_LOGIN_POPUP_OBSERVED/);
  assert.match(report, /DIAGNOSE_DOM с областью DIALOG_VISIBLE/);
  assert.match(report, /действий после его появления не выполнялось/i);
  assert.doesNotMatch(report, /LOGIN_POPUP_CLOSE_FAILED|auth-app\/close/);
});

test("overlay preflight gates normal plans, allows only dialog diagnosis or a single generic CLICK after a current dialog snapshot", () => {
  const helpers = loadOptionalLoginHelpers();
  const current = { url: "https://www.avito.ru/zlatoust/telefony#login", login_popup: true };
  assert.equal(helpers.optionalLoginPreflightDisposition({ command_mode: "AVITO_UI", ui_action_plan: { steps: [{ type: "TYPE" }] } }, current), "report_observed");
  assert.equal(helpers.optionalLoginPreflightDisposition({ command_mode: "INSPECT_FILTERS" }, current), "report_observed");
  assert.equal(helpers.optionalLoginPreflightDisposition({ command_mode: "DIAGNOSE_DOM", diagnostic_request: { scope: "DIALOG_VISIBLE", action: "" } }, current), "allow_dialog_inspection");
  assert.equal(helpers.optionalLoginPreflightDisposition({ command_mode: "DIAGNOSE_DOM", diagnostic_request: { scope: "PAGE_MAIN_VISIBLE", action: "" } }, current), "report_observed");
  assert.equal(helpers.optionalLoginPreflightDisposition({
    command_mode: "AVITO_UI",
    ui_action_plan: { steps: [{ type: "CLICK" }] },
    optional_login_dialog_snapshot: { snapshot_fingerprint: "snapshot", url: current.url }
  }, current), "allow_exact_generic_click");
  assert.equal(helpers.optionalLoginPreflightDisposition({
    command_mode: "AVITO_UI",
    ui_action_plan: { steps: [{ type: "CLICK" }, { type: "COLLECT_LISTINGS" }] },
    optional_login_dialog_snapshot: { snapshot_fingerprint: "snapshot", url: current.url }
  }, current), "report_observed");
});

test("worker creates and delivers the explicit nonempty report with the unchanged report-delivery function", () => {
  const preflightStart = worker.indexOf("async function preflightRouteContext");
  const preflightEnd = worker.indexOf("async function diagnoseAvito", preflightStart);
  assert.ok(preflightStart >= 0 && preflightEnd > preflightStart);
  const preflight = worker.slice(preflightStart, preflightEnd);
  assert.match(preflight, /formatOptionalLoginPopupObservedReport/);
  assert.match(preflight, /status: "OPTIONAL_LOGIN_POPUP_REPORT_READY"/);
  assert.match(preflight, /report_kind: "optional_login_popup_observed"/);
  assert.match(preflight, /deliverReportToPinnedChat\(prepared, report, "optional_login_popup_observed"\)/);
  assert.match(preflight, /actions_after_overlay: "none"/);
  assert.doesNotMatch(preflight, /dismissOptionalLoginPopup|LOGIN_POPUP_CLOSE_FAILED|auth-app\/close/);
});

test("the required DIALOG_VISIBLE read records only a current snapshot; generic click remains assistant-directed", () => {
  assert.match(worker, /OPTIONAL_LOGIN_DIALOG_SNAPSHOT_RECORDED/);
  assert.match(worker, /String\(working\.diagnostic_request\?\.scope \|\| ""\)\.toUpperCase\(\) === "DIALOG_VISIBLE"/);
  assert.match(content, /svg\[data-marker\],svg\[aria-label\],svg\[title\]/);
  assert.match(worker, /const genericMarkedSvgClick = targetTag === 'svg'/);
  assert.equal(worker.includes("auth-app/close"), false);
});

test("ChatGPT capture keeps optional-login isolation while adding only pinned-context recovery", () => {
  assert.match(chat, /AF_CAPTURE_RECOVER_CONTINUOUS/);
  assert.match(chat, /PROMPT_CONTINUATION_RECOVERED_AFTER_SPA_CONTEXT_RETURN/);
  assert.match(chat, /Автоматизация на безопасной паузе/);
  assert.doesNotMatch(chat, /auth-app\/close/);
  assert.match(popup, /AF_PROXY_MARKET_SYNC/);
  assert.match(popup, /AF_PROXY_APPLY/);
  assert.match(popup, /AF_PROXY_DIRECT/);
  assert.match(popupHtml, /id="proxy-api-key"/);
  assert.match(popupHtml, /id="proxy-main-action"/);
  assert.match(popupHtml, /id="proxy-main-badge"/);
});
