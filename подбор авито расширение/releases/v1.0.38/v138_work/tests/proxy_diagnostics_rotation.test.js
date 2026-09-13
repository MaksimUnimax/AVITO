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

test("rotation semantics match Proxy.Market API contract", () => {
  assert.deepEqual(ProxyCore.rotationMode(-1), { value: -1, code: "sticky", label: "Sticky session", description: "IP закреплён на сессию и автоматически на каждый запрос не меняется." });
  assert.equal(ProxyCore.rotationMode(0).code, "every_request");
  assert.match(ProxyCore.rotationMode(0).description, /Каждый новый HTTP-запрос получает новый IP/);
  assert.equal(ProxyCore.rotationMode(15).code, "timed");
  assert.match(ProxyCore.rotationMode(15).label, /15/);
});

test("popup keeps rotation choices concise and moves them into advanced endpoint settings", () => {
  assert.match(popupHtml, /<summary>Настройки Proxy\.Market<\/summary>/);
  assert.match(popupHtml, /<option value="-1">Sticky session<\/option>/);
  assert.match(popupHtml, /<option value="0">Каждый запрос<\/option>/);
  assert.doesNotMatch(popupHtml, /10000–10999/);
  assert.match(popupJs, /function rotationLabel/);
});

test("passive proxy diagnostic is exposed without hidden Avito fetch/reload", () => {
  assert.match(popupHtml, /id="proxy-diagnostic"/);
  assert.match(popupJs, /AF_PROXY_DIAGNOSTIC/);
  assert.match(worker, /async function proxyDiagnosticView/);
  assert.match(worker, /fixedProxyAvitoDomProbe/);
  assert.match(worker, /PROXY_AUTH_CREDENTIALS_SUPPLIED/);
  assert.match(worker, /AVITO_MAIN_FRAME_COMPLETED/);
  const start = worker.indexOf("async function proxyDiagnosticView");
  const end = worker.indexOf("async function collectProxyPackages", start);
  const fn = worker.slice(start, end);
  assert.doesNotMatch(fn, /fetch\(/);
  assert.doesNotMatch(fn, /tabsUpdate|tabsCreate|reload/);
});

test("proxy application resets diagnostic epoch and direct mode clears it", () => {
  assert.match(worker, /proxy_applied_at: appliedAt/);
  assert.match(worker, /proxy_diagnostics: proxyDiagBase\(null\)/);
  assert.match(worker, /mode: "direct", proxy_applied_at: null/);
});

test("same-host before/after probes are diagnostic and never prove the Avito exit", () => {
  assert.match(worker,/async function prepareRecoveryProxy/);
  assert.match(worker,/sampleRecoveryEgress/);
  assert.match(worker,/PROXY_EGRESS_OBSERVED/);
  assert.match(worker,/avito_exit_ip_verified:false/);
  assert.match(worker,/ProxyCore\.forceChangeIpByLink\(request,/);
  assert.doesNotMatch(worker,/PROXY_PROFILE_FAILOVER_ON_IP_BLOCK/);
});

test("CAPTCHA never triggers proxy switching and recovery never buys traffic or proxies", () => {
  const captchaStart = worker.indexOf('if (interruption.captcha === true)');
  const ipStart = worker.indexOf('if (interruption.ip_block === true', captchaStart);
  const captchaBranch = worker.slice(captchaStart, ipStart);
  assert.doesNotMatch(captchaBranch, /forceProxyExitRotation|AF_PROXY_APPLY|AF_PROXY_ENDPOINT_CREATE|change_ip_link/);
  for (const forbidden of ["buy-proxy", "buy-proxies", "buy-traffic"]) assert.equal(worker.includes(forbidden), false, forbidden);
});
