"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ProxyCore = require("../proxy_manager.js");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
const css = fs.readFileSync(path.join(root, "popup.css"), "utf8");
const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");

test("proxy popup exposes one obvious status, one profile selector and one primary on/off action", () => {
  for (const id of ["proxy-main-badge", "proxy-profile", "proxy-main-action", "proxy-status"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, />ВЫКЛЮЧЕН<\/span>/);
  assert.match(html, />Включить прокси<\/button>/);
  assert.doesNotMatch(html, /id="proxy-enabled"|id="proxy-direct"|id="proxy-apply"/);
  assert.match(popup, /Выключить прокси/);
  assert.match(popup, /Переключить на выбранный/);
});

test("credentials are visible per selected profile, password is masked by default and has a show/hide control", () => {
  assert.match(html, /id="proxy-profile-login"[^>]*readonly/);
  assert.match(html, /id="proxy-profile-password" type="password"[^>]*readonly/);
  assert.match(html, /id="proxy-password-toggle"[^>]*aria-controls="proxy-profile-password"/);
  assert.match(popup, /AF_PROXY_PROFILE_DETAILS/);
  assert.match(popup, /Логин и пароль сохранены для этого профиля/);
});

test("advanced provider plumbing is hidden behind native details and the legacy fallback form is gone", () => {
  assert.match(html, /<details class="advanced">[\s\S]*<summary>Настройки Proxy\.Market<\/summary>/);
  assert.match(html, /<details class="advanced">[\s\S]*<summary>Диагностика<\/summary>/);
  assert.doesNotMatch(html, /Fallback:|proxy-manual-host|proxy-manual-login|proxy-manual-password/);
  assert.match(css, /button, input, select \{ min-height: 40px/);
});

test("real API profiles replace legacy traffic fallback duplicates", () => {
  const api1 = ProxyCore.normalizeProxyMarketRecord({ id: 9560084, ip: "pool.proxy.market", http_port: 10000, login: "same-login", password: "p1", country: "ru", package_id: 68507, rotation_settings: { rotate: -1 } });
  const api2 = ProxyCore.normalizeProxyMarketRecord({ id: 9560109, ip: "pool.proxy.market", http_port: 10000, login: "other-login", password: "p2", country: "ru", package_id: 68507, rotation_settings: { rotate: 0 } });
  const legacy = ProxyCore.makeManualTrafficProfile({ package_id: 68507, host: "pool.proxy.market", http_port: 10000, login: "same-login", password: "p1", country: "ru", rotation: -1 });
  const out = ProxyCore.dedupeProfileSet([legacy, api1, api2]);
  assert.deepEqual(out.map((p) => String(p.id)).sort(), ["9560084", "9560109"]);
});

test("profile credentials persist locally for future extension updates but API key remains session-scoped", () => {
  assert.equal(ProxyCore.STORAGE.profiles, "af_proxy_profiles_local_v1");
  assert.match(worker, /savePersistedProxyProfiles/);
  assert.match(worker, /PROXY_SAVED_PROFILES_KEY/);
  assert.match(worker, /sessionSet\(\{ \[PROXY_SECRET_KEY\]: secret \}\)/);
  assert.match(worker, /chrome\.storage\.local\.setAccessLevel\(\{ accessLevel: "TRUSTED_CONTEXTS" \}\)/);
  assert.doesNotMatch(worker, /storageSet\([^\n]*api_key/);
});

test("profile removal is local, persistent across sync and recoverable without inventing an undocumented provider delete API", () => {
  assert.match(html, /id="proxy-remove-profile"/);
  assert.match(html, /id="proxy-restore-hidden"/);
  assert.match(popup, /AF_PROXY_PROFILE_DELETE/);
  assert.match(popup, /AF_PROXY_PROFILE_RESTORE/);
  assert.match(worker, /getHiddenProxyProfileIds/);
  assert.match(worker, /PROXY_PROFILE_REMOVED_LOCAL/);
  assert.match(worker, /PROXY_HIDDEN_PROFILES_RESTORED/);
  assert.doesNotMatch(worker, /delete-proxy|remove-proxy|package\/delete-proxy/);
});

test("sensitive profile details can only be requested from an extension UI context", () => {
  assert.match(worker, /function trustedExtensionUiSender/);
  assert.match(worker, /PROXY_UI_SENDER_REQUIRED/);
  assert.match(worker, /startsWith\(\x27AF_PROXY_\x27\)/);
  assert.match(worker, /sender\?\.id === chrome\.runtime\.id/);
  assert.match(worker, /String\(sender\?\.url \|\| ""\) === chrome\.runtime\.getURL\("popup\.html"\)/);
});


test("proxy selector clearly distinguishes selected profile from active profile and no longer tells the user to stop the entire Finder run", () => {
  assert.match(popup, /Сейчас активен/);
  assert.match(popup, /Выбран/);
  assert.match(popup, /нажми «Переключить на выбранный»/);
  assert.doesNotMatch(popup, /PROXY_MUTATION_WAIT_FOR_CURRENT_STEP: "Сначала останови Finder/);
  assert.match(popup, /Дождись его завершения — останавливать весь Finder не нужно/);
});
