"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const popup = fs.readFileSync(path.join(root, "popup.html"), "utf8");

test("v1.0.34 preserves zero-media Traffic Lite alongside unified recovery", () => {
  assert.equal(manifest.version, "1.0.34");
  assert.ok(manifest.permissions.includes("declarativeNetRequest"));
  assert.match(worker, /PROXY_DATA_SAVER_RESOURCE_TYPES\s*=\s*Object\.freeze\(\["image", "media", "font", "object", "ping"\]\)/);
  assert.match(worker, /initiatorDomains:\s*\["avito\.ru", "www\.avito\.ru"\]/);
  assert.doesNotMatch(worker, /condition:\s*\{\s*requestDomains:\s*\["avito\.ru"\]/);
  for (const type of ["script", "stylesheet", "xmlhttprequest", "main_frame"]) {
    assert.doesNotMatch(worker, new RegExp(`PROXY_DATA_SAVER_RESOURCE_TYPES[^\\n]*${type}`));
  }
});

test("Finder Avito tabs receive tab-scoped session blocking rules", () => {
  assert.match(worker, /updateSessionRules/);
  assert.match(worker, /condition:\s*\{\s*tabIds:\s*\[Number\(tabId\)\],\s*resourceTypes:/);
  assert.match(worker, /prepareTrafficLiteForNavigation\(tab\.id\)/);
  assert.match(worker, /tabsCreate\(\{\s*url:\s*expectedHref/);
  assert.doesNotMatch(worker, /tabsCreate\(\{\s*url:\s*[\x27"]about:blank[\x27"]/);
  assert.match(worker, /TRAFFIC_LITE_TAB_PREPARED/);
  assert.match(worker, /removeTrafficLiteRulesForTab\(tabId\)/);
  assert.match(worker, /changeInfo\.url && !Core\.isAvitoUrl\(changeInfo\.url\).*removeTrafficLiteRulesForTab\(tabId\)/s);
});

test("CAPTCHA gets a higher-priority per-tab media allow override and exactly bounded reload path", () => {
  assert.match(worker, /TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE/);
  assert.match(worker, /priority:\s*100,\s*\n\s*action:\s*\{ type: "allow" \}/);
  assert.match(worker, /const overrideAdded = await ensureCaptchaMediaOverride\(verified\.id\)/);
  assert.match(worker, /TRAFFIC_LITE_CAPTCHA_MEDIA_RELOAD_REQUESTED/);
  assert.match(worker, /SEQUENTIAL_CAPTCHA_MEDIA_RELOAD_REQUESTED/);
  assert.match(worker, /reloadCaptchaWithMediaIfNeeded/);
  assert.match(worker, /if \(overrideAdded\) \{/);
  assert.match(worker, /await tabsReload\(verified\.id\)/);
  assert.match(worker, /clearCaptchaMediaOverride\(verified\.id\)/);
});

test("popup explains zero-media behavior", () => {
  assert.match(popup, /Экономия трафика: без медиа/);
  assert.match(popup, /включая CDN/);
  assert.match(popup, /Для CAPTCHA медиа временно разрешается и страница CAPTCHA один раз перезагружается/);
});
