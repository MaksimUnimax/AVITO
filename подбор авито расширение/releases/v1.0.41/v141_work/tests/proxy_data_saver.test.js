"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ProxyCore = require("../proxy_manager.js");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const popup = fs.readFileSync(path.join(root, "popup.html"), "utf8");

test("low-data mode uses DNR block rules only for heavy Avito resource types", () => {
  assert.ok(manifest.permissions.includes("declarativeNetRequest"));
  assert.match(worker, /initiatorDomains:\s*\["avito\.ru", "www\.avito\.ru"\]/);
  assert.match(worker, /\["image", "media", "font", "object", "ping"\]/);
  assert.doesNotMatch(worker, /PROXY_DATA_SAVER_RESOURCE_TYPES[^\n]*script/);
  assert.doesNotMatch(worker, /PROXY_DATA_SAVER_RESOURCE_TYPES[^\n]*xmlhttprequest/);
  assert.doesNotMatch(worker, /PROXY_DATA_SAVER_RESOURCE_TYPES[^\n]*stylesheet/);
  assert.doesNotMatch(worker, /PROXY_DATA_SAVER_RESOURCE_TYPES[^\n]*main_frame/);
});

test("data saver is active only while proxy mode is active and stays manual", () => {
  assert.match(worker, /const active = desired && runtime\.mode === "proxy"/);
  assert.match(worker, /syncProxyDataSaverRules\(false\)/);
  assert.match(worker, /PROXY_DATA_SAVER_CHANGED/);
  assert.match(popup, /id="proxy-data-saver"/);
  assert.match(popup, /Экономия трафика/);
});

test("Proxy.Market package usage endpoint is normalized without credentials", async () => {
  assert.match(ProxyCore.apiPackagesUrl("abc key", 2, 50), /^https:\/\/api\.dashboard\.proxy\.market\/dev-api\/v2\/packages\/abc%20key\?page=2&perPage=50$/);
  const fakeFetch = async () => ({
    ok: true,
    async json() {
      return { data: [{ id: 7, total: 10737418240, used: 2147483648, name: "resident", proxies_count: 3, is_active: true, prepaid: true }], metadata: { page: 1, lastPage: 1 } };
    }
  });
  const result = await ProxyCore.fetchTrafficPackages(fakeFetch, "key", { page: 1, per_page: 100 });
  assert.equal(result.packages.length, 1);
  assert.deepEqual(result.packages[0], {
    id: 7,
    total: 10737418240,
    used: 2147483648,
    remaining: 8589934592,
    name: "resident",
    expires_at: "",
    proxies_count: 3,
    is_active: true,
    prepaid: true
  });
  assert.equal("login" in result.packages[0], false);
  assert.equal("password" in result.packages[0], false);
});

test("popup exposes manual traffic refresh and does not poll provider usage", () => {
  assert.match(popup, /proxy-traffic-refresh/);
  assert.match(popup, />Трафик<\/button>/);
  assert.match(worker, /AF_PROXY_TRAFFIC_REFRESH/);
  assert.doesNotMatch(worker, /setInterval\([^\n]*PROXY_TRAFFIC/);
});
