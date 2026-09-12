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

const sample = {
  success: true,
  list: {
    error: false,
    total: 2,
    data: [
      { id: 11, ip: "127.0.0.1", http_port: 8000, socks_port: 9000, login: "alice", password: "secret", country: "ru", proxy_type: "resident", rotation_settings: { rotate: -1, rotate_can_change: true, change_ip_link: "https://rotate.proxy.market/change/abc" } },
      { id: 12, ip: "proxy.example", http_port: 8001, login: "bob", password: "secret2", country: "de", proxy_type: "resident" }
    ]
  }
};

test("Proxy.Market resident list normalization keeps credentials only in full profiles and sanitizes popup summaries", () => {
  const profiles = ProxyCore.normalizeProxyMarketList(sample);
  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].login, "alice");
  assert.equal(profiles[0].password, "secret");
  const summary = ProxyCore.profileSummary(profiles[0]);
  assert.equal(summary.has_credentials, true);
  assert.equal("login" in summary, false);
  assert.equal("password" in summary, false);
  assert.equal(summary.rotation, -1);
  assert.equal(profiles[0].rotation_settings.change_ip_link, "https://rotate.proxy.market/change/abc");
  assert.equal(summary.can_force_change_ip, true);
  assert.equal("change_ip_link" in summary, false);
});

test("Proxy.Market API request uses package-scoped compatibility and resident fallback", () => {
  const body = ProxyCore.apiListBody({ page: 2, page_size: 10, package_id: "44", order_id: "55" });
  assert.deepEqual(body, { type: "all", page: 2, page_size: 10, sort: 1, package_id: 44, order_id: 55 });
  assert.match(ProxyCore.apiListUrl("abc key"), /^https:\/\/api\.dashboard\.proxy\.market\/dev-api\/list\/abc%20key$/);
  assert.deepEqual(ProxyCore.apiListBody({ page: 1, page_size: 10 }), { type: "ipv4", page: 1, page_size: 10, sort: 1, proxy_type: "resident" });
});

test("PAC sends only Avito hosts through the selected HTTP proxy and everything else DIRECT", () => {
  const profile = ProxyCore.normalizeProxyMarketList(sample)[0];
  const config = ProxyCore.buildAvitoOnlyPacConfig(profile);
  assert.equal(config.mode, "pac_script");
  assert.equal(config.pacScript.mandatory, true);
  assert.match(config.pacScript.data, /host === 'avito\.ru'/);
  assert.match(config.pacScript.data, /dnsDomainIs\(host, '\.avito\.ru'\)/);
  assert.match(config.pacScript.data, /PROXY 127\.0\.0\.1:8000/);
  assert.match(config.pacScript.data, /return 'DIRECT'/);
});

test("manual proxy switch is allowed while Finder is quiescent and blocked only during an in-flight UI step", () => {
  assert.equal(ProxyCore.canMutateProxy({ user_started: true, status: "WAITING_FOR_NEXT_ASSISTANT_FORM" }), true);
  assert.equal(ProxyCore.canMutateProxy({ user_started: true, status: "WAITING_FOR_ASSISTANT_WRITING_BLOCK" }), true);
  assert.equal(ProxyCore.canMutateProxy({ user_started: true, status: "BLOCKED_AVITO_PAGE_READY" }), true);
  assert.equal(ProxyCore.canMutateProxy({ user_started: true, status: "AVITO_FAILURE_REPORT_READY" }), true);
  assert.equal(ProxyCore.canMutateProxy({ user_started: true, status: "AVITO_TAB_ACTIVE" }), false);
  assert.equal(ProxyCore.canMutateProxy({ user_started: true, status: "WAITING_FOR_AVITO_PAGE_READY" }), false);
  assert.equal(ProxyCore.canMutateProxy({ user_started: true, status: "REPORT_DELIVERY_IN_PROGRESS" }), false);
  assert.equal(ProxyCore.canMutateProxy({ user_started: false, status: "CANCELLED_BY_USER" }), true);
  assert.equal(ProxyCore.canMutateProxy({ user_started: false, status: "IDLE" }), true);
  assert.match(worker, /PROXY_MUTATION_WAIT_FOR_CURRENT_STEP/);
});

test("proxy auth credentials are only supplied for the active proxy challenge", () => {
  const profile = ProxyCore.normalizeProxyMarketList(sample)[0];
  assert.equal(ProxyCore.challengerMatchesProfile({ isProxy: true, challenger: { host: "127.0.0.1", port: 8000 } }, profile), true);
  assert.equal(ProxyCore.challengerMatchesProfile({ isProxy: false, challenger: { host: "127.0.0.1", port: 8000 } }, profile), false);
  assert.equal(ProxyCore.challengerMatchesProfile({ isProxy: true, challenger: { host: "127.0.0.1", port: 8001 } }, profile), false);
});

test("manifest exposes only the permissions needed for manual authenticated proxy profiles and Proxy.Market sync", () => {
  for (const permission of ["proxy", "webRequest", "webRequestAuthProvider"]) assert.ok(manifest.permissions.includes(permission));
  assert.ok(manifest.host_permissions.includes("https://api.dashboard.proxy.market/*"));
  assert.ok(manifest.host_permissions.includes("https://*.proxy.market/*"));
  assert.equal(manifest.permissions.includes("webRequestBlocking"), false);
});

test("manual endpoint creation remains explicit; automatic recovery may create one rotation=0 endpoint only inside the existing package", () => {
  assert.match(worker, /change_ip_link/);
  assert.match(worker, /maybeCreateRecoveryEndpoint/);
  assert.match(worker, /ProxyCore\.createProxyInPackage/);
  assert.match(worker, /rotation:\s*0/);
  assert.doesNotMatch(worker, /PROXY_PROFILE_FAILOVER_ON_IP_BLOCK/);
  for (const forbidden of ["buy-proxy", "buy-proxies", "buy-traffic"]) assert.equal(worker.includes(forbidden), false, forbidden);
  assert.match(worker, /AF_PROXY_ENDPOINT_CREATE/);
  assert.match(popup, /id="proxy-main-action"/);
  assert.match(popup, /id="proxy-endpoint-create"/);
  assert.doesNotMatch(popup, /id="proxy-manual-/);
});


test("traffic-residential records can normalize pool host / range style without a classic IP id", () => {
  const profile = ProxyCore.normalizeProxyMarketRecord({ package_id: 68507, login: "user", password: "pass", country: "ru", rotation: -1, port_from: 10000, port_to: 10999 });
  assert.ok(profile);
  assert.equal(profile.host, "pool.proxy.market");
  assert.equal(profile.http_port, 10000);
  assert.equal(profile.socks_port, 10999);
  assert.equal(profile.package_id, 68507);
  assert.equal(profile.rotation_settings.rotate, -1);
});

test("safe list diagnostics expose field names but not field values", () => {
  const payload = { data: [{ login: "do-not-log", password: "secret", ports: { http: 10000, socks: 10999 } }] };
  const shape = ProxyCore.safeProxyRowShape(payload);
  assert.equal(shape.row_count, 1);
  assert.ok(shape.keys.includes("login"));
  assert.ok(shape.keys.includes("password"));
  assert.deepEqual(shape.nested.ports, ["http", "socks"]);
  assert.equal(JSON.stringify(shape).includes("do-not-log"), false);
  assert.equal(JSON.stringify(shape).includes("secret"), false);
});
