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

test("Proxy.Market key check uses the official balance endpoint without logging the key", async () => {
  assert.match(ProxyCore.apiBalanceUrl("abc key"), /^https:\/\/api\.dashboard\.proxy\.market\/dev-api\/balance\/abc%20key$/);
  const fakeFetch = async (_url, options) => ({
    ok: true,
    status: 200,
    async json() { return { balance: 42.5 }; },
    options
  });
  const result = await ProxyCore.fetchProxyMarketBalance(fakeFetch, "abc");
  assert.equal(result.balance, 42.5);
  assert.match(worker, /PROXY_MARKET_KEY_VALID/);
  assert.doesNotMatch(worker, /log\([^\n]*api_key/);
});

test("config-file format round-trips API key, package/order IDs and optional proxy profiles", () => {
  const bundle = ProxyCore.makeKeyBundle({ api_key: "secret-key", package_id: "77", order_id: "88", profiles: [{ id: "traffic-77-10000", host: "pool.proxy.market", http_port: 10000, socks_port: 10999, login: "u", password: "p", country: "ru", package_id: 77, proxy_type: "resident", type: "traffic" }], created_at: "2026-09-06T00:00:00.000Z" });
  assert.equal(bundle.format, ProxyCore.KEY_FILE_FORMAT);
  assert.equal(bundle.version, 2);
  assert.equal(bundle.api_key, "secret-key");
  assert.equal(bundle.package_id, 77);
  assert.equal(bundle.order_id, 88);
  assert.equal(bundle.profiles.length, 1);
  assert.equal(bundle.profiles[0].login, "u");
  assert.deepEqual(ProxyCore.parseKeyBundle(bundle), bundle);
  const legacy = ProxyCore.parseKeyBundle({ format: ProxyCore.KEY_FILE_FORMAT, version: 1, provider: "proxy.market", api_key: "legacy", package_id: 1, order_id: null });
  assert.equal(legacy.api_key, "legacy");
  assert.deepEqual(legacy.profiles, []);
  assert.throws(() => ProxyCore.parseKeyBundle({ format: "wrong", version: 1, api_key: "x" }), /PROXY_KEY_FILE_FORMAT_UNSUPPORTED/);
});

test("popup exposes key lifecycle under advanced settings and a single primary proxy action", () => {
  for (const id of ["proxy-key-check", "proxy-key-export", "proxy-key-import-button", "proxy-key-import", "proxy-main-action"]) assert.match(popupHtml, new RegExp(`id="${id}"`));
  assert.match(popupHtml, /Проверить ключ/);
  assert.match(popupHtml, /Скачать конфиг/);
  assert.match(popupHtml, /Загрузить конфиг/);
  assert.match(popupHtml, /Прокси Avito/);
  assert.match(popupJs, /AF_PROXY_KEY_CHECK/);
  assert.match(popupJs, /AF_PROXY_KEY_EXPORT/);
  assert.match(popupJs, /AF_PROXY_KEY_IMPORT/);
  assert.match(popupJs, /AF_PROXY_APPLY/);
  assert.match(popupJs, /AF_PROXY_DIRECT/);
});

test("sync failures are persisted and zero-endpoint traffic packages get a specific diagnosis", () => {
  assert.match(worker, /PROXY_MARKET_SYNC_FAILED/);
  assert.match(worker, /PROXY_MARKET_SYNC_EMPTY/);
  assert.match(worker, /PROXY_MARKET_NO_ENDPOINTS_CREATED/);
  assert.match(popupJs, /В пакете ещё нет endpoint/);
  assert.match(worker, /PROXY_MARKET_ENDPOINT_EXISTS_LIST_EMPTY/);
});

test("list normalization tolerates official list.data and direct data shapes", () => {
  const row = { id: 9, ip: "127.0.0.1", http_port: 9000, login: "u", password: "p", proxy_type: "resident" };
  assert.equal(ProxyCore.normalizeProxyMarketList({ list: { data: [row] } }).length, 1);
  assert.equal(ProxyCore.normalizeProxyMarketList({ data: [row] }).length, 1);
});


test("key validation is isolated from package discovery failures", () => {
  const workerText = worker;
  const checkStart = workerText.indexOf("async function checkProxyMarketKey");
  const checkEnd = workerText.indexOf("async function importProxyKeyBundle", checkStart);
  const fn = workerText.slice(checkStart, checkEnd);
  assert.match(fn, /fetchProxyMarketBalance/);
  assert.match(fn, /PROXY_MARKET_PACKAGE_DISCOVERY_FAILED/);
  assert.match(fn, /packageWarning/);
  assert.match(fn, /valid:\s*true/);
  assert.ok(fn.indexOf("fetchProxyMarketBalance") < fn.indexOf("collectProxyPackages"));
});

test("provider HTTP errors identify the failing API stage and conservative pagination is used", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 400,
    async json() { return { message: "bad request" }; }
  });
  await assert.rejects(() => ProxyCore.fetchProxyMarketBalance(fakeFetch, "abc"), /PROXY_MARKET_BALANCE_HTTP_400/);
  await assert.rejects(() => ProxyCore.fetchTrafficPackages(fakeFetch, "abc"), /PROXY_MARKET_PACKAGES_HTTP_400/);
  await assert.rejects(() => ProxyCore.fetchProxyMarketPage(fakeFetch, "abc"), /PROXY_MARKET_LIST_HTTP_400/);
  assert.match(ProxyCore.apiPackagesUrl("abc"), /perPage=10$/);
  assert.equal(ProxyCore.apiListBody({}).page_size, 10);
});
