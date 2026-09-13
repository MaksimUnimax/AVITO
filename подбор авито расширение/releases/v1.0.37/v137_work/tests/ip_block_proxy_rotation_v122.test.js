"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ProxyCore = require("../proxy_manager.js");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("safe provider change-IP links are preserved privately but never exposed in popup summaries", () => {
  const profile = ProxyCore.normalizeProxyMarketRecord({
    id: 9560109,
    ip: "pool.proxy.market",
    http_port: 10000,
    login: "u",
    password: "p",
    country: "ru",
    package_id: 68507,
    rotation_settings: { rotate: 0, rotate_can_change: true, change_ip_link: "https://rotate.proxy.market/change/abc" }
  });
  assert.equal(profile.rotation_settings.change_ip_link, "https://rotate.proxy.market/change/abc");
  const summary = ProxyCore.profileSummary(profile);
  assert.equal(summary.can_force_change_ip, true);
  assert.equal("change_ip_link" in summary, false);
  assert.equal(ProxyCore.normalizeChangeIpLink("https://evil.example/change"), "");
  assert.equal(ProxyCore.normalizeChangeIpLink("http://rotate.proxy.market/change"), "");
});

test("forceChangeIpByLink performs one cache-free credential-free GET to the approved provider link", async () => {
  const calls = [];
  const result = await ProxyCore.forceChangeIpByLink(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 204 };
  }, "https://rotate.proxy.market/change/abc");
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://rotate.proxy.market/change/abc");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.credentials, "omit");
});

test("worker recovery reserves a bounded persisted attempt before proxy and target effects", () => {
  const R=require("../recovery.js");
  let record=R.freshRecovery({search_id:"r",operation_id:"r:o"},1);
  for(let i=0;i<4;i++)record=R.reserveAttempt(record);
  assert.throws(()=>R.reserveAttempt(record));
  assert.match(worker,/Recovery\.reserveAttempt/);
  assert.match(worker,/prepareRecoveryProxy/);
  assert.match(worker,/AVITO_RECOVERY_FRESH_DOCUMENT_REQUESTED/);
});

test("recovery keeps selected profile and reserves one reconcilable endpoint creation", () => {
  assert.match(worker,/profiles\|\|\[\]\)\.find\(p=>String\(p.id\)===String\(runtime.selected_profile_id\)/);
  assert.match(worker,/DISPATCHED_OUTCOME_UNKNOWN/);
  assert.match(worker,/maybeCreateRecoveryEndpoint/);
  assert.match(worker,/ProxyCore\.createProxyInPackage/);
  assert.doesNotMatch(worker,/PROXY_PROFILE_FAILOVER_ON_IP_BLOCK|strategy: "alternate_profile"/);
  for(const x of ["buy-proxy","buy-proxies","buy-traffic"])assert.equal(worker.includes(x),false);
});

test("manifest grants Proxy.Market hosts plus the two explicit IP canary hosts", () => {
  assert.ok(manifest.host_permissions.includes("https://api.dashboard.proxy.market/*"));
  assert.ok(manifest.host_permissions.includes("https://proxy.market/*"));
  assert.ok(manifest.host_permissions.includes("https://*.proxy.market/*"));
  assert.ok(manifest.host_permissions.includes("https://api.ipify.org/*"));
  assert.ok(manifest.host_permissions.includes("https://api64.ipify.org/*"));
  assert.equal(manifest.host_permissions.includes("https://*/*"), false);
});
