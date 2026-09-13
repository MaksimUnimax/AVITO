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

test("manual endpoint create uses official package/create-proxy endpoint and validates body", async () => {
  assert.equal(ProxyCore.apiCreateProxyUrl("abc key"), "https://api.dashboard.proxy.market/dev-api/v2/package/create-proxy/abc%20key");
  assert.deepEqual(ProxyCore.apiCreateProxyBody({ package_id: "68507", country: "RU", rotation: "-1" }), { packageId: 68507, country: "ru", rotation: -1 });
  assert.deepEqual(ProxyCore.apiCreateProxyBody({ package_id: 1, country: "de", rotation: 15, region_id: 2, city_id: 3 }), { packageId: 1, country: "de", rotation: 15, regionId: 2, cityId: 3 });
  assert.throws(() => ProxyCore.apiCreateProxyBody({ package_id: 0, country: "ru" }), /PROXY_PACKAGE_ID_REQUIRED_FOR_CREATE/);
  assert.throws(() => ProxyCore.apiCreateProxyBody({ package_id: 1, country: "russia" }), /PROXY_CREATE_COUNTRY_INVALID/);
  assert.throws(() => ProxyCore.apiCreateProxyBody({ package_id: 1, country: "ru", rotation: 61 }), /PROXY_CREATE_ROTATION_INVALID/);
  let seen = null;
  const fakeFetch = async (url, options) => { seen = { url, options }; return { ok: true, status: 200, async json() { return { success: true }; } }; };
  const result = await ProxyCore.createProxyInPackage(fakeFetch, "abc", { package_id: 68507, country: "ru", rotation: -1 });
  assert.equal(result.ok, true);
  assert.match(seen.url, /package\/create-proxy\/abc$/);
  assert.equal(seen.options.method, "POST");
  assert.deepEqual(JSON.parse(seen.options.body), { packageId: 68507, country: "ru", rotation: -1 });
});

test("popup exposes manual endpoint creation controls and handler", () => {
  for (const id of ["proxy-create-country", "proxy-create-rotation", "proxy-endpoint-create", "proxy-endpoint-status"]) assert.match(popupHtml, new RegExp(`id="${id}"`));
  assert.match(popupHtml, /Создать и обновить список/);
  assert.match(popupHtml, /<details class="advanced">/);
  assert.match(popupJs, /AF_PROXY_ENDPOINT_CREATE/);
});

test("worker creates endpoint only by explicit message, keeps switching manual, and syncs after creation", () => {
  assert.match(worker, /async function createProxyMarketEndpoint/);
  assert.match(worker, /proxyMutationError\(state\)/);
  assert.match(worker, /createProxyInPackage/);
  assert.match(worker, /PROXY_MARKET_ENDPOINT_CREATED_MANUAL/);
  assert.match(worker, /syncProxyMarket/);
  assert.match(worker, /AF_PROXY_ENDPOINT_CREATE: \(\) => createProxyMarketEndpoint\(message\)/);
  assert.doesNotMatch(worker, /CAPTCHA[^\n]{0,200}AF_PROXY_ENDPOINT_CREATE/);
});
