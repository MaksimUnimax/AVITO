"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");

const corePath = process.argv[2];
if (!corePath) throw new Error("usage: node ip_block_firewall_classifier_v141.test.js <core.js>");
const Core = require(path.resolve(corePath));

function el(tagName, text, attrs = {}) {
  return {
    nodeType: 1,
    hidden: false,
    parentElement: null,
    tagName,
    innerText: text || "",
    textContent: text || "",
    getBoundingClientRect() { return { width: 800, height: 80 }; },
    closest() { return null; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; }
  };
}

function probeFixture({ heading, bodyText, captchaIframe = false }) {
  const headingNode = el("H2", heading);
  const body = el("BODY", bodyText);
  const iframe = captchaIframe ? el("IFRAME", "", { src: "https://captcha.example/challenge" }) : null;
  global.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });
  global.document = {
    body,
    querySelectorAll(selector) {
      if (selector.includes("a[data-marker='item-title']")) return [];
      if (selector.includes("h1,h2")) return iframe ? [headingNode, iframe] : [headingNode];
      return [];
    }
  };
  return Core.publicPageInterruptionProbe();
}

const firewall = probeFixture({
  heading: "Доступ ограничен: проблема с IP",
  bodyText: "Доступ ограничен: проблема с IP\nИногда такое случается, чтобы вернуться на сайт нажмите на кнопку Продолжить для решения капчи\nПродолжить"
});
assert.equal(firewall.ip_block, true, "live firewall heading must remain IP-block evidence");
assert.equal(
  firewall.captcha,
  false,
  "RED: a textual reference to a future CAPTCHA on the IP firewall landing page is not an actual CAPTCHA challenge"
);

const challenge = probeFixture({
  heading: "Проверка безопасности",
  bodyText: "Подтвердите, что вы человек",
  captchaIframe: true
});
assert.equal(challenge.captcha, true, "a concrete CAPTCHA challenge must remain manual");
assert.equal(challenge.ip_block, false, "plain CAPTCHA challenge must not masquerade as IP block");

console.log("PASS 2/2 — firewall hint disambiguated; real CAPTCHA preserved");
