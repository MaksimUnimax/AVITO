"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("proxy auth retries are bounded but credentials are not dropped after the first challenge", () => {
  assert.match(worker, /PROXY_AUTH_MAX_ATTEMPTS_PER_REQUEST = 3/);
  assert.doesNotMatch(worker, /if \(attempts > 1\) \{ callback\(\{\}\); return; \}/);
  assert.match(worker, /if \(attempts > PROXY_AUTH_MAX_ATTEMPTS_PER_REQUEST\)/);
  assert.match(worker, /callback\(\{ cancel: true \}\)/);
  assert.match(worker, /PROXY_AUTH_RETRY_LIMIT/);
});

test("proxy auth listener covers both http and https Avito navigation", () => {
  assert.match(worker, /"https:\/\/avito\.ru\/\*"/);
  assert.match(worker, /"http:\/\/avito\.ru\/\*"/);
  assert.ok(manifest.host_permissions.includes("http://avito.ru/*"));
  assert.ok(manifest.host_permissions.includes("http://www.avito.ru/*"));
});

test("authentication is armed before PAC apply without pretending handlerBehaviorChanged flushes sockets", () => {
  assert.match(worker,/pending_auth_profile_id:profile.id/);
  assert.match(worker,/proxyAuthAttempts\.clear\(\)/);
  assert.doesNotMatch(worker,/chrome\.webRequest\.handlerBehaviorChanged\(/);
  const start=worker.indexOf("async function applyProxyProfileInternal");
  const end=worker.indexOf("const recoveryFlight",start);const fn=worker.slice(start,end);
  assert.ok(fn.indexOf("pending_auth_profile_id:profile.id")<fn.indexOf("await proxySettingsSet(config)"));
});

test("unexpected proxy challenge is cancelled instead of receiving credentials or showing native auth UI", () => {
  assert.match(worker, /PROXY_AUTH_CHALLENGER_MISMATCH/);
  assert.match(worker, /challengeMatches/);
  assert.match(worker, /callback\(\{ cancel: true \}\)/);
});

test("auth diagnostics never log password or login values", () => {
  const authBlock = worker.slice(worker.indexOf("const proxyAuthAttempts"), worker.indexOf("if (chrome.proxy?.onProxyError"));
  assert.doesNotMatch(authBlock, /log\([^\n]*(profile\.password|profile\.login|secret\.profiles)/);
  assert.match(authBlock, /PROXY_AUTH_CREDENTIALS_SUPPLIED/);
});
