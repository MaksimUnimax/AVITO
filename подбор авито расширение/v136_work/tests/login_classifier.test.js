"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "avito_content.js"), "utf8");
const detectBlock = source.match(/function detectBlock\(\) \{([\s\S]*?)\n  \}/);

test("login text no longer triggers the CAPTCHA stop before generic CLICK target resolution", () => {
  assert.ok(detectBlock, "detectBlock function exists");
  const body = detectBlock[1];
  assert.match(body, /Core\.publicPageInterruptionProbe\(\)/);
  assert.doesNotMatch(body, /войти\|войдите\|sign in\|log in/);
  assert.doesNotMatch(body, /auth-popup-auth/);
});

test("manual CAPTCHA boundary remains explicit and no bypass primitive is added", () => {
  assert.match(source, /probe\.captcha[^\n]+BLOCKED_LOGIN_OR_CAPTCHA/);
  assert.doesNotMatch(source, /Runtime\.|Network\.|Fetch\.|Page\.|Input\.insertText/);
});
