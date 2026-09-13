"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ProxyCore = require("../proxy_manager.js");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

const profile = ProxyCore.normalizeProxyMarketRecord({
  id: 9560109,
  ip: "pool.proxy.market",
  http_port: 10000,
  login: "user",
  password: "pass",
  country: "ru",
  package_id: 68507,
  rotation_settings: { rotate: 0, rotate_can_change: true, change_ip_link: "https://rotate.proxy.market/change/abc" }
});

test("v1.0.38 retains bounded diagnostic host permissions without all-URL access", () => {
  assert.equal(manifest.version, "1.0.38");
  assert.ok(manifest.host_permissions.includes("https://api.ipify.org/*"));
  assert.ok(manifest.host_permissions.includes("https://api64.ipify.org/*"));
  assert.equal(manifest.host_permissions.includes("https://*/*"), false);
});

test("diagnostic PAC proxies only Avito plus explicitly requested canary hosts", () => {
  const config = ProxyCore.buildAvitoOnlyPacConfig(profile, { extra_hosts: ["api.ipify.org", "api64.ipify.org"], nonce: "epoch-123" });
  const pac = config.pacScript.data;
  assert.match(pac, /avito-finder-proxy-epoch:epoch-123/);
  assert.match(pac, /host === 'avito\.ru'/);
  assert.match(pac, /api\.ipify\.org/);
  assert.match(pac, /api64\.ipify\.org/);
  assert.match(pac, /PROXY pool\.proxy\.market:10000/);
  assert.match(pac, /return 'DIRECT'/);
});

test("transport-cut PAC fails Avito/canary closed instead of leaking them direct", () => {
  const config = ProxyCore.buildProxyTransportCutPacConfig({ extra_hosts: ["api.ipify.org"], nonce: "cut-1" });
  const pac = config.pacScript.data;
  assert.match(pac, /avito-finder-transport-cut:cut-1/);
  assert.match(pac, /PROXY 127\.0\.0\.1:9/);
  assert.match(pac, /host === 'avito\.ru'/);
  assert.match(pac, /api\.ipify\.org/);
});

test("egress parser accepts valid IPv4/IPv6 and rejects malformed values", () => {
  assert.equal(ProxyCore.parseEgressIpPayload({ ip: "185.103.110.182" }), "185.103.110.182");
  assert.equal(ProxyCore.parseEgressIpPayload({ ip: "2a00:1450:400f:80d::200e" }), "2a00:1450:400f:80d::200e");
  assert.equal(ProxyCore.parseEgressIpPayload({ ip: "999.1.1.1" }), "");
  assert.equal(ProxyCore.parseEgressIpPayload({ ip: "evil.example/path" }), "");
});

test("recovery applies only selected or explicitly reconciled newly created profile", () => {
  const start=worker.indexOf("async function prepareRecoveryProxy");
  const end=worker.indexOf("async function restoreInterruptedProxyTransaction",start);
  const fn=worker.slice(start,end);
  assert.match(fn,/runtime.selected_profile_id/);
  assert.match(fn,/maybeCreateRecoveryEndpoint/);
  assert.doesNotMatch(fn,/alternate_profile|PROXY_PROFILE_FAILOVER_ON_IP_BLOCK/);
});

test("provider rotation acknowledgment is separated from proof and precedes bounded create", () => {
  const start=worker.indexOf("async function prepareRecoveryProxy");
  const end=worker.indexOf("async function restoreInterruptedProxyTransaction",start);
  const fn=worker.slice(start,end);
  assert.ok(fn.indexOf("ProxyCore.forceChangeIpByLink")<fn.indexOf("profile=await maybeCreateRecoveryEndpoint"));
  assert.match(fn,/ip_change_proven:false/);
  assert.match(fn,/finally/);
});

test("Avito reload follows verified PAC application, not an unrelated external-IP oracle", () => {
  const start=worker.indexOf("async function performReservedConnectionRecoveryInsideLane");
  const end=worker.indexOf("async function recoverAvitoConnectionAndReload",start);
  const fn=worker.slice(start,end);
  assert.ok(fn.indexOf("await prepareRecoveryProxy")<fn.indexOf("await tabsReload"));
  assert.match(worker,/await assertEffectiveProxy\(config\)/);
  assert.match(fn,/avito_exit_ip_verified:false/);
  assert.doesNotMatch(fn,/EGRESS_NOT_VERIFIED/);
});

test("reload readiness treats an in-flight reload as transient and retries after activation", () => {
  assert.match(worker, /state\?\.avito_reload_expected === true[\s\S]{0,220}source: "reload_in_progress"/);
  assert.match(worker, /AVITO_PAGE_READY_TRANSIENT_RETRY/);
  assert.match(worker, /scheduleAvitoReadyDeadline\(state\)/);
});

test("recoverable proxy transport errors trigger the same verified recovery path under a single-flight lock", () => {
  const start = worker.indexOf("if (chrome.webRequest?.onErrorOccurred?.addListener)");
  const end = worker.indexOf("chrome.runtime.onInstalled.addListener", start);
  const listener = worker.slice(start, end);
  assert.match(listener, /PROXY_TRANSPORT_RECOVERABLE_ERRORS\.has\(errorText\)/);
  assert.match(listener, /AVITO_PROXY_TRANSPORT_ERROR_RECOVERY_STARTED/);
  assert.match(listener, /recoverAvitoConnectionAndReload\(latest, tab, 0, "proxy_transport_error", null, "PROXY_TRANSPORT"\)/);
  assert.match(listener, /withAvitoCompletionLock\(state\.search_id, async \(\) =>/);
  assert.match(listener, /if \(!await evidenceWrite\) return/);
});

