"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");

test("popup exposes an editable operator-protocol prompt and copies the current edited value", () => {
  const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
  const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");
  assert.match(html, /id="assistant-prompt"/);
  assert.doesNotMatch(html, /id="assistant-prompt"[^>]*readonly/);
  assert.match(html, /https:\/\/github\.com\/MaksimUnimax\/AVITO\/blob\/main\/AVITO_FINDER_OPERATOR_PROTOCOL_AND_ASSISTANT_PROMPT_v1\.0\.md/);
  assert.match(html, /id="copy-assistant-prompt"/);
  assert.match(popup, /copyAssistantPrompt\.addEventListener\("click"/);
  assert.match(popup, /navigator\.clipboard\.writeText\(assistantPrompt\.value\)/);
  assert.match(popup, /assistantPrompt\.focus\(\);assistantPrompt\.select\(\);document\.execCommand\("copy"\)/);
});

test("popup exposes one clear proxy action and hides advanced provider plumbing", () => {
  const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
  const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");
  for (const id of ["proxy-profile", "proxy-sync", "proxy-main-action", "proxy-main-badge", "proxy-profile-login", "proxy-profile-password", "proxy-remove-profile"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /id="proxy-manual-/);
  assert.doesNotMatch(html, /id="proxy-enabled"/);
  assert.doesNotMatch(html, /id="proxy-direct"/);
  assert.doesNotMatch(html, /id="proxy-apply"/);
  assert.match(html, /<details class="advanced">/);
  assert.match(popup, /AF_PROXY_MARKET_SYNC/);
  assert.match(popup, /AF_PROXY_APPLY/);
  assert.match(popup, /AF_PROXY_DIRECT/);
  assert.match(popup, /AF_PROXY_PROFILE_DETAILS/);
  assert.match(popup, /AF_PROXY_PROFILE_DELETE/);
  assert.doesNotMatch(popup, /captcha.*AF_PROXY_APPLY|AF_PROXY_APPLY.*captcha/i);
});
