"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ProxyCore = require("../proxy_manager.js");
const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(root, "popup.js"), "utf8");

test("package-scoped resident sync starts with type=all and has compatibility variants", () => {
  assert.deepEqual(ProxyCore.apiListBody({ package_id: 68507, page: 1, page_size: 10 }), { type: "all", page: 1, page_size: 10, sort: 1, package_id: 68507 });
  assert.deepEqual(ProxyCore.apiListBody({ package_id: 68507, type: "all", force_proxy_type: true }), { type: "all", page: 1, page_size: 10, sort: 1, package_id: 68507, proxy_type: "resident" });
  assert.match(worker, /package_all/);
  assert.match(worker, /package_ipv4/);
  assert.match(worker, /package_all_resident/);
  assert.match(worker, /PROXY_MARKET_LIST_VARIANT/);
});

test("manual residential traffic fallback creates a validated pool profile", () => {
  const p = ProxyCore.makeManualTrafficProfile({ package_id: 68507, host: "pool.proxy.market", http_port: 10000, socks_port: 10999, login: "login", password: "password", country: "ru", rotation: -1 });
  assert.equal(p.host, "pool.proxy.market");
  assert.equal(p.http_port, 10000);
  assert.equal(p.socks_port, 10999);
  assert.equal(p.login, "login");
  assert.equal(p.password, "password");
  assert.equal(p.package_id, 68507);
  assert.throws(() => ProxyCore.makeManualTrafficProfile({ host: "pool.proxy.market", http_port: 10000, login: "", password: "" }), /PROXY_CREDENTIALS_REQUIRED/);
});

test("legacy manual fallback stays backward-compatible in worker but is removed from the primary popup", () => {
  assert.doesNotMatch(popupHtml, /id="proxy-manual-/);
  assert.doesNotMatch(popupJs, /AF_PROXY_MANUAL_PROFILE_SAVE/);
  assert.match(worker, /PROXY_MANUAL_TRAFFIC_PROFILE_SAVED/);
  assert.match(worker, /PROXY_PROFILE_STORAGE_MIGRATED/);
  const manualStart = worker.indexOf("async function saveManualTrafficProfile");
  const manualEnd = worker.indexOf("async function getProxyProfileDetails", manualStart);
  const fn = worker.slice(manualStart, manualEnd);
  assert.doesNotMatch(fn, /proxySettingsSet/);
});

test("config export/import can carry proxy credentials but runtime summaries remain sanitized", () => {
  const profile = ProxyCore.makeManualTrafficProfile({ package_id: 1, login: "u", password: "p" });
  const bundle = ProxyCore.makeKeyBundle({ api_key: "k", package_id: 1, profiles: [profile] });
  assert.equal(bundle.profiles[0].password, "p");
  const summary = ProxyCore.profileSummary(bundle.profiles[0]);
  assert.equal("login" in summary, false);
  assert.equal("password" in summary, false);
  assert.match(popupHtml, /id="proxy-profile-login"/);
  assert.match(popupHtml, /id="proxy-profile-password"/);
  assert.match(popupJs, /AF_PROXY_PROFILE_DETAILS/);
});
