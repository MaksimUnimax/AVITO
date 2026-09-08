/* Avito Finder v1.0.23 — Traffic Lite and manual CAPTCHA behavior are preserved; Avito IP-block recovery now keeps the selected rotation mode, forces a fresh proxy transport epoch, verifies real proxy egress via tiny IP canaries, and reloads Avito only after verified recovery. */
"use strict";
importScripts("core.js", "proxy_manager.js");
const Core = AvitoFinderCore;
const ProxyCore = globalThis.AvitoFinderProxy;
const STATE_KEY = Core.STORAGE.state;
const LOG_KEY = Core.STORAGE.logs;
const INSPECTION_KEY = Core.STORAGE.lastInspection;
const PROXY_RUNTIME_KEY = ProxyCore.STORAGE.runtime;
const PROXY_SECRET_KEY = ProxyCore.STORAGE.secret;
const PROXY_SAVED_PROFILES_KEY = ProxyCore.STORAGE.profiles;
const PROXY_HIDDEN_PROFILES_KEY = ProxyCore.STORAGE.hidden;
const PROXY_DATA_SAVER_RULE_ID = 910001;
const TRAFFIC_LITE_TAB_RULE_BASE = 920000000;
const TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE = 1020000000;
const TRAFFIC_LITE_RULE_SPAN = 90000000;
const PROXY_DATA_SAVER_RESOURCE_TYPES = Object.freeze(["image", "media", "font", "object", "ping"]);
const PROXY_AUTH_MAX_ATTEMPTS_PER_REQUEST = 3;
const CAPTURE_PROTOCOL = "avito_finder_bridge_exact_capture_v1";
const CAPTURE_VERSION = "0.6.9";
const AVITO_READY_TIMEOUT_MS = 30000;
const AVITO_READY_POLL_MS = 750;
const AVITO_IP_BLOCK_AUTO_RECOVERY_MAX = 4;
const AVITO_IP_BLOCK_RELOAD_PROPERTIES = Object.freeze({ bypassCache: true });
const PROXY_EGRESS_CHECK_HOSTS = Object.freeze(Array.from(ProxyCore.EGRESS_CHECK_HOSTS || ["api.ipify.org", "api64.ipify.org"]));
const PROXY_EGRESS_CHECK_MAX_SAMPLES = 3;
const PROXY_TRANSPORT_CUT_SETTLE_MS = Number.isFinite(Number(globalThis.__AF_TEST_PROXY_TRANSPORT_SETTLE_MS)) ? Number(globalThis.__AF_TEST_PROXY_TRANSPORT_SETTLE_MS) : 180;
const PROXY_POST_APPLY_SETTLE_MS = Number.isFinite(Number(globalThis.__AF_TEST_PROXY_TRANSPORT_SETTLE_MS)) ? Number(globalThis.__AF_TEST_PROXY_TRANSPORT_SETTLE_MS) : 220;
const PROXY_TRANSPORT_RECOVERABLE_ERRORS = new Set(["net::ERR_TUNNEL_CONNECTION_FAILED", "net::ERR_PROXY_CONNECTION_FAILED", "net::ERR_NO_SUPPORTED_PROXIES"]);
const UI_CLICK_RECONCILE_TIMEOUT_MS = 16000;
const UI_CLICK_RECONCILE_DELAY_MS = 900;
const EXPLICIT_QUEUE_MAX_ITEMS = 30;
const SEQUENTIAL_REVIEW_DEFAULT_BATCH = 30;
const SEQUENTIAL_REVIEW_DEFAULT_CARD_GAP_MS = 0;
const SEQUENTIAL_REVIEW_CARD_GAP_MAX_MS = 2147483647;
const SEQUENTIAL_CARD_READY_TIMEOUT_MS = 18000;
const SEQUENTIAL_CARD_CONTENT_TIMEOUT_MS = 6500;
// Default production pauses are deliberately visible: the user can observe an
// Avito tab activation, bounded snapshot moment and return transition.
const AVITO_VISIBLE_ACTIVATION_DELAY_MS = Number.isFinite(Number(globalThis.__AF_TEST_VISIBLE_DELAY_MS)) ? Number(globalThis.__AF_TEST_VISIBLE_DELAY_MS) : 2500;
const AVITO_VISIBLE_POST_CAPTURE_DELAY_MS = Number.isFinite(Number(globalThis.__AF_TEST_VISIBLE_DELAY_MS)) ? Number(globalThis.__AF_TEST_VISIBLE_DELAY_MS) : 2000;
const AVITO_VISIBLE_PRE_ACTION_DELAY_MS = Number.isFinite(Number(globalThis.__AF_TEST_VISIBLE_DELAY_MS)) ? Number(globalThis.__AF_TEST_VISIBLE_DELAY_MS) : 1500;
const AVITO_VISIBLE_POST_ACTION_DELAY_MS = Number.isFinite(Number(globalThis.__AF_TEST_VISIBLE_DELAY_MS)) ? Number(globalThis.__AF_TEST_VISIBLE_DELAY_MS) : 2500;
const avitoReadyTimers = new Map();
const uiClickReconcileTimers = new Map();
const ensureLocks = new Map();
const avitoCompletionLocks = new Map();
const DEBUGGER_PROTOCOL_VERSION = "1.3";
const DEBUGGER_MAX_TYPED_GRAPHEMES = 160;
const DEBUGGER_KEY_INTERVAL_MS = 38;
const DEBUGGER_ALLOWED_METHODS = new Set(["Input.dispatchMouseEvent", "Input.dispatchKeyEvent"]);

function cb(invoke) { return new Promise((resolve, reject) => invoke((value) => { const error = chrome.runtime.lastError; if (error) reject(new Error(error.message)); else resolve(value); })); }
const storageGet = (keys) => cb((done) => chrome.storage.local.get(keys, done));
const storageSet = (values) => cb((done) => chrome.storage.local.set(values, done));
const storageRemove = (keys) => cb((done) => chrome.storage.local.remove(keys, done));
const sessionGet = (keys) => cb((done) => chrome.storage.session.get(keys, done));
const sessionSet = (values) => cb((done) => chrome.storage.session.set(values, done));
const sessionRemove = (keys) => cb((done) => chrome.storage.session.remove(keys, done));
const proxySettingsSet = (value) => cb((done) => chrome.proxy.settings.set({ value, scope: "regular" }, done));
const proxySettingsGet = () => cb((done) => chrome.proxy.settings.get({ incognito: false }, done));
const dnrUpdateDynamicRules = (options) => cb((done) => chrome.declarativeNetRequest.updateDynamicRules(options, done));
const dnrUpdateSessionRules = (options) => cb((done) => chrome.declarativeNetRequest.updateSessionRules(options, done));
const dnrGetSessionRules = () => cb((done) => chrome.declarativeNetRequest.getSessionRules(done));
const tabsQuery = (query) => cb((done) => chrome.tabs.query(query, done));
const tabsGet = (tabId) => cb((done) => chrome.tabs.get(tabId, done));
const tabsUpdate = (tabId, props) => cb((done) => chrome.tabs.update(tabId, props, done));
const tabsReload = (tabId, props = {}) => cb((done) => chrome.tabs.reload(tabId, props, done));
const tabsCreate = (props) => cb((done) => chrome.tabs.create(props, done));
const tabsSend = (tabId, message) => cb((done) => chrome.tabs.sendMessage(tabId, message, done));
const tabsRemove = (tabId) => cb((done) => chrome.tabs.remove(tabId, done));
const execute = (details) => cb((done) => chrome.scripting.executeScript(details, done));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

function shortTab(tab) { return { id: tab?.id ?? null, windowId: tab?.windowId ?? null, active: Boolean(tab?.active), url: tab?.url || null, pendingUrl: tab?.pendingUrl || null, title: tab?.title || null, status: tab?.status || null }; }
function noReceiver(error) { return /Receiving end does not exist|Could not establish connection|message port closed|Extension context invalidated/i.test(String(error?.message || error || "")); }
function asyncResponseChannelClosed(error) { return /A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received|message channel closed/i.test(String(error?.message || error || "")); }
function safeDispatchText(value) { return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 220); }
function contextFromState(state) { return { tab_id: state?.chatgpt_tab_id, window_id: state?.chatgpt_window_id, origin: state?.chat_origin, chat_path: state?.chat_path, conversation_id: state?.conversation_id }; }
function contextForTab(tab, identity) { return { tab_id: tab?.id ?? null, window_id: tab?.windowId ?? null, origin: identity?.origin || null, chat_path: identity?.chat_path || null, conversation_id: identity?.conversation_id || null }; }

async function getState() { const raw = await storageGet(STATE_KEY); return Core.makeState(raw[STATE_KEY] || {}); }
async function saveState(next) { const state = Core.makeState({ ...next, updated_at: new Date().toISOString() }); await storageSet({ [STATE_KEY]: state }); return state; }
async function log(type, fields = {}) { const raw = await storageGet(LOG_KEY); const entries = Core.appendLog(raw[LOG_KEY], type, fields); await storageSet({ [LOG_KEY]: entries }); return entries.at(-1); }
async function getTab(tabId) { try { return await tabsGet(tabId); } catch (_) { return null; } }

function emptyProxyRuntime() {
  return {
    mode: "direct",
    provider: ProxyCore.PROVIDER,
    profiles: [],
    selected_profile_id: null,
    last_sync_at: null,
    package_id: null,
    order_id: null,
    package_candidates: [],
    key_check: null,
    package_warning: null,
    last_operation: null,
    data_saver_enabled: true,
    data_saver_active: false,
    traffic: null,
    proxy_applied_at: null,
    ip_block_recovery_count: 0,
    last_ip_block_recovery: null,
    proxy_diagnostics: { last_auth_at: null, last_auth_host: null, last_auth_port: null, last_auth_attempt: null, last_auth_failure_at: null, last_auth_failure: null, last_proxy_error_at: null, last_proxy_error: null, last_avito_main_frame_at: null, last_avito_status_code: null, last_avito_tab_id: null, last_avito_request_id: null, last_avito_error_at: null, last_avito_error: null, last_egress_check_at: null, last_egress_ip: null },
    error: null
  };
}
async function getProxyRuntime() {
  const raw = await storageGet(PROXY_RUNTIME_KEY);
  const runtime = raw?.[PROXY_RUNTIME_KEY];
  return runtime && typeof runtime === "object"
    ? { ...emptyProxyRuntime(), ...runtime, profiles: Array.isArray(runtime.profiles) ? runtime.profiles : [], package_candidates: Array.isArray(runtime.package_candidates) ? runtime.package_candidates : [] }
    : emptyProxyRuntime();
}
async function saveProxyRuntime(next) {
  const runtime = {
    ...emptyProxyRuntime(),
    ...(next || {}),
    profiles: Array.isArray(next?.profiles) ? next.profiles : [],
    package_candidates: Array.isArray(next?.package_candidates) ? next.package_candidates : []
  };
  await storageSet({ [PROXY_RUNTIME_KEY]: runtime });
  return runtime;
}
async function getPersistedProxyProfiles() {
  const raw = await storageGet(PROXY_SAVED_PROFILES_KEY);
  return ProxyCore.dedupeProfileSet(Array.isArray(raw?.[PROXY_SAVED_PROFILES_KEY]) ? raw[PROXY_SAVED_PROFILES_KEY] : []);
}
async function savePersistedProxyProfiles(profiles) {
  const normalized = ProxyCore.dedupeProfileSet(profiles);
  await storageSet({ [PROXY_SAVED_PROFILES_KEY]: normalized });
  return normalized;
}
async function getHiddenProxyProfileIds() {
  const raw = await storageGet(PROXY_HIDDEN_PROFILES_KEY);
  return new Set((Array.isArray(raw?.[PROXY_HIDDEN_PROFILES_KEY]) ? raw[PROXY_HIDDEN_PROFILES_KEY] : []).map((id) => String(id)));
}
async function saveHiddenProxyProfileIds(ids) {
  const clean = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))].slice(0, ProxyCore.MAX_PROFILES);
  await storageSet({ [PROXY_HIDDEN_PROFILES_KEY]: clean });
  return clean;
}
async function visiblePersistedProxyProfiles() {
  const [profiles, hidden] = await Promise.all([getPersistedProxyProfiles(), getHiddenProxyProfileIds()]);
  return profiles.filter((profile) => !hidden.has(String(profile.id)));
}
async function getProxySecret() {
  const raw = await sessionGet(PROXY_SECRET_KEY);
  const secret = raw?.[PROXY_SECRET_KEY];
  if (secret && typeof secret === "object" && Array.isArray(secret.profiles) && secret.profiles.length) return secret;
  const persisted = await visiblePersistedProxyProfiles();
  return { api_key: secret?.api_key || "", profiles: persisted, active_profile_id: secret?.active_profile_id || null, package_id: secret?.package_id || null, order_id: secret?.order_id || null };
}
async function saveProxySecret(next) {
  const secret = { api_key: "", profiles: [], active_profile_id: null, package_id: null, order_id: null, ...(next || {}), profiles: ProxyCore.dedupeProfileSet(next?.profiles || []) };
  await sessionSet({ [PROXY_SECRET_KEY]: secret });
  return secret;
}
async function migrateLegacyProxyProfiles(installDetails = {}) {
  const runtime = await getProxyRuntime();
  const runtimeProfiles = Array.isArray(runtime.profiles) ? runtime.profiles : [];
  const realRuntime = runtimeProfiles.filter((profile) => !ProxyCore.isLegacyManualProfile(profile));
  const persisted = await getPersistedProxyProfiles();
  const cleanedPersisted = ProxyCore.dedupeProfileSet(persisted);
  if (JSON.stringify(cleanedPersisted) !== JSON.stringify(persisted)) await savePersistedProxyProfiles(cleanedPersisted);
  const persistedIds = new Set(cleanedPersisted.map((profile) => String(profile.id)));
  const selectedId = String(runtime.selected_profile_id || "");
  const selectedWasLegacy = ProxyCore.isLegacyManualProfile(runtimeProfiles.find((profile) => String(profile.id) === selectedId));
  const missingPersistedCredentials = runtime.mode === "proxy" && selectedId && !persistedIds.has(selectedId);
  const firstPersistentUpgrade = installDetails?.reason === "update" && !cleanedPersisted.length;
  const hadLegacy = realRuntime.length !== runtimeProfiles.length;
  if (!hadLegacy && !missingPersistedCredentials && !firstPersistentUpgrade) return runtime;
  if (runtime.mode === "proxy" && (selectedWasLegacy || missingPersistedCredentials || firstPersistentUpgrade)) {
    try { await proxySettingsSet(ProxyCore.directConfig()); await syncProxyDataSaverRules(false); } catch (_) {}
  }
  const visibleProfiles = firstPersistentUpgrade ? [] : (cleanedPersisted.length ? cleanedPersisted.map(ProxyCore.profileSummary).filter(Boolean) : realRuntime);
  const selected = visibleProfiles.some((profile) => String(profile.id) === selectedId) ? selectedId : (visibleProfiles[0]?.id || null);
  const next = await saveProxyRuntime({ ...runtime, mode: "direct", profiles: visibleProfiles, selected_profile_id: selected, data_saver_active: false, error: null, last_operation: "PROXY_PROFILE_STORAGE_MIGRATED" });
  await log("PROXY_PROFILE_STORAGE_MIGRATED", { removed_legacy_count: runtimeProfiles.length - realRuntime.length, persistent_profile_count: cleanedPersisted.length, cleared_stale_runtime_profiles: firstPersistentUpgrade, forced_direct: runtime.mode === "proxy" });
  return next;
}

async function proxyView() {
  const runtime = await getProxyRuntime();
  const secret = await getProxySecret();
  const active = runtime.mode === "proxy" ? runtime.profiles.find((profile) => String(profile.id) === String(runtime.selected_profile_id || "")) || null : null;
  let effective = null;
  try { effective = await proxySettingsGet(); } catch (_) {}
  return {
    ...runtime,
    active_profile: active,
    key_present: Boolean(ProxyCore.text(secret.api_key, 512)),
    hidden_profile_count: (await getHiddenProxyProfileIds()).size,
    effective_level: effective?.levelOfControl || null,
    configured_mode: effective?.value?.mode || null
  };
}
function proxyMutationError(state) {
  return ProxyCore.canMutateProxy(state) ? null : "PROXY_MUTATION_WAIT_FOR_CURRENT_STEP";
}
function proxyErrorText(error) { return String(error?.message || error || "PROXY_UNKNOWN_ERROR").slice(0, 240); }
function proxyDiagBase(runtime) {
  return { last_auth_at: null, last_auth_host: null, last_auth_port: null, last_auth_attempt: null, last_auth_failure_at: null, last_auth_failure: null, last_proxy_error_at: null, last_proxy_error: null, last_avito_main_frame_at: null, last_avito_status_code: null, last_avito_tab_id: null, last_avito_request_id: null, last_avito_error_at: null, last_avito_error: null, last_egress_check_at: null, last_egress_ip: null, ...(runtime?.proxy_diagnostics || {}) };
}
async function patchProxyDiagnostics(patch = {}) {
  const runtime = await getProxyRuntime();
  return saveProxyRuntime({ ...runtime, proxy_diagnostics: { ...proxyDiagBase(runtime), ...patch } });
}
function fixedProxyAvitoDomProbe() {
  const bodyText = String(document.body?.innerText || "").slice(0, 160000);
  return {
    href: String(location.href || ""),
    title: String(document.title || ""),
    ready_state: String(document.readyState || ""),
    body_present: Boolean(document.body),
    time_origin: Number(globalThis.performance?.timeOrigin || 0),
    ip_block: /Доступ ограничен:\s*проблема с IP/i.test(bodyText),
    captcha: /captcha|капч|провер[^\n]{0,40}робот|подтверд[^\n]{0,40}человек/i.test(bodyText),
    normal_avito: Boolean(document.querySelector("#app, [data-marker], [data-item-id], [itemtype*='Product']")) && !/Доступ ограничен:\s*проблема с IP/i.test(bodyText)
  };
}
async function probeVisibleAvitoInterruption(tab) {
  if (!tab?.id || !Core.isAvitoUrl(tab.url || "")) return { ip_block: false, captcha: false, href: String(tab?.url || ""), available: false };
  try {
    const results = await execute({ target: { tabId: tab.id }, func: fixedProxyAvitoDomProbe });
    const data = Array.isArray(results) ? results[0]?.result || null : null;
    if (!data) return { ip_block: false, captcha: false, href: String(tab.url || ""), available: false };
    return { ...data, available: true };
  } catch (error) {
    return { ip_block: false, captcha: false, href: String(tab.url || ""), available: false, error: String(error?.message || error).slice(0, 220) };
  }
}
async function proxyDiagnosticView() {
  const runtime = await getProxyRuntime();
  const secret = await getProxySecret();
  let effective = null;
  try { effective = await proxySettingsGet(); } catch (_) {}
  const fullProfile = runtime.mode === "proxy" ? (secret.profiles || []).find((item) => String(item.id) === String(runtime.selected_profile_id || secret.active_profile_id || "")) || null : null;
  const summary = fullProfile ? ProxyCore.profileSummary(fullProfile) : null;
  const appliedAtMs = Date.parse(runtime.proxy_applied_at || "") || 0;
  const diag = proxyDiagBase(runtime);
  const authAtMs = Date.parse(diag.last_auth_at || "") || 0;
  const navAtMs = Date.parse(diag.last_avito_main_frame_at || "") || 0;
  let avitoTab = null;
  try {
    const tabs = await tabsQuery({ url: ["https://www.avito.ru/*", "https://avito.ru/*"] });
    const tab = tabs.find((item) => item.active) || tabs[0] || null;
    if (tab?.id) {
      let probe = null;
      try { probe = (await execute({ target: { tabId: tab.id }, world: "ISOLATED", func: fixedProxyAvitoDomProbe }))?.[0]?.result || null; } catch (_) {}
      avitoTab = { tab_id: tab.id, url: tab.url || null, title: tab.title || null, ...(probe || {}) };
    }
  } catch (_) {}
  const proxyConfigured = runtime.mode === "proxy" && effective?.value?.mode === "pac_script" && Boolean(summary);
  const authSeenAfterApply = Boolean(appliedAtMs && authAtMs >= appliedAtMs);
  const avitoNavigationAfterApply = Boolean(appliedAtMs && navAtMs >= appliedAtMs);
  let status = "DIRECT";
  if (runtime.mode === "proxy" && !proxyConfigured) status = "PROXY_CONFIG_MISMATCH";
  else if (proxyConfigured && diag.last_proxy_error_at && (Date.parse(diag.last_proxy_error_at) || 0) >= appliedAtMs) status = "PROXY_ERROR";
  else if (proxyConfigured && avitoTab?.ip_block && authSeenAfterApply) status = "PROXY_AUTH_SEEN_AVITO_IP_BLOCK";
  else if (proxyConfigured && avitoTab?.ip_block) status = "PROXY_CONFIGURED_AVITO_IP_BLOCK_AUTH_NOT_OBSERVED";
  else if (proxyConfigured && avitoTab?.normal_avito && authSeenAfterApply && avitoNavigationAfterApply) status = "PROXY_AUTH_SEEN_AVITO_OK";
  else if (proxyConfigured && avitoTab?.normal_avito && avitoNavigationAfterApply) status = "PROXY_CONFIGURED_AVITO_OK_AUTH_NOT_OBSERVED";
  else if (proxyConfigured && !avitoTab) status = "PROXY_CONFIGURED_NO_AVITO_TAB";
  else if (proxyConfigured) status = "PROXY_CONFIGURED_WAIT_FRESH_AVITO_NAV";
  return {
    ok: true, status, active_profile: summary, rotation: ProxyCore.rotationMode(summary?.rotation),
    configured_mode: effective?.value?.mode || null, effective_level: effective?.levelOfControl || null,
    proxy_applied_at: runtime.proxy_applied_at || null, auth_seen_after_apply: authSeenAfterApply, last_auth_at: diag.last_auth_at, last_auth_attempt: diag.last_auth_attempt, last_auth_failure: diag.last_auth_failure, last_auth_failure_at: diag.last_auth_failure_at,
    avito_navigation_after_apply: avitoNavigationAfterApply, last_avito_status_code: diag.last_avito_status_code,
    last_proxy_error: diag.last_proxy_error, last_proxy_error_at: diag.last_proxy_error_at, avito_tab: avitoTab
  };
}
async function setProxyOperation(patch = {}) {
  const runtime = await getProxyRuntime();
  return saveProxyRuntime({ ...runtime, ...patch });
}
async function recordProxyFailure(operation, error, extra = {}) {
  const code = proxyErrorText(error);
  const next = await setProxyOperation({ error: code, last_operation: `${operation}_FAILED` });
  await log(`${operation}_FAILED`, { error: code, ...extra });
  return { ok: false, error: code, proxy: { ...next, active_profile: next.mode === "proxy" ? next.profiles.find((profile) => String(profile.id) === String(next.selected_profile_id || "")) || null : null } };
}
function proxyDataSaverRule() {
  // requestDomains only covered media hosted by avito.ru itself. Avito listing
  // images are commonly served from CDN domains, so match the Avito document
  // as the initiator instead. This blocks heavy third-party/CDN media before
  // bytes are fetched while leaving HTML, JS, CSS and XHR untouched.
  return {
    id: PROXY_DATA_SAVER_RULE_ID,
    priority: 1,
    action: { type: "block" },
    condition: { initiatorDomains: ["avito.ru", "www.avito.ru"], resourceTypes: [...PROXY_DATA_SAVER_RESOURCE_TYPES] }
  };
}
function trafficLiteRuleId(base, tabId) {
  const value = Number(tabId);
  if (!Number.isInteger(value) || value < 0) throw new Error("TRAFFIC_LITE_TAB_ID_INVALID");
  return base + (value % TRAFFIC_LITE_RULE_SPAN);
}
function trafficLiteTabBlockRule(tabId) {
  return {
    id: trafficLiteRuleId(TRAFFIC_LITE_TAB_RULE_BASE, tabId),
    priority: 5,
    action: { type: "block" },
    condition: { tabIds: [Number(tabId)], resourceTypes: [...PROXY_DATA_SAVER_RESOURCE_TYPES] }
  };
}
function trafficLiteCaptchaAllowRule(tabId) {
  return {
    id: trafficLiteRuleId(TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE, tabId),
    priority: 100,
    action: { type: "allow" },
    condition: { tabIds: [Number(tabId)], resourceTypes: [...PROXY_DATA_SAVER_RESOURCE_TYPES] }
  };
}
function isTrafficLiteSessionRule(rule) {
  const id = Number(rule?.id);
  return Number.isInteger(id) && (
    (id >= TRAFFIC_LITE_TAB_RULE_BASE && id < TRAFFIC_LITE_TAB_RULE_BASE + TRAFFIC_LITE_RULE_SPAN) ||
    (id >= TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE && id < TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE + TRAFFIC_LITE_RULE_SPAN)
  );
}
async function clearTrafficLiteSessionRules() {
  if (!chrome.declarativeNetRequest?.getSessionRules || !chrome.declarativeNetRequest?.updateSessionRules) return;
  const rules = await dnrGetSessionRules();
  const removeRuleIds = (Array.isArray(rules) ? rules : []).filter(isTrafficLiteSessionRule).map((rule) => rule.id);
  if (removeRuleIds.length) await dnrUpdateSessionRules({ removeRuleIds, addRules: [] });
}
async function setTrafficLiteTabBlock(tabId, active, { resetCaptchaOverride = false } = {}) {
  if (!chrome.declarativeNetRequest?.updateSessionRules) throw new Error("TRAFFIC_LITE_SESSION_DNR_UNAVAILABLE");
  const blockId = trafficLiteRuleId(TRAFFIC_LITE_TAB_RULE_BASE, tabId);
  const captchaId = trafficLiteRuleId(TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE, tabId);
  const removeRuleIds = [blockId];
  if (!active || resetCaptchaOverride) removeRuleIds.push(captchaId);
  await dnrUpdateSessionRules({ removeRuleIds, addRules: active ? [trafficLiteTabBlockRule(tabId)] : [] });
}
async function trafficLiteRuntimeActive() {
  const runtime = await getProxyRuntime();
  return runtime.mode === "proxy" && runtime.data_saver_enabled !== false;
}
async function prepareTrafficLiteForNavigation(tabId) {
  const active = await trafficLiteRuntimeActive();
  await setTrafficLiteTabBlock(tabId, active, { resetCaptchaOverride: true });
  if (active) await log("TRAFFIC_LITE_TAB_PREPARED", { tab_id: tabId, blocked_resource_types: PROXY_DATA_SAVER_RESOURCE_TYPES.join(",") });
  return active;
}
async function ensureTrafficLiteForAvitoTab(tab) {
  if (!tab?.id || !Core.isAvitoUrl(String(tab.pendingUrl || tab.url || ""))) return false;
  const active = await trafficLiteRuntimeActive();
  await setTrafficLiteTabBlock(tab.id, active);
  return active;
}
async function syncTrafficLiteOpenAvitoTabs(active) {
  if (!active) { await clearTrafficLiteSessionRules(); return; }
  const tabs = await tabsQuery({ url: ["https://www.avito.ru/*", "https://avito.ru/*"] });
  for (const tab of tabs) {
    if (!tab?.id) continue;
    await setTrafficLiteTabBlock(tab.id, true);
  }
}
async function captchaMediaOverridePresent(tabId) {
  if (!chrome.declarativeNetRequest?.getSessionRules) return false;
  const id = trafficLiteRuleId(TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE, tabId);
  const rules = await dnrGetSessionRules();
  return (Array.isArray(rules) ? rules : []).some((rule) => Number(rule?.id) === id);
}
async function ensureCaptchaMediaOverride(tabId) {
  if (!await trafficLiteRuntimeActive()) return false;
  if (await captchaMediaOverridePresent(tabId)) return false;
  const allowId = trafficLiteRuleId(TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE, tabId);
  await dnrUpdateSessionRules({ removeRuleIds: [allowId], addRules: [trafficLiteCaptchaAllowRule(tabId)] });
  await log("TRAFFIC_LITE_CAPTCHA_MEDIA_OVERRIDE_ENABLED", { tab_id: tabId, allowed_resource_types: PROXY_DATA_SAVER_RESOURCE_TYPES.join(",") });
  return true;
}
async function clearCaptchaMediaOverride(tabId) {
  if (!chrome.declarativeNetRequest?.updateSessionRules || !Number.isInteger(Number(tabId))) return;
  const allowId = trafficLiteRuleId(TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE, Number(tabId));
  await dnrUpdateSessionRules({ removeRuleIds: [allowId], addRules: [] });
}
async function removeTrafficLiteRulesForTab(tabId) {
  if (!chrome.declarativeNetRequest?.updateSessionRules || !Number.isInteger(Number(tabId))) return;
  await dnrUpdateSessionRules({
    removeRuleIds: [
      trafficLiteRuleId(TRAFFIC_LITE_TAB_RULE_BASE, Number(tabId)),
      trafficLiteRuleId(TRAFFIC_LITE_CAPTCHA_ALLOW_RULE_BASE, Number(tabId))
    ],
    addRules: []
  });
}
async function syncProxyDataSaverRules(active) {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) throw new Error("PROXY_DATA_SAVER_DNR_UNAVAILABLE");
  await dnrUpdateDynamicRules({ removeRuleIds: [PROXY_DATA_SAVER_RULE_ID], addRules: active ? [proxyDataSaverRule()] : [] });
  await syncTrafficLiteOpenAvitoTabs(active);
}
async function setProxyDataSaver(enabled) {
  const state = await getState();
  const blocked = proxyMutationError(state);
  if (blocked) return recordProxyFailure("PROXY_DATA_SAVER", blocked);
  const runtime = await getProxyRuntime();
  const desired = enabled === true;
  const active = desired && runtime.mode === "proxy";
  try { await syncProxyDataSaverRules(active); } catch (error) { return recordProxyFailure("PROXY_DATA_SAVER", error); }
  const next = await saveProxyRuntime({ ...runtime, data_saver_enabled: desired, data_saver_active: active, error: null, last_operation: "PROXY_DATA_SAVER_CHANGED" });
  await log("PROXY_DATA_SAVER_CHANGED", { enabled: desired, active, blocked_resource_types: PROXY_DATA_SAVER_RESOURCE_TYPES.join(",") });
  return { ok: true, proxy: { ...next, active_profile: next.mode === "proxy" ? next.profiles.find((profile) => String(profile.id) === String(next.selected_profile_id || "")) || null : null } };
}
async function collectProxyPackages(apiKey) {
  const packages = [];
  const seen = new Set();
  for (let page = 1; page <= 10; page += 1) {
    const result = await ProxyCore.fetchTrafficPackages(globalThis.fetch, apiKey, { page, per_page: 10 });
    for (const item of result.packages) {
      if (seen.has(item.id)) continue;
      seen.add(item.id); packages.push(item);
    }
    const lastPage = ProxyCore.int(result.metadata?.lastPage, page);
    if (page >= lastPage || !result.packages.length) break;
  }
  return packages;
}
async function waitForCaptchaMediaReloadReady(tabId, windowId, expectedHref, previousTimeOrigin, timeoutMs = SEQUENTIAL_CARD_READY_TIMEOUT_MS) {
  const timeout = Math.max(1000, Math.min(Number(timeoutMs) || SEQUENTIAL_CARD_READY_TIMEOUT_MS, SEQUENTIAL_CARD_READY_TIMEOUT_MS));
  const deadline = Date.now() + timeout;
  const reloadState = {
    current_window_id: windowId,
    avito_navigation_expected: false,
    avito_reload_expected: true,
    avito_reload_previous_time_origin: Number(previousTimeOrigin || 0)
  };
  while (Date.now() < deadline) {
    const tab = await getTab(tabId);
    if (!tab) throw new Error(`CAPTCHA_MEDIA_RELOAD_TAB_MISSING:${tabId}`);
    if (tab.windowId !== windowId) throw new Error(`CAPTCHA_MEDIA_RELOAD_WINDOW_INVALID:${tabId}`);
    const actual = canonicalPublicListingUrl(tab.url || tab.pendingUrl || "");
    const expected = canonicalPublicListingUrl(expectedHref || "");
    if (expected && actual && actual !== expected) throw new Error(`CAPTCHA_MEDIA_RELOAD_URL_MISMATCH:${tabId}`);
    const readiness = await probeAvitoPageReadiness(tab, windowId, reloadState);
    if (readiness.ready) return { tab, readiness };
    await wait(Math.min(AVITO_READY_POLL_MS, Math.max(50, deadline - Date.now())));
  }
  throw new Error(`CAPTCHA_MEDIA_RELOAD_TIMEOUT:${tabId}`);
}
async function reloadCaptchaWithMediaIfNeeded(tab, windowId, expectedHref, interruption, logEvent = "CAPTCHA_MEDIA_RELOAD_REQUESTED") {
  if (!tab?.id || interruption?.captcha !== true) return { tab, reloaded: false };
  const overrideAdded = await ensureCaptchaMediaOverride(tab.id);
  if (!overrideAdded) return { tab, reloaded: false };
  const previousTimeOrigin = Number(interruption?.time_origin || 0);
  await log(logEvent, { tab_id: tab.id, href: tab.url || expectedHref || null, previous_time_origin: previousTimeOrigin, media_override: true, reload_once: true });
  await tabsReload(tab.id);
  const ready = await waitForCaptchaMediaReloadReady(tab.id, windowId, expectedHref || tab.url || "", previousTimeOrigin);
  await log(`${logEvent}_COMPLETED`, { tab_id: tab.id, href: ready.tab?.url || null, readiness_source: ready.readiness?.source || null, reload_once: true });
  return { tab: ready.tab, reloaded: true, readiness: ready.readiness };
}
async function checkProxyMarketKey(message = {}) {
  const priorSecret = await getProxySecret();
  const runtime = await getProxyRuntime();
  const apiKey = ProxyCore.text(message?.api_key || priorSecret.api_key, 512);
  if (!apiKey) return recordProxyFailure("PROXY_MARKET_KEY_CHECK", "PROXY_MARKET_API_KEY_REQUIRED");

  // Key validity is determined ONLY by the provider's dedicated balance endpoint.
  // Package discovery is intentionally best-effort so a package-list 400 cannot
  // incorrectly turn a valid API key into PROXY_MARKET_KEY_INVALID.
  let balanceResult;
  try {
    balanceResult = await ProxyCore.fetchProxyMarketBalance(globalThis.fetch, apiKey);
  } catch (error) {
    const code = proxyErrorText(error);
    const keyCheck = { valid: false, checked_at: new Date().toISOString(), error: code };
    const next = await saveProxyRuntime({ ...runtime, key_check: keyCheck, package_warning: null, error: code, last_operation: "PROXY_MARKET_KEY_INVALID" });
    await log("PROXY_MARKET_KEY_INVALID", { error: code, stage: error?.stage || "BALANCE", http_status: error?.status || null, provider_message: ProxyCore.text(error?.provider_message, 180) || null });
    return { ok: false, error: code, proxy: next };
  }

  let packageCandidates = [];
  let activePackages = [];
  let packageWarning = null;
  try {
    const packages = await collectProxyPackages(apiKey);
    packageCandidates = packages.map(ProxyCore.packageSummary).filter(Boolean);
    activePackages = packageCandidates.filter((item) => item.is_active);
  } catch (error) {
    packageWarning = proxyErrorText(error);
    await log("PROXY_MARKET_PACKAGE_DISCOVERY_FAILED", { error: packageWarning, stage: error?.stage || "PACKAGES", http_status: error?.status || null, provider_message: ProxyCore.text(error?.provider_message, 180) || null });
  }

  const requestedPackage = ProxyCore.int(message?.package_id, null);
  const requestedOrder = ProxyCore.int(message?.order_id, null);
  const suggestedPackage = requestedPackage || (activePackages.length === 1 ? activePackages[0].id : null);
  await saveProxySecret({ ...priorSecret, api_key: apiKey, package_id: requestedPackage || priorSecret.package_id || suggestedPackage || null, order_id: requestedOrder || priorSecret.order_id || null });
  const keyCheck = {
    valid: true,
    checked_at: new Date().toISOString(),
    balance: balanceResult.balance,
    package_count: packageCandidates.length,
    active_package_count: activePackages.length,
    suggested_package_id: suggestedPackage,
    package_warning: packageWarning
  };
  const next = await saveProxyRuntime({
    ...runtime,
    key_check: keyCheck,
    package_warning: packageWarning,
    package_candidates: packageCandidates,
    package_id: requestedPackage || runtime.package_id || suggestedPackage || null,
    order_id: requestedOrder || runtime.order_id || null,
    error: null,
    last_operation: "PROXY_MARKET_KEY_VALID"
  });
  await log("PROXY_MARKET_KEY_VALID", { balance: balanceResult.balance, package_count: packageCandidates.length, active_package_count: activePackages.length, suggested_package_id: suggestedPackage, package_warning: packageWarning });
  return { ok: true, proxy: { ...next, active_profile: next.mode === "proxy" ? next.profiles.find((profile) => String(profile.id) === String(next.selected_profile_id || "")) || null : null }, suggested_package_id: suggestedPackage, package_warning: packageWarning };
}
async function importProxyKeyBundle(message = {}) {
  try {
    const bundle = ProxyCore.parseKeyBundle(message?.bundle);
    const priorSecret = await getProxySecret();
    const runtime = await getProxyRuntime();
    const fullProfiles = ProxyCore.dedupeProfileSet(Array.isArray(bundle.profiles) ? bundle.profiles : []);
    await savePersistedProxyProfiles(fullProfiles);
    await saveHiddenProxyProfileIds([]);
    const summaries = fullProfiles.map(ProxyCore.profileSummary).filter(Boolean);
    const selected = summaries.some((profile) => String(profile.id) === String(runtime.selected_profile_id || "")) ? runtime.selected_profile_id : (summaries[0]?.id || null);
    await saveProxySecret({ ...priorSecret, api_key: bundle.api_key, package_id: bundle.package_id, order_id: bundle.order_id, profiles: fullProfiles, active_profile_id: null });
    const next = await saveProxyRuntime({ ...runtime, profiles: summaries, selected_profile_id: selected, package_id: bundle.package_id, order_id: bundle.order_id, error: null, last_operation: fullProfiles.length ? "PROXY_CONFIG_FILE_IMPORTED" : "PROXY_KEY_FILE_IMPORTED" });
    await log(fullProfiles.length ? "PROXY_CONFIG_FILE_IMPORTED" : "PROXY_KEY_FILE_IMPORTED", { package_id: bundle.package_id, order_id: bundle.order_id, profile_count: summaries.length });
    return { ok: true, proxy: next, key_present: true, package_id: bundle.package_id, order_id: bundle.order_id, profile_count: summaries.length };
  } catch (error) { return recordProxyFailure("PROXY_KEY_FILE_IMPORT", error); }
}
async function exportProxyKeyBundle(message = {}) {
  try {
    const priorSecret = await getProxySecret();
    const runtime = await getProxyRuntime();
    const bundle = ProxyCore.makeKeyBundle({
      api_key: ProxyCore.text(message?.api_key || priorSecret.api_key, 512),
      package_id: ProxyCore.int(message?.package_id, null) || priorSecret.package_id || runtime.package_id || null,
      order_id: ProxyCore.int(message?.order_id, null) || priorSecret.order_id || runtime.order_id || null,
      profiles: priorSecret.profiles
    });
    await log("PROXY_CONFIG_FILE_EXPORTED", { package_id: bundle.package_id, order_id: bundle.order_id, profile_count: bundle.profiles.length });
    return { ok: true, bundle };
  } catch (error) { return recordProxyFailure("PROXY_KEY_FILE_EXPORT", error); }
}
async function refreshProxyTrafficUsage() {
  const runtime = await getProxyRuntime();
  const secret = await getProxySecret();
  const apiKey = ProxyCore.text(secret.api_key, 512);
  if (!apiKey) return recordProxyFailure("PROXY_TRAFFIC_REFRESH", "PROXY_MARKET_API_KEY_REQUIRED");
  const packageId = ProxyCore.int(runtime.package_id || secret.package_id, null);
  if (!packageId) return recordProxyFailure("PROXY_TRAFFIC_REFRESH", "PROXY_PACKAGE_ID_REQUIRED_FOR_TRAFFIC");
  try {
    let found = null;
    for (let page = 1; page <= 10 && !found; page += 1) {
      const result = await ProxyCore.fetchTrafficPackages(globalThis.fetch, apiKey, { page, per_page: 10 });
      found = result.packages.find((item) => Number(item.id) === Number(packageId)) || null;
      const lastPage = ProxyCore.int(result.metadata?.lastPage, page);
      if (page >= lastPage || !result.packages.length) break;
    }
    if (!found) throw new Error("PROXY_TRAFFIC_PACKAGE_NOT_FOUND");
    const traffic = { ...found, checked_at: new Date().toISOString() };
    const next = await saveProxyRuntime({ ...runtime, traffic, error: null, last_operation: "PROXY_TRAFFIC_REFRESHED" });
    await log("PROXY_TRAFFIC_REFRESHED", { package_id: found.id, used: found.used, total: found.total, remaining: found.remaining });
    return { ok: true, proxy: { ...next, active_profile: next.mode === "proxy" ? next.profiles.find((profile) => String(profile.id) === String(next.selected_profile_id || "")) || null : null } };
  } catch (error) { return recordProxyFailure("PROXY_TRAFFIC_REFRESH", error, { package_id: packageId }); }
}
async function collectProxyPagesDetailed(apiKey, options = {}) {
  const collected = [];
  const seen = new Set();
  const shapes = [];
  let total = null;
  let rawRowCount = 0;
  const pageSize = 10;
  for (let page = 1; page <= 50 && collected.length < ProxyCore.MAX_PROFILES; page += 1) {
    const requestOptions = { ...options, page, page_size: pageSize, sort: 1 };
    const payload = await ProxyCore.fetchProxyMarketPage(globalThis.fetch, apiKey, requestOptions);
    const shape = ProxyCore.safeProxyRowShape(payload);
    rawRowCount += Number(shape.row_count || 0);
    if (shape.row_count && shapes.length < 4) shapes.push({ page, keys: shape.keys, nested: shape.nested });
    const rows = ProxyCore.normalizeProxyMarketList(payload, { package_id: options.package_id, order_id: options.order_id, proxy_type: "resident", type: options.type });
    total = ProxyCore.proxyListTotal(payload) ?? total;
    for (const profile of rows) {
      if (seen.has(profile.id)) continue;
      seen.add(profile.id); collected.push(profile);
      if (collected.length >= ProxyCore.MAX_PROFILES) break;
    }
    const rawRowsThisPage = Number(shape.row_count || 0);
    if (!rawRowsThisPage || (total != null && rawRowCount >= total) || rawRowsThisPage < pageSize) break;
  }
  return { profiles: collected, total, raw_row_count: rawRowCount, shapes };
}
async function collectProxyPages(apiKey, options = {}) {
  return (await collectProxyPagesDetailed(apiKey, options)).profiles;
}
async function collectProxyPackageCompat(apiKey, packageId, orderId = null) {
  const variants = [
    { name: "package_all", options: { package_id: packageId, order_id: orderId, type: "all" } },
    { name: "package_ipv4", options: { package_id: packageId, order_id: orderId, type: "ipv4" } },
    { name: "package_all_resident", options: { package_id: packageId, order_id: orderId, type: "all", force_proxy_type: true } }
  ];
  let bestDiagnostic = null;
  for (const variant of variants) {
    try {
      const result = await collectProxyPagesDetailed(apiKey, variant.options);
      await log("PROXY_MARKET_LIST_VARIANT", { variant: variant.name, package_id: packageId, raw_row_count: result.raw_row_count, normalized_profile_count: result.profiles.length, row_shapes: result.shapes });
      if (result.profiles.length) return { profiles: result.profiles, variant: variant.name, diagnostic: result };
      if (!bestDiagnostic || result.raw_row_count > bestDiagnostic.raw_row_count) bestDiagnostic = { ...result, variant: variant.name };
    } catch (error) {
      await log("PROXY_MARKET_LIST_VARIANT_FAILED", { variant: variant.name, package_id: packageId, error: proxyErrorText(error), stage: error?.stage || "LIST", http_status: error?.status || null, provider_message: ProxyCore.text(error?.provider_message, 180) || null });
    }
  }
  return { profiles: [], variant: null, diagnostic: bestDiagnostic };
}
async function syncProxyMarket(message = {}) {
  const priorSecret = await getProxySecret();
  const priorRuntime = await getProxyRuntime();
  const apiKey = ProxyCore.text(message?.api_key || priorSecret.api_key, 512);
  if (!apiKey) return recordProxyFailure("PROXY_MARKET_SYNC", "PROXY_MARKET_API_KEY_REQUIRED");
  const explicitPackageId = ProxyCore.int(message?.package_id, null);
  const explicitOrderId = ProxyCore.int(message?.order_id, null);
  try {
    const balanceResult = await ProxyCore.fetchProxyMarketBalance(globalThis.fetch, apiKey);
    let packageCandidates = [];
    let activePackages = [];
    let packageWarning = null;
    try {
      const packages = await collectProxyPackages(apiKey);
      packageCandidates = packages.map(ProxyCore.packageSummary).filter(Boolean);
      activePackages = packageCandidates.filter((item) => item.is_active);
    } catch (error) {
      packageWarning = proxyErrorText(error);
      await log("PROXY_MARKET_PACKAGE_DISCOVERY_FAILED", { error: packageWarning, stage: error?.stage || "PACKAGES", http_status: error?.status || null, provider_message: ProxyCore.text(error?.provider_message, 180) || null, during: "sync" });
    }
    const packageId = explicitPackageId || priorRuntime.package_id || priorSecret.package_id || (activePackages.length === 1 ? activePackages[0].id : null);
    const orderId = explicitOrderId || priorRuntime.order_id || priorSecret.order_id || null;
    let collected = [];
    let globalListError = null;
    let listDiagnostic = null;
    if (packageId) {
      const compat = await collectProxyPackageCompat(apiKey, packageId, orderId);
      collected = compat.profiles;
      listDiagnostic = compat.diagnostic;
    } else if (orderId) {
      try { collected = await collectProxyPages(apiKey, { order_id: orderId, type: "all" }); } catch (error) { globalListError = proxyErrorText(error); }
    } else {
      try { collected = await collectProxyPages(apiKey, { type: "all" }); } catch (error) { globalListError = proxyErrorText(error); }
      if (!collected.length) {
        const packagesWithEndpoints = activePackages.filter((item) => item.proxies_count > 0).slice(0, 20);
        const seen = new Set();
        for (const pkg of packagesWithEndpoints) {
          const compat = await collectProxyPackageCompat(apiKey, pkg.id, null);
          for (const profile of compat.profiles) {
            if (seen.has(profile.id)) continue;
            seen.add(profile.id); collected.push({ ...profile, package_id: profile.package_id || pkg.id });
            if (collected.length >= ProxyCore.MAX_PROFILES) break;
          }
          if (collected.length >= ProxyCore.MAX_PROFILES) break;
        }
      }
    }
    const keyCheck = {
      valid: true,
      checked_at: new Date().toISOString(),
      balance: balanceResult.balance,
      package_count: packageCandidates.length,
      active_package_count: activePackages.length,
      suggested_package_id: packageId || (activePackages.length === 1 ? activePackages[0].id : null),
      package_warning: packageWarning
    };
    if (!collected.length) {
      const noEndpointPackages = activePackages.filter((item) => item.proxies_count <= 0);
      const selectedPackage = packageId ? activePackages.find((item) => Number(item.id) === Number(packageId)) || packageCandidates.find((item) => Number(item.id) === Number(packageId)) || null : null;
      const endpointExistsButListEmpty = Boolean(selectedPackage && selectedPackage.proxies_count > 0);
      const errorCode = noEndpointPackages.length && !endpointExistsButListEmpty ? "PROXY_MARKET_NO_ENDPOINTS_CREATED" : (endpointExistsButListEmpty ? "PROXY_MARKET_ENDPOINT_EXISTS_LIST_EMPTY" : (globalListError || "PROXY_MARKET_NO_RESIDENT_PROFILES"));
      await saveProxySecret({ ...priorSecret, api_key: apiKey, profiles: [], package_id: packageId, order_id: orderId });
      const next = await saveProxyRuntime({
        ...priorRuntime,
        profiles: [],
        selected_profile_id: null,
        package_id: packageId,
        order_id: orderId,
        package_candidates: packageCandidates,
        key_check: keyCheck,
        package_warning: packageWarning,
        error: errorCode,
        last_operation: "PROXY_MARKET_SYNC_EMPTY"
      });
      await log("PROXY_MARKET_SYNC_EMPTY", { error: errorCode, package_count: packageCandidates.length, active_package_count: activePackages.length, zero_endpoint_packages: noEndpointPackages.map((item) => item.id).join(","), package_id: packageId, raw_row_count: listDiagnostic?.raw_row_count || 0, row_shapes: listDiagnostic?.shapes || [] });
      return { ok: false, error: errorCode, proxy: next };
    }
    const canonicalProfiles = await savePersistedProxyProfiles(ProxyCore.dedupeProfileSet(collected));
    const hiddenIds = await getHiddenProxyProfileIds();
    const visibleProfiles = canonicalProfiles.filter((profile) => !hiddenIds.has(String(profile.id)));
    const summaries = visibleProfiles.map(ProxyCore.profileSummary).filter(Boolean);
    if (!summaries.length) {
      const next = await saveProxyRuntime({ ...priorRuntime, profiles: [], selected_profile_id: null, package_id: packageId, order_id: orderId, package_candidates: packageCandidates, key_check: keyCheck, package_warning: packageWarning, error: "PROXY_ALL_PROFILES_HIDDEN", last_operation: "PROXY_MARKET_SYNCED_ALL_HIDDEN" });
      await saveProxySecret({ ...priorSecret, api_key: apiKey, profiles: [], active_profile_id: null, package_id: packageId, order_id: orderId });
      await log("PROXY_MARKET_SYNCED_ALL_HIDDEN", { remote_profile_count: canonicalProfiles.length, hidden_profile_count: hiddenIds.size, package_id: packageId });
      return { ok: true, proxy: next };
    }
    const selected = summaries.some((profile) => String(profile.id) === String(priorRuntime.selected_profile_id || "")) ? priorRuntime.selected_profile_id : summaries[0].id;
    await saveProxySecret({
      ...priorSecret,
      api_key: apiKey,
      profiles: visibleProfiles,
      active_profile_id: priorSecret.active_profile_id && visibleProfiles.some((profile) => String(profile.id) === String(priorSecret.active_profile_id)) ? priorSecret.active_profile_id : null,
      package_id: packageId,
      order_id: orderId
    });
    const runtime = await saveProxyRuntime({
      ...priorRuntime,
      provider: ProxyCore.PROVIDER,
      profiles: summaries,
      selected_profile_id: selected,
      last_sync_at: new Date().toISOString(),
      package_id: packageId,
      order_id: orderId,
      package_candidates: packageCandidates,
      key_check: keyCheck,
      package_warning: packageWarning,
      error: null,
      last_operation: "PROXY_MARKET_SYNCED"
    });
    await log("PROXY_MARKET_SYNCED", { profile_count: summaries.length, package_id: packageId, order_id: orderId, package_count: packageCandidates.length });
    return { ok: true, proxy: { ...runtime, active_profile: runtime.mode === "proxy" ? summaries.find((profile) => String(profile.id) === String(runtime.selected_profile_id)) || null : null } };
  } catch (error) {
    const code = proxyErrorText(error);
    const next = await saveProxyRuntime({ ...priorRuntime, error: code, last_operation: "PROXY_MARKET_SYNC_FAILED" });
    await log("PROXY_MARKET_SYNC_FAILED", { error: code, stage: error?.stage || null, http_status: error?.status || null, provider_message: ProxyCore.text(error?.provider_message, 180) || null, package_id: explicitPackageId, order_id: explicitOrderId });
    return { ok: false, error: code, proxy: next };
  }
}

async function saveManualTrafficProfile(message = {}) {
  const state = await getState();
  const blocked = proxyMutationError(state);
  if (blocked) return recordProxyFailure("PROXY_MANUAL_PROFILE_SAVE", blocked);
  const priorSecret = await getProxySecret();
  const priorRuntime = await getProxyRuntime();
  try {
    const profile = ProxyCore.makeManualTrafficProfile({
      id: message?.id,
      package_id: ProxyCore.int(message?.package_id, null) || priorRuntime.package_id || priorSecret.package_id || null,
      host: message?.host,
      http_port: message?.http_port,
      socks_port: message?.socks_port,
      login: message?.login,
      password: message?.password,
      country: message?.country,
      rotation: message?.rotation
    });
    const existing = Array.isArray(priorSecret.profiles) ? priorSecret.profiles : [];
    const fullProfiles = ProxyCore.dedupeProfileSet([profile, ...existing.filter((item) => String(item.id) !== String(profile.id))]).slice(0, ProxyCore.MAX_PROFILES);
    await savePersistedProxyProfiles(fullProfiles);
    const summaries = fullProfiles.map(ProxyCore.profileSummary).filter(Boolean);
    await saveProxySecret({ ...priorSecret, profiles: fullProfiles, package_id: profile.package_id || priorSecret.package_id || null });
    const next = await saveProxyRuntime({ ...priorRuntime, profiles: summaries, selected_profile_id: profile.id, package_id: profile.package_id || priorRuntime.package_id || null, error: null, last_operation: "PROXY_MANUAL_TRAFFIC_PROFILE_SAVED" });
    await log("PROXY_MANUAL_TRAFFIC_PROFILE_SAVED", { profile_id: profile.id, host: profile.host, http_port: profile.http_port, country: profile.country, package_id: profile.package_id, has_credentials: true });
    return { ok: true, proxy: { ...next, active_profile: next.mode === "proxy" ? summaries.find((item) => String(item.id) === String(next.selected_profile_id)) || null : null } };
  } catch (error) { return recordProxyFailure("PROXY_MANUAL_PROFILE_SAVE", error); }
}

async function getProxyProfileDetails(profileId) {
  const secret = await getProxySecret();
  const profile = (secret.profiles || []).find((item) => String(item.id) === String(profileId || ""));
  if (!profile) return { ok: false, error: "PROXY_PROFILE_NOT_FOUND" };
  return { ok: true, profile: { id: profile.id, host: profile.host, http_port: profile.http_port, socks_port: profile.socks_port, country: profile.country, package_id: profile.package_id, rotation: profile.rotation_settings?.rotate ?? null, login: profile.login || "", password: profile.password || "" } };
}
async function deleteProxyProfileLocally(profileId) {
  const state = await getState();
  const blocked = proxyMutationError(state);
  if (blocked) return recordProxyFailure("PROXY_PROFILE_DELETE", blocked);
  const id = String(profileId || "");
  if (!id) return recordProxyFailure("PROXY_PROFILE_DELETE", "PROXY_PROFILE_REQUIRED");
  const runtime = await getProxyRuntime();
  const secret = await getProxySecret();
  if (runtime.mode === "proxy" && String(runtime.selected_profile_id || "") === id) await setProxyDirect();
  const hidden = await getHiddenProxyProfileIds();
  hidden.add(id);
  await saveHiddenProxyProfileIds([...hidden]);
  const visible = (secret.profiles || []).filter((profile) => String(profile.id) !== id);
  const summaries = visible.map(ProxyCore.profileSummary).filter(Boolean);
  const selected = summaries.some((profile) => String(profile.id) === String(runtime.selected_profile_id || "")) ? runtime.selected_profile_id : (summaries[0]?.id || null);
  await saveProxySecret({ ...secret, profiles: visible, active_profile_id: null });
  const next = await saveProxyRuntime({ ...(await getProxyRuntime()), profiles: summaries, selected_profile_id: selected, mode: "direct", error: null, last_operation: "PROXY_PROFILE_REMOVED_LOCAL" });
  await log("PROXY_PROFILE_REMOVED_LOCAL", { profile_id: id, remaining_profile_count: summaries.length });
  return { ok: true, proxy: { ...next, active_profile: null }, note: "REMOTE_ENDPOINT_UNCHANGED" };
}
async function restoreHiddenProxyProfiles() {
  const state = await getState();
  const blocked = proxyMutationError(state);
  if (blocked) return recordProxyFailure("PROXY_PROFILE_RESTORE", blocked);
  await saveHiddenProxyProfileIds([]);
  const profiles = await getPersistedProxyProfiles();
  const summaries = profiles.map(ProxyCore.profileSummary).filter(Boolean);
  const runtime = await getProxyRuntime();
  const secret = await getProxySecret();
  const selected = summaries.some((profile) => String(profile.id) === String(runtime.selected_profile_id || "")) ? runtime.selected_profile_id : (summaries[0]?.id || null);
  await saveProxySecret({ ...secret, profiles });
  const next = await saveProxyRuntime({ ...runtime, profiles: summaries, selected_profile_id: selected, error: null, last_operation: "PROXY_HIDDEN_PROFILES_RESTORED" });
  await log("PROXY_HIDDEN_PROFILES_RESTORED", { profile_count: summaries.length });
  return { ok: true, proxy: next };
}
function trustedExtensionUiSender(sender) {
  const url = String(sender?.url || "");
  return sender?.id === chrome.runtime.id && url.startsWith(chrome.runtime.getURL(""));
}

async function createProxyMarketEndpoint(message = {}) {
  const state = await getState();
  const blocked = proxyMutationError(state);
  if (blocked) return recordProxyFailure("PROXY_MARKET_ENDPOINT_CREATE", blocked);
  const priorSecret = await getProxySecret();
  const priorRuntime = await getProxyRuntime();
  const apiKey = ProxyCore.text(message?.api_key || priorSecret.api_key, 512);
  if (!apiKey) return recordProxyFailure("PROXY_MARKET_ENDPOINT_CREATE", "PROXY_MARKET_API_KEY_REQUIRED");
  const packageId = ProxyCore.int(message?.package_id, null) || priorRuntime.package_id || priorSecret.package_id || priorRuntime.key_check?.suggested_package_id || null;
  if (!packageId) return recordProxyFailure("PROXY_MARKET_ENDPOINT_CREATE", "PROXY_PACKAGE_ID_REQUIRED_FOR_CREATE");
  const country = ProxyCore.text(message?.country || "ru", 8).toLowerCase();
  const rotation = ProxyCore.int(message?.rotation, -1);
  try {
    const createResult = await ProxyCore.createProxyInPackage(globalThis.fetch, apiKey, { package_id: packageId, country, rotation });
    await saveProxySecret({ ...priorSecret, api_key: apiKey, package_id: packageId });
    const createShape = createResult?.payload && typeof createResult.payload === "object" ? Object.keys(createResult.payload).slice(0, 40).sort() : [];
    await log("PROXY_MARKET_ENDPOINT_CREATED_MANUAL", { package_id: packageId, country, rotation, response_keys: createShape });
    const synced = await syncProxyMarket({ api_key: apiKey, package_id: packageId, order_id: message?.order_id || priorSecret.order_id || priorRuntime.order_id || null });
    if (!synced?.ok) {
      const next = await setProxyOperation({ last_operation: "PROXY_MARKET_ENDPOINT_CREATED_SYNC_PENDING", error: synced?.error || null });
      return { ok: true, created: true, sync_ok: false, sync_error: synced?.error || null, proxy: next };
    }
    const next = await setProxyOperation({ last_operation: "PROXY_MARKET_ENDPOINT_CREATED_AND_SYNCED", error: null });
    return { ok: true, created: true, sync_ok: true, proxy: { ...synced.proxy, ...next, profiles: synced.proxy?.profiles || next.profiles } };
  } catch (error) {
    const code = proxyErrorText(error);
    const next = await saveProxyRuntime({ ...priorRuntime, error: code, last_operation: "PROXY_MARKET_ENDPOINT_CREATE_FAILED" });
    await log("PROXY_MARKET_ENDPOINT_CREATE_FAILED", { error: code, stage: error?.stage || "CREATE", http_status: error?.status || null, provider_message: ProxyCore.text(error?.provider_message, 180) || null, package_id: packageId, country, rotation });
    return { ok: false, error: code, proxy: next };
  }
}

async function refreshProxyAuthHandlerBehavior() {
  try {
    if (chrome.webRequest?.handlerBehaviorChanged) await chrome.webRequest.handlerBehaviorChanged();
  } catch (error) {
    await log("PROXY_AUTH_HANDLER_REFRESH_FAILED", { error: String(error?.message || error).slice(0, 200) });
  }
}

async function applyProxyProfileInternal(profile, operation = "PROXY_PROFILE_APPLIED_AUTO", extra = {}, options = {}) {
  if (!profile) throw new Error("PROXY_PROFILE_NOT_FOUND_IN_SESSION");
  const extraHosts = Array.isArray(options.extra_hosts) ? options.extra_hosts : [];
  const pacNonce = ProxyCore.text(options.pac_nonce || "", 120);
  const config = ProxyCore.buildAvitoOnlyPacConfig(profile, { extra_hosts: extraHosts, nonce: pacNonce });
  await proxySettingsSet(config);
  const secret = await getProxySecret();
  await saveProxySecret({ ...secret, active_profile_id: profile.id });
  proxyAuthAttempts.clear();
  await refreshProxyAuthHandlerBehavior();
  const runtime = await getProxyRuntime();
  const dataSaverActive = runtime.data_saver_enabled !== false;
  await syncProxyDataSaverRules(dataSaverActive);
  const appliedAt = new Date().toISOString();
  const next = await saveProxyRuntime({
    ...runtime,
    mode: "proxy",
    selected_profile_id: profile.id,
    proxy_applied_at: appliedAt,
    proxy_diagnostics: options.preserve_proxy_diagnostics === true ? proxyDiagBase(runtime) : proxyDiagBase(null),
    data_saver_active: dataSaverActive,
    error: null,
    last_operation: operation
  });
  const effective = await proxySettingsGet();
  await log(operation, {
    provider: profile.provider,
    profile_id: profile.id,
    country: profile.country || null,
    host: profile.host,
    http_port: profile.http_port,
    rotation: profile.rotation_settings?.rotate ?? null,
    scope: "avito_only",
    level_of_control: effective?.levelOfControl || null,
    configured_mode: effective?.value?.mode || null,
    egress_check_routed: extraHosts.includes(ProxyCore.EGRESS_CHECK_HOST) || extraHosts.includes("api64.ipify.org"),
    pac_epoch: pacNonce || null,
    ...extra
  });
  return { ok: true, proxy: { ...next, active_profile: ProxyCore.profileSummary(profile), effective_level: effective?.levelOfControl || null, configured_mode: effective?.value?.mode || null } };
}

async function refreshRecoveryProxyProfiles(runtime, secret) {
  const apiKey = ProxyCore.text(secret?.api_key, 512);
  const packageId = ProxyCore.int(runtime?.package_id || secret?.package_id, null);
  if (!apiKey || !packageId) return { runtime, secret, refreshed: false };
  try {
    const compat = await collectProxyPackageCompat(apiKey, packageId, runtime?.order_id || secret?.order_id || null);
    if (!compat.profiles.length) return { runtime, secret, refreshed: false };
    const hidden = await getHiddenProxyProfileIds();
    const profiles = ProxyCore.dedupeProfileSet(compat.profiles).filter((profile) => !hidden.has(String(profile.id)));
    if (!profiles.length) return { runtime, secret, refreshed: false };
    await savePersistedProxyProfiles(profiles);
    const nextSecret = await saveProxySecret({ ...secret, profiles, package_id: packageId });
    const summaries = profiles.map(ProxyCore.profileSummary).filter(Boolean);
    const selectedId = summaries.some((item) => String(item.id) === String(runtime.selected_profile_id || "")) ? runtime.selected_profile_id : (summaries[0]?.id || null);
    const nextRuntime = await saveProxyRuntime({ ...runtime, profiles: summaries, selected_profile_id: selectedId, package_id: packageId });
    await log("PROXY_IP_BLOCK_RECOVERY_PROFILES_REFRESHED", { package_id: packageId, profile_count: profiles.length });
    return { runtime: nextRuntime, secret: nextSecret, refreshed: true };
  } catch (error) {
    await log("PROXY_IP_BLOCK_RECOVERY_PROFILE_REFRESH_FAILED", { error: proxyErrorText(error) });
    return { runtime, secret, refreshed: false };
  }
}

async function fetchProxyEgressIp(searchId, attempt, sampleIndex, profile) {
  const host = PROXY_EGRESS_CHECK_HOSTS[(Math.max(1, Number(sampleIndex) || 1) - 1) % PROXY_EGRESS_CHECK_HOSTS.length];
  const url = ProxyCore.egressCheckUrl(`${searchId || "run"}-${attempt}-${sampleIndex}-${Date.now()}`, host);
  let response;
  try {
    response = await globalThis.fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store",
      credentials: "omit",
      redirect: "error"
    });
  } catch (error) {
    throw new Error(`PROXY_EGRESS_CHECK_FETCH_FAILED:${proxyErrorText(error)}`);
  }
  if (!response?.ok) throw new Error(`PROXY_EGRESS_CHECK_HTTP_${ProxyCore.int(response?.status, 0) || "ERROR"}`);
  let payload = null;
  let raw = "";
  try { raw = await response.text(); } catch (_) { raw = ""; }
  try { payload = raw ? JSON.parse(raw) : null; } catch (_) { payload = raw; }
  const ip = ProxyCore.parseEgressIpPayload(payload);
  if (!ip) throw new Error("PROXY_EGRESS_CHECK_INVALID_RESPONSE");
  const at = new Date().toISOString();
  await patchProxyDiagnostics({ last_egress_check_at: at, last_egress_ip: ip });
  await log("PROXY_EGRESS_SAMPLE", {
    search_id: searchId || null,
    attempt,
    sample_index: sampleIndex,
    host,
    ip,
    profile_id: profile?.id || null,
    rotation: profile?.rotation_settings?.rotate ?? null
  });
  return ip;
}

async function cutProxyTransportEpoch(profile, attempt, reason) {
  const nonce = `cut-${attempt}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await proxySettingsSet(ProxyCore.buildProxyTransportCutPacConfig({ extra_hosts: PROXY_EGRESS_CHECK_HOSTS, nonce }));
  proxyAuthAttempts.clear();
  await refreshProxyAuthHandlerBehavior();
  await log("PROXY_TRANSPORT_EPOCH_CUT", {
    attempt,
    reason: reason || "ip_block",
    profile_id: profile?.id || null,
    block_proxy: "127.0.0.1:9",
    pac_epoch: nonce
  });
  await wait(PROXY_TRANSPORT_CUT_SETTLE_MS);
}

async function installProxyDiagnosticEpoch(profile, attempt, operation, extra = {}) {
  const nonce = `diag-${attempt}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await applyProxyProfileInternal(profile, operation, { ...extra, ip_block_recovery_attempt: attempt }, {
    extra_hosts: PROXY_EGRESS_CHECK_HOSTS,
    pac_nonce: nonce,
    preserve_proxy_diagnostics: true
  });
  await wait(PROXY_POST_APPLY_SETTLE_MS);
  return nonce;
}

async function finalizeVerifiedProxyEpoch(profile, attempt, operation, extra = {}) {
  const nonce = `active-${attempt}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await applyProxyProfileInternal(profile, operation, { ...extra, ip_block_recovery_attempt: attempt }, {
    extra_hosts: [],
    pac_nonce: nonce,
    preserve_proxy_diagnostics: true
  });
  await wait(PROXY_POST_APPLY_SETTLE_MS);
  return nonce;
}

async function verifyEveryRequestEgress(profile, attempt, searchId, strategy = "verified_every_request_transport_reset") {
  await cutProxyTransportEpoch(profile, attempt, "every_request_reset");
  await installProxyDiagnosticEpoch(profile, attempt, "PROXY_PROFILE_EGRESS_DIAGNOSTIC_APPLIED", { verification_strategy: strategy });
  const samples = [];
  for (let i = 1; i <= PROXY_EGRESS_CHECK_MAX_SAMPLES; i += 1) {
    samples.push(await fetchProxyEgressIp(searchId, attempt, i, profile));
    if (new Set(samples).size >= 2) break;
  }
  const distinct = Array.from(new Set(samples));
  if (distinct.length < 2) {
    await log("PROXY_EGRESS_ROTATION_NOT_VERIFIED", {
      search_id: searchId || null,
      attempt,
      strategy,
      profile_id: profile.id,
      rotation: profile.rotation_settings?.rotate ?? null,
      samples
    });
    return { ok: false, strategy, profile_id: profile.id, samples, error: "PROXY_EGRESS_DID_NOT_CHANGE" };
  }
  await finalizeVerifiedProxyEpoch(profile, attempt, "PROXY_PROFILE_EGRESS_VERIFIED", {
    verification_strategy: strategy,
    egress_before: samples[0],
    egress_after: distinct.find((ip) => ip !== samples[0]) || distinct[1]
  });
  const after = distinct.find((ip) => ip !== samples[0]) || distinct[1];
  await log("PROXY_EGRESS_ROTATION_VERIFIED", {
    search_id: searchId || null,
    attempt,
    strategy,
    profile_id: profile.id,
    rotation: profile.rotation_settings?.rotate ?? null,
    egress_before: samples[0],
    egress_after: after,
    samples
  });
  return { ok: true, strategy, profile_id: profile.id, egress_before: samples[0], egress_after: after, samples };
}

async function verifyProviderForcedEgressChange(profile, attempt, searchId, changeLink) {
  await cutProxyTransportEpoch(profile, attempt, "provider_forced_change_before");
  await installProxyDiagnosticEpoch(profile, attempt, "PROXY_PROFILE_EGRESS_BEFORE_FORCE_APPLIED", { verification_strategy: "provider_change_ip_link_verified" });
  const before = await fetchProxyEgressIp(searchId, attempt, 1, profile);
  const changed = await ProxyCore.forceChangeIpByLink(globalThis.fetch, changeLink);
  await log("PROXY_PROVIDER_CHANGE_IP_ACKNOWLEDGED", { search_id: searchId || null, attempt, profile_id: profile.id, provider_status: changed.status });
  await cutProxyTransportEpoch(profile, attempt, "provider_forced_change_after");
  await installProxyDiagnosticEpoch(profile, attempt, "PROXY_PROFILE_EGRESS_AFTER_FORCE_APPLIED", { verification_strategy: "provider_change_ip_link_verified", provider_change_status: changed.status });
  const after = await fetchProxyEgressIp(searchId, attempt, 2, profile);
  if (before === after) {
    await log("PROXY_EGRESS_ROTATION_NOT_VERIFIED", { search_id: searchId || null, attempt, strategy: "provider_change_ip_link_verified", profile_id: profile.id, egress_before: before, egress_after: after });
    return { ok: false, strategy: "provider_change_ip_link_verified", profile_id: profile.id, egress_before: before, egress_after: after, error: "PROXY_EGRESS_DID_NOT_CHANGE" };
  }
  await finalizeVerifiedProxyEpoch(profile, attempt, "PROXY_PROFILE_EGRESS_VERIFIED", { verification_strategy: "provider_change_ip_link_verified", provider_change_status: changed.status, egress_before: before, egress_after: after });
  await log("PROXY_EGRESS_ROTATION_VERIFIED", { search_id: searchId || null, attempt, strategy: "provider_change_ip_link_verified", profile_id: profile.id, egress_before: before, egress_after: after });
  return { ok: true, strategy: "provider_change_ip_link_verified", profile_id: profile.id, egress_before: before, egress_after: after, provider_status: changed.status, samples: [before, after] };
}

async function createRecoveryEveryRequestProfile(runtime, secret, active, attempt, searchId) {
  const apiKey = ProxyCore.text(secret?.api_key, 512);
  const packageId = ProxyCore.int(runtime?.package_id || secret?.package_id || active?.package_id, null);
  if (!apiKey || !packageId) return { ok: false, error: "PROXY_RECOVERY_ENDPOINT_CREATE_CREDENTIALS_MISSING" };
  const beforeIds = new Set((secret.profiles || []).map((profile) => String(profile.id)));
  const country = ProxyCore.text(active?.country || "ru", 8).toLowerCase() || "ru";
  const created = await ProxyCore.createProxyInPackage(globalThis.fetch, apiKey, { package_id: packageId, country, rotation: 0 });
  await log("PROXY_RECOVERY_ENDPOINT_CREATE_REQUESTED", {
    search_id: searchId || null,
    attempt,
    package_id: packageId,
    country,
    rotation: 0,
    response_keys: created?.payload && typeof created.payload === "object" ? Object.keys(created.payload).slice(0, 30).sort() : []
  });
  let profiles = [];
  for (let pass = 1; pass <= 4; pass += 1) {
    if (pass > 1) await wait(350);
    const compat = await collectProxyPackageCompat(apiKey, packageId, runtime?.order_id || secret?.order_id || null);
    profiles = ProxyCore.dedupeProfileSet(compat.profiles);
    const candidate = profiles.find((profile) => !beforeIds.has(String(profile.id)) && Number(profile.rotation_settings?.rotate) === 0 && (!country || !profile.country || profile.country === country));
    if (candidate) {
      const hidden = await getHiddenProxyProfileIds();
      const visible = profiles.filter((profile) => !hidden.has(String(profile.id)));
      await savePersistedProxyProfiles(visible);
      const summaries = visible.map(ProxyCore.profileSummary).filter(Boolean);
      await saveProxySecret({ ...secret, profiles: visible, package_id: packageId });
      await saveProxyRuntime({ ...runtime, profiles: summaries, selected_profile_id: candidate.id, package_id: packageId, auto_created_recovery_profile_id: candidate.id, auto_created_recovery_at: new Date().toISOString(), error: null, last_operation: "PROXY_RECOVERY_ENDPOINT_CREATED" });
      await log("PROXY_RECOVERY_ENDPOINT_CREATED", { search_id: searchId || null, attempt, profile_id: candidate.id, package_id: packageId, rotation: 0, country: candidate.country || country });
      return { ok: true, profile: candidate };
    }
  }
  return { ok: false, error: "PROXY_RECOVERY_ENDPOINT_NOT_VISIBLE_AFTER_CREATE" };
}

async function forceProxyExitRotation(attempt = 1, searchId = null) {
  let runtime = await getProxyRuntime();
  let secret = await getProxySecret();
  if (runtime.mode !== "proxy") return { ok: false, strategy: "proxy_not_active", error: "PROXY_NOT_ACTIVE" };

  const refreshed = await refreshRecoveryProxyProfiles(runtime, secret);
  runtime = refreshed.runtime;
  secret = refreshed.secret;

  const activeId = String(runtime.selected_profile_id || secret.active_profile_id || "");
  let active = (secret.profiles || []).find((profile) => String(profile.id) === activeId) || null;
  if (!active) return { ok: false, strategy: "profile_missing", error: "PROXY_PROFILE_NOT_FOUND_IN_SESSION" };

  const rotation = Number(active.rotation_settings?.rotate);
  await log("PROXY_IP_BLOCK_RECOVERY_PROFILE_SELECTED", {
    search_id: searchId || null,
    attempt,
    profile_id: active.id,
    rotation: Number.isFinite(rotation) ? rotation : null,
    rotation_mode: ProxyCore.rotationMode(rotation).code,
    keep_selected_profile: true
  });

  if (rotation === 0) {
    let verified = await verifyEveryRequestEgress(active, attempt, searchId, "verified_every_request_transport_reset");
    if (verified.ok) return verified;

    const everyRequestChangeLink = active.rotation_settings?.rotate_can_change === true ? active.rotation_settings?.change_ip_link : "";
    if (everyRequestChangeLink) {
      try {
        const forced = await verifyProviderForcedEgressChange(active, attempt, searchId, everyRequestChangeLink);
        if (forced.ok) return { ...forced, strategy: "verified_every_request_provider_force" };
      } catch (error) {
        await log("PROXY_IP_BLOCK_CHANGE_LINK_FAILED", { search_id: searchId || null, profile_id: active.id, attempt, rotation: 0, error: proxyErrorText(error) });
      }
    }

    const runtimeAfterProbe = await getProxyRuntime();
    const secretAfterProbe = await getProxySecret();
    const alreadyCreatedThisRun = runtimeAfterProbe?.auto_created_recovery_profile_id || null;
    if (!alreadyCreatedThisRun) {
      try {
        const created = await createRecoveryEveryRequestProfile(runtimeAfterProbe, secretAfterProbe, active, attempt, searchId);
        if (created.ok && created.profile) {
          verified = await verifyEveryRequestEgress(created.profile, attempt, searchId, "verified_new_every_request_endpoint");
          if (verified.ok) return { ...verified, auto_created_profile_id: created.profile.id };
        }
      } catch (error) {
        await log("PROXY_RECOVERY_ENDPOINT_CREATE_FAILED", { search_id: searchId || null, attempt, error: proxyErrorText(error) });
      }
    }
    return { ...verified, ok: false, error: verified.error || "PROXY_EGRESS_ROTATION_UNVERIFIED" };
  }

  const changeLink = active.rotation_settings?.rotate_can_change === true ? active.rotation_settings?.change_ip_link : "";
  if (!changeLink) {
    await log("PROXY_IP_BLOCK_RECOVERY_UNAVAILABLE_FOR_PROFILE", { search_id: searchId || null, attempt, profile_id: active.id, rotation: Number.isFinite(rotation) ? rotation : null, reason: "CHANGE_IP_LINK_UNAVAILABLE" });
    return { ok: false, strategy: "selected_profile_rotation_unavailable", profile_id: active.id, error: "PROXY_CHANGE_IP_LINK_UNAVAILABLE" };
  }
  try {
    return await verifyProviderForcedEgressChange(active, attempt, searchId, changeLink);
  } catch (error) {
    await log("PROXY_IP_BLOCK_CHANGE_LINK_FAILED", { search_id: searchId || null, profile_id: active.id, attempt, error: proxyErrorText(error) });
    return { ok: false, strategy: "provider_change_ip_link_verified", profile_id: active.id, error: proxyErrorText(error) };
  }
}

async function applyProxyProfile(profileId) {
  const state = await getState();
  const blocked = proxyMutationError(state);
  if (blocked) return recordProxyFailure("PROXY_APPLY", blocked);
  const secret = await getProxySecret();
  const profile = (secret.profiles || []).find((item) => String(item.id) === String(profileId || ""));
  if (!profile) return recordProxyFailure("PROXY_APPLY", "PROXY_PROFILE_NOT_FOUND_IN_SESSION");
  try {
    return await applyProxyProfileInternal(profile, "PROXY_PROFILE_APPLIED_MANUAL");
  } catch (error) {
    return recordProxyFailure("PROXY_APPLY", error, { profile_id: profile.id });
  }
}
async function setProxyDirect() {
  const state = await getState();
  const blocked = proxyMutationError(state);
  if (blocked) return recordProxyFailure("PROXY_DIRECT", blocked);
  try {
    await proxySettingsSet(ProxyCore.directConfig());
    await syncProxyDataSaverRules(false);
    const secret = await getProxySecret();
    await saveProxySecret({ ...secret, active_profile_id: null });
    proxyAuthAttempts.clear();
    await refreshProxyAuthHandlerBehavior();
    const runtime = await getProxyRuntime();
    const next = await saveProxyRuntime({ ...runtime, mode: "direct", proxy_applied_at: null, proxy_diagnostics: proxyDiagBase(null), data_saver_active: false, error: null, last_operation: "PROXY_DIRECT_APPLIED_MANUAL" });
    const effective = await proxySettingsGet();
    await log("PROXY_DIRECT_APPLIED_MANUAL", { scope: "regular", level_of_control: effective?.levelOfControl || null, configured_mode: effective?.value?.mode || null });
    return { ok: true, proxy: { ...next, active_profile: null, effective_level: effective?.levelOfControl || null, configured_mode: effective?.value?.mode || null } };
  } catch (error) { return recordProxyFailure("PROXY_DIRECT", error); }
}

async function activate(tab, role) {
  const updated = await tabsUpdate(tab.id, { active: true });
  if (!updated?.active) { await log("BLOCKED_TAB_ACTIVATION", { role, tab: shortTab(updated || tab) }); throw new Error(`BLOCKED_TAB_ACTIVATION:${role}`); }
  await log("TAB_ACTIVATED", { role, tab: shortTab(updated) });
  return updated;
}

async function activeChatTab() {
  const tabs = await tabsQuery({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !Core.isChatGPTUrl(tab.url || "")) throw new Error("Открой нужный ChatGPT-чат в активной вкладке.");
  return tab;
}
async function withEnsureLock(tabId, fn) {
  const prior = ensureLocks.get(tabId) || Promise.resolve(); let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = prior.catch(() => {}).then(() => gate); ensureLocks.set(tabId, tail);
  await prior.catch(() => {});
  try { return await fn(); } finally { release(); if (ensureLocks.get(tabId) === tail) ensureLocks.delete(tabId); }
}
async function withAvitoCompletionLock(searchId, fn) {
  const key = String(searchId || "");
  if (!key) return fn();
  const prior = avitoCompletionLocks.get(key) || Promise.resolve(); let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = prior.catch(() => {}).then(() => gate); avitoCompletionLocks.set(key, tail);
  await prior.catch(() => {});
  try { return await fn(); } finally { release(); if (avitoCompletionLocks.get(key) === tail) avitoCompletionLocks.delete(key); }
}
function validCaptureProtocolPing(ping) {
  return Boolean(ping?.ok && ping.content_script_protocol === CAPTURE_PROTOCOL && String(ping.content_script_version || "") === CAPTURE_VERSION && ping.identity && typeof ping.identity.origin === "string" && typeof ping.identity.chat_path === "string");
}
function validCapturePing(ping) {
  return Boolean(validCaptureProtocolPing(ping) && Core.isConversationIdentity(ping.identity));
}
async function pingCapture(tabId) { return tabsSend(tabId, { type: "AF_CAPTURE_PING" }); }
async function injectChatAdapter(tabId) {
  const target = await getTab(tabId);
  if (!target || !Core.isChatGPTUrl(target.url)) throw new Error("CONTENT_TARGET_URL_REJECTED:chatgpt");
  await execute({ target: { tabId }, files: ["core.js", "chatgpt_content.js"], injectImmediately: true });
  await log("CONTENT_SCRIPT_INJECTED", { role: "chatgpt", tab: shortTab(target), files: ["core.js", "chatgpt_content.js"] });
}
async function ensureChatAdapter(tabId) {
  return withEnsureLock(tabId, async () => {
    try { const ping = await pingCapture(tabId); if (validCapturePing(ping)) return ping; } catch (error) {
      if (!noReceiver(error)) throw error;
      await log("CONTENT_RECEIVER_MISSING", { role: "chatgpt", tab_id: tabId, message_type: "AF_CAPTURE_PING" });
    }
    await injectChatAdapter(tabId);
    const fresh = await pingCapture(tabId);
    if (!validCapturePing(fresh)) throw new Error("CONTENT_ADAPTER_HANDSHAKE_FAILED");
    await log("CONTENT_ADAPTER_READY", { role: "chatgpt", tab_id: tabId, content_script_version: fresh.content_script_version, content_script_protocol: fresh.content_script_protocol, conversation_id: fresh.identity.conversation_id });
    return fresh;
  });
}
async function ensureChatAdapterForContextCheck(tabId) {
  return withEnsureLock(tabId, async () => {
    try {
      const ping = await pingCapture(tabId);
      if (validCaptureProtocolPing(ping)) return ping;
    } catch (error) {
      if (!noReceiver(error)) throw error;
      await log("CONTENT_RECEIVER_MISSING", { role: "chatgpt", tab_id: tabId, message_type: "AF_CAPTURE_PING", context_check: true });
    }
    await injectChatAdapter(tabId);
    const fresh = await pingCapture(tabId);
    if (!validCaptureProtocolPing(fresh)) throw new Error("CONTENT_ADAPTER_CONTEXT_HANDSHAKE_FAILED");
    return fresh;
  });
}
async function sendChat(tabId, message) { await ensureChatAdapter(tabId); return tabsSend(tabId, message); }
async function captureActiveChatContext() {
  const tab = await activeChatTab(); const ping = await ensureChatAdapter(tab.id);
  const urlIdentity = Core.conversationIdentityFromUrl(tab.url);
  if (!Core.isConversationIdentity(urlIdentity) || !Core.sameConversationIdentity(urlIdentity, ping.identity)) throw new Error("ACTIVE_CHAT_CONVERSATION_IDENTITY_MISMATCH");
  const context = contextForTab(tab, ping.identity);
  await log("ACTIVE_CHAT_CONTEXT_CAPTURED", { tab_id: context.tab_id, window_id: context.window_id, conversation_id: context.conversation_id, chat_path: context.chat_path });
  return { tab, context };
}
async function blockConversationContext(state, reason, details = {}) {
  const next = await saveState({ ...state, status: "BLOCKED_CONVERSATION_CONTEXT_CHANGED", phase: "CHATGPT_CONTEXT_GUARD", blocked_reason: reason });
  await log("BLOCKED_CONVERSATION_CONTEXT_CHANGED", { search_id: next.search_id, reason, expected_tab_id: state.chatgpt_tab_id, expected_window_id: state.chatgpt_window_id, expected_conversation_id: state.conversation_id, ...details });
  return next;
}
async function pauseConversationContext(state, reason, details = {}) {
  const resumeStatus = state.status === "PAUSED_CHAT_CONTEXT_CHANGED"
    ? (state.chat_context_resume_status || "WAITING_FOR_NEXT_ASSISTANT_FORM")
    : state.status;
  const next = await saveState({
    ...state,
    status: "PAUSED_CHAT_CONTEXT_CHANGED",
    phase: "CHATGPT_CONTEXT_RECOVERY",
    blocked_reason: "RETURN_TO_PINNED_CHAT_TO_RESUME",
    chat_context_resume_status: resumeStatus,
    chat_context_paused_at: state.chat_context_paused_at || new Date().toISOString(),
    chat_context_actual_path: details.actual_chat_path || null
  });
  await log("CHATGPT_CONTEXT_PAUSED_RECOVERABLE", {
    search_id: next.search_id,
    reason,
    resume_status: resumeStatus,
    expected_tab_id: state.chatgpt_tab_id,
    expected_window_id: state.chatgpt_window_id,
    expected_conversation_id: state.conversation_id,
    ...details
  });
  return next;
}
async function assertPinnedChatContext(state, operation, options = {}) {
  const expected = contextFromState(state); const tab = await getTab(expected.tab_id);
  if (!tab || !Core.isChatGPTUrl(tab.url) || tab.windowId !== expected.window_id) {
    const next = await blockConversationContext(state, "PINNED_CHAT_TAB_MISSING_OR_CHANGED", { operation, actual_tab: shortTab(tab) }); const error = new Error(next.blocked_reason); error.state = next; throw error;
  }
  const selected = options.activateTab ? await activate(tab, operation) : tab;
  const ping = await ensureChatAdapterForContextCheck(selected.id); const actual = contextForTab(selected, ping.identity);
  if (!Core.samePinnedChatContext(expected, actual)) {
    const recoverable = selected.id === expected.tab_id && selected.windowId === expected.window_id && actual.origin === expected.origin;
    const next = recoverable
      ? await pauseConversationContext(state, "PINNED_CHAT_CONVERSATION_MISMATCH", { operation, actual_tab: shortTab(selected), actual_conversation_id: actual.conversation_id, actual_chat_path: actual.chat_path })
      : await blockConversationContext(state, "PINNED_CHAT_CONVERSATION_MISMATCH", { operation, actual_tab: shortTab(selected), actual_conversation_id: actual.conversation_id, actual_chat_path: actual.chat_path });
    const error = new Error(next.blocked_reason); error.state = next; error.recoverable = recoverable; throw error;
  }
  await log("PINNED_CHAT_CONTEXT_CONFIRMED", { search_id: state.search_id, operation, tab_id: selected.id, conversation_id: actual.conversation_id });
  return { tab: selected, context: actual };
}

function isAvitoPageReady(tab, windowId) { return Boolean(tab && tab.windowId === windowId && Core.isAvitoUrl(tab.url || "") && tab.status === "complete"); }
function normalizedVisibleAvitoUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!Core.isAvitoUrl(url.href)) return "";
    if (url.hostname.toLowerCase() === "avito.ru") url.hostname = "www.avito.ru";
    url.hash = "";
    // Avito rewrites this opaque navigation-context token frequently. It does
    // not change the visible search intent and must not trigger a hard reload.
    url.searchParams.delete("context");
    url.searchParams.sort();
    return url.href;
  } catch (_) { return ""; }
}
function sameVisibleAvitoRoute(left, right) {
  const a = normalizedVisibleAvitoUrl(left);
  const b = normalizedVisibleAvitoUrl(right);
  return Boolean(a && b && a === b);
}
function avitoNavigationCommitObserved(tab, state, probeHref = "") {
  if (!tab || tab.windowId !== state?.current_window_id) return false;
  const actual = String(probeHref || tab.url || "");
  if (!Core.isAvitoUrl(actual)) return false;
  if (state?.avito_navigation_expected !== true) return true;
  const from = String(state?.avito_navigation_from_url || "");
  const requested = String(state?.avito_requested_url || "");
  if (!from || sameVisibleAvitoRoute(from, requested)) return true;
  // Do not accept a probe from the old document while chrome.tabs.update()
  // still has the requested navigation only in pendingUrl.
  return !sameVisibleAvitoRoute(actual, from);
}
function avitoReadyProbeAccepted(response, tab, windowId, state = null) {
  const data = response?.data || response?.probe || response || {};
  const readyState = String(data.ready_state || data.readyState || "").toLowerCase();
  const href = String(data.href || data.url || "");
  if (!response?.ok || !["interactive", "complete"].includes(readyState) || data.body_present === false) return false;
  if (!tab || tab.windowId !== windowId || !Core.isAvitoUrl(href)) return false;
  if (state && !avitoNavigationCommitObserved(tab, state, href)) return false;
  if (state?.avito_reload_expected === true) {
    const previousTimeOrigin = Number(state.avito_reload_previous_time_origin);
    const currentTimeOrigin = Number(data.time_origin);
    if (Number.isFinite(previousTimeOrigin) && (!Number.isFinite(currentTimeOrigin) || currentTimeOrigin === previousTimeOrigin)) return false;
  }
  return true;
}
function fixedAvitoReadyDomProbe() {
  return {
    href: location.href,
    ready_state: String(document.readyState || ""),
    body_present: Boolean(document.body),
    title_present: Boolean(document.title),
    time_origin: Number(globalThis.performance?.timeOrigin || 0),
    captured_at: new Date().toISOString()
  };
}
async function probeAvitoPageReadiness(tab, windowId, state = null) {
  if (!tab) return { ready: false, source: "tab_missing", tab: shortTab(tab), probe: null };
  if (tab.windowId !== windowId) return { ready: false, source: "wrong_window", tab: shortTab(tab), probe: null };
  if (!Core.isAvitoUrl(tab.url || "") && !Core.isAvitoUrl(tab.pendingUrl || "")) {
    return { ready: false, source: "non_avito_url", tab: shortTab(tab), probe: null };
  }
  if (state?.avito_reload_expected === true && (String(tab.status || "") !== "complete" || Boolean(tab.pendingUrl))) {
    return { ready: false, source: "reload_in_progress", tab: shortTab(tab), probe: null };
  }
  if (isAvitoPageReady(tab, windowId) && state?.avito_reload_expected !== true && (!state || avitoNavigationCommitObserved(tab, state, tab.url || ""))) {
    return { ready: true, source: "tab_complete", tab: shortTab(tab), probe: { ready_state: "complete", href: tab.url || "" } };
  }
  if (!Core.isAvitoUrl(tab.url || "")) return { ready: false, source: "navigation_not_committed", tab: shortTab(tab), probe: null };
  try {
    const results = await execute({ target: { tabId: tab.id }, func: fixedAvitoReadyDomProbe });
    const data = Array.isArray(results) ? results[0]?.result || null : null;
    const response = { ok: Boolean(data), data };
    if (avitoReadyProbeAccepted(response, tab, windowId, state)) {
      return { ready: true, source: "dom_probe", tab: shortTab(tab), probe: data };
    }
    return { ready: false, source: "dom_probe_not_ready", tab: shortTab(tab), probe: data };
  } catch (error) {
    return { ready: false, source: "dom_probe_failed", tab: shortTab(tab), probe: null, error: String(error?.message || error).slice(0, 220) };
  }
}
function debuggerAttach(target) { return cb((done) => chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION, done)); }
function debuggerDetach(target) { return cb((done) => chrome.debugger.detach(target, done)); }
function debuggerSend(target, method, params) {
  if (!DEBUGGER_ALLOWED_METHODS.has(method)) throw new Error(`DEBUGGER_METHOD_NOT_ALLOWED:${method}`);
  return cb((done) => chrome.debugger.sendCommand(target, method, params, done));
}
function debuggerErrorCode(error) {
  return String(error?.message || error || "DEBUGGER_UNKNOWN_ERROR").replace(/[^A-Z0-9_:.-]/giu, "_").slice(0, 180) || "DEBUGGER_UNKNOWN_ERROR";
}
function finiteNumber(value) { return Number.isFinite(Number(value)); }
function validDebuggerBounds(bounds) {
  return Boolean(bounds && finiteNumber(bounds.left) && finiteNumber(bounds.top) && finiteNumber(bounds.width) && finiteNumber(bounds.height)
    && Number(bounds.width) >= 4 && Number(bounds.height) >= 4 && Number(bounds.width) <= 10000 && Number(bounds.height) <= 10000);
}
function validDebuggerText(value) { return typeof value === "string" && Array.from(value).length <= DEBUGGER_MAX_TYPED_GRAPHEMES; }
async function verifyDebuggerTypeCaller(message, sender) {
  const state = await getState();
  const tab = sender?.tab;
  const request = message?.request || {};
  if (!state.search_id || state.command_mode !== "AVITO_UI" || state.status !== "AVITO_TAB_ACTIVE") throw new Error("DEBUGGER_STATE_NOT_ACTIVE_UI_PLAN");
  if (!tab?.id || tab.id !== state.avito_tab_id || tab.windowId !== state.current_window_id) throw new Error("DEBUGGER_SENDER_TAB_MISMATCH");
  const current = await getTab(tab.id);
  if (!current || !current.active) throw new Error("DEBUGGER_AVITO_TAB_NOT_ACTIVE_OR_READY");
  const readiness = await probeAvitoPageReadiness(current, state.current_window_id, state);
  if (!readiness.ready) throw new Error(`DEBUGGER_AVITO_TAB_NOT_ACTIVE_OR_READY:${readiness.source}`);
  if (!Core.isAvitoUrl(request.page_url || "") || new URL(request.page_url).origin !== new URL(current.url).origin) throw new Error("DEBUGGER_PAGE_URL_MISMATCH");
  if (!/^afdt-[a-z0-9-]{12,}$/iu.test(String(request.token || ""))) throw new Error("DEBUGGER_TOKEN_INVALID");
  if (!validDebuggerBounds(request.bounds)) throw new Error("DEBUGGER_BOUNDS_INVALID");
  if (!validDebuggerText(request.value)) throw new Error("DEBUGGER_TEXT_INVALID");
  const target = request.target || {};
  if (!["input", "textarea", "div", "span"].includes(String(target.tag || "").toLowerCase())) throw new Error("DEBUGGER_TARGET_TAG_INVALID");
  return { state, tab: current, request };
}
function validDebuggerClickText(value) { return typeof value === "string" && Array.from(value).length <= 220; }
// Compatibility alias: option text remains subject to the same bounded public-text rule.
const validDebuggerOptionText = validDebuggerClickText;
async function verifyDebuggerClickCaller(message, sender) {
  const state = await getState();
  const tab = sender?.tab;
  const request = message?.request || {};
  if (!state.search_id || state.command_mode !== "AVITO_UI" || state.status !== "AVITO_TAB_ACTIVE") throw new Error("DEBUGGER_STATE_NOT_ACTIVE_UI_PLAN");
  if (!tab?.id || tab.id !== state.avito_tab_id || tab.windowId !== state.current_window_id) throw new Error("DEBUGGER_SENDER_TAB_MISMATCH");
  const current = await getTab(tab.id);
  if (!current || !current.active) throw new Error("DEBUGGER_AVITO_TAB_NOT_ACTIVE_OR_READY");
  const readiness = await probeAvitoPageReadiness(current, state.current_window_id, state);
  if (!readiness.ready) throw new Error(`DEBUGGER_AVITO_TAB_NOT_ACTIVE_OR_READY:${readiness.source}`);
  if (!Core.isAvitoUrl(request.page_url || "") || new URL(request.page_url).origin !== new URL(current.url).origin) throw new Error("DEBUGGER_PAGE_URL_MISMATCH");
  if (!['CLICK', 'SELECT_OPTION'].includes(String(request.intent || '').toUpperCase())) throw new Error("DEBUGGER_CLICK_INTENT_REJECTED");
  if (!/^afdc-[a-z0-9-]{12,}$/iu.test(String(request.token || ""))) throw new Error("DEBUGGER_TOKEN_INVALID");
  if (!validDebuggerBounds(request.bounds)) throw new Error("DEBUGGER_BOUNDS_INVALID");
  if (!validDebuggerClickText(request.target_text) || !validDebuggerClickText(request.option_text)) throw new Error("DEBUGGER_CLICK_TEXT_INVALID");
  if (String(request.intent || '').toUpperCase() === 'SELECT_OPTION' && !String(request.option_text || '')) throw new Error("DEBUGGER_OPTION_TEXT_REQUIRED");
  const target = request.target || {};
  const targetTag = String(target.tag || '').toLowerCase();
  const genericMarkedSvgClick = targetTag === 'svg'
    && String(request.intent || '').toUpperCase() === 'CLICK'
    && /^[a-z0-9][a-z0-9_./:-]{0,159}$/iu.test(String(target.marker || ''));
  if (!['button', 'a', 'div', 'span', 'li', 'label'].includes(targetTag) && !genericMarkedSvgClick) throw new Error("DEBUGGER_TARGET_TAG_INVALID");
  return { state, tab: current, request };
}
async function inputMouseFocus(target, bounds, onStage = null) {
  const x = Number(bounds.left) + Number(bounds.width) / 2;
  const y = Number(bounds.top) + Number(bounds.height) / 2;
  // Explicit pointer lifecycle fields make this a trusted mouse click for pages
  // that reject incomplete press/release packets. No Runtime or Page commands are used.
  await debuggerSend(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0, pointerType: "mouse" });
  if (typeof onStage === "function") onStage("mouse_pressed");
  await debuggerSend(target, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse" });
  if (typeof onStage === "function") onStage("mouse_released");
  await debuggerSend(target, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse" });
}
async function inputKey(target, type, params) { await debuggerSend(target, "Input.dispatchKeyEvent", { type, ...params }); }
async function inputClearExistingValue(target) {
  await inputKey(target, "keyDown", { key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
  await inputKey(target, "keyUp", { key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
  await inputKey(target, "keyDown", { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await inputKey(target, "keyUp", { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
}
async function clickVisibleTargetWithDebugger(message, sender) {
  let verified;
  try { verified = await verifyDebuggerClickCaller(message, sender); }
  catch (error) { return { ok: false, error: `CDP_VISIBLE_CLICK_REQUEST_BLOCKED:${debuggerErrorCode(error)}` }; }
  const { state, tab, request } = verified;
  const target = { tabId: tab.id };
  const intent = String(request.intent || 'CLICK').toUpperCase();
  let attached = false;
  let detachError = null;
  let stage = "attach";
  try {
    await debuggerAttach(target);
    attached = true;
    await log("CDP_VISIBLE_CLICK_ATTACHED", { search_id: state.search_id, tab_id: tab.id, protocol: DEBUGGER_PROTOCOL_VERSION, allowed_methods: Array.from(DEBUGGER_ALLOWED_METHODS), intent, target_text_length: Array.from(String(request.target_text || "")).length });
    stage = "target_confirmation";
    const confirm = await tabsSend(tab.id, { type: "AF_CONFIRM_DEBUGGER_CLICK_TARGET_VISIBLE", token: request.token });
    const confirmation = confirm?.data || {};
    if (!confirm?.ok || !confirmation.ok) throw new Error(`CDP_VISIBLE_CLICK_TARGET_CONFIRMATION_UNAVAILABLE:${String(confirmation.reason || "NO_RESPONSE")}`);
    if (!confirmation.intact) throw new Error("CDP_VISIBLE_CLICK_TARGET_DETACHED");
    if (!confirmation.pointer_reachable) throw new Error("CDP_VISIBLE_CLICK_TARGET_NOT_POINTER_REACHABLE");
    await inputMouseFocus(target, request.bounds, (nextStage) => { stage = nextStage; });
    stage = "completed";
    await log("CDP_VISIBLE_CLICK_COMPLETED", { search_id: state.search_id, tab_id: tab.id, intent, target_marker: String(request.target?.marker || "").slice(0, 160), target_role: String(request.target?.role || "").slice(0, 80), target_text_length: Array.from(String(request.target_text || "")).length });
    return { ok: true, data: { ok: true, strategy: intent === 'SELECT_OPTION' ? "chrome_debugger_input_mouse_click_visible_option" : "chrome_debugger_input_mouse_click_visible_target", cdp_methods: Array.from(DEBUGGER_ALLOWED_METHODS) } };
  } catch (error) {
    const reason = `${stage}:${debuggerErrorCode(error)}`;
    await log("CDP_VISIBLE_CLICK_FAILED", { search_id: state.search_id, tab_id: tab.id, stage, reason, intent, target_text_length: Array.from(String(request.target_text || "")).length });
    return { ok: false, error: `CDP_VISIBLE_CLICK_FAILED:${reason}` };
  } finally {
    if (attached) {
      try { await debuggerDetach(target); await log("CDP_VISIBLE_CLICK_DETACHED", { search_id: state.search_id, tab_id: tab.id, intent }); }
      catch (error) { detachError = debuggerErrorCode(error); await log("CDP_VISIBLE_CLICK_DETACH_FAILED", { search_id: state.search_id, tab_id: tab.id, reason: detachError, intent }); }
    }
    if (detachError) return { ok: false, error: `CDP_VISIBLE_CLICK_DETACH_FAILED:${detachError}` };
  }
}
async function clickVisibleOptionWithDebugger(message, sender) { return clickVisibleTargetWithDebugger(message, sender); }
async function typeVisibleAvitoTargetWithDebugger(message, sender) {
  let verified;
  try { verified = await verifyDebuggerTypeCaller(message, sender); }
  catch (error) { return { ok: false, error: `CDP_INPUT_REQUEST_BLOCKED:${debuggerErrorCode(error)}` }; }
  const { state, tab, request } = verified;
  const target = { tabId: tab.id };
  let attached = false;
  let detachError = null;
  const value = String(request.value || "");
  try {
    await debuggerAttach(target);
    attached = true;
    await log("CDP_INPUT_ATTACHED", { search_id: state.search_id, tab_id: tab.id, protocol: DEBUGGER_PROTOCOL_VERSION, allowed_methods: Array.from(DEBUGGER_ALLOWED_METHODS), text_length: Array.from(value).length });
    await inputMouseFocus(target, request.bounds);
    const focus = await tabsSend(tab.id, { type: "AF_CONFIRM_DEBUGGER_TYPE_TARGET_FOCUSED", token: request.token });
    if (!focus?.ok || !focus?.data?.ok || !focus.data.intact || !focus.data.focused) throw new Error("CDP_INPUT_FOCUS_CONFIRMATION_FAILED");
    if (Number(request.previous_value_length || 0) > 0) await inputClearExistingValue(target);
    // Browser-visible key lifecycle only: keyDown → char → keyUp for every
    // grapheme. No DOM mutation, Runtime, network or site API is used.
    for (const grapheme of Array.from(value)) {
      await inputKey(target, "keyDown", { key: grapheme });
      await inputKey(target, "char", { key: grapheme, text: grapheme, unmodifiedText: grapheme });
      await inputKey(target, "keyUp", { key: grapheme });
      await wait(DEBUGGER_KEY_INTERVAL_MS);
    }
    const confirm = await tabsSend(tab.id, { type: "AF_CONFIRM_DEBUGGER_TYPE_VALUE", token: request.token, expected_value: value });
    if (!confirm?.ok || !confirm?.data?.ok || !confirm.data.intact || !confirm.data.focused || !confirm.data.expected_value_matches) throw new Error("CDP_INPUT_VALUE_CONFIRMATION_FAILED");
    await log("CDP_INPUT_TYPE_COMPLETED", { search_id: state.search_id, tab_id: tab.id, text_length: Array.from(value).length, target_marker: String(request.target?.marker || "").slice(0, 160), target_placeholder: String(request.target?.placeholder || "").slice(0, 160) });
    return { ok: true, data: { ok: true, strategy: "chrome_debugger_input_mouse_focus_ctrl_a_backspace_keydown_char_keyup", cdp_methods: Array.from(DEBUGGER_ALLOWED_METHODS), text_length: Array.from(value).length } };
  } catch (error) {
    const reason = debuggerErrorCode(error);
    await log("CDP_INPUT_TYPE_FAILED", { search_id: state.search_id, tab_id: tab.id, reason, text_length: Array.from(value).length });
    return { ok: false, error: `CDP_INPUT_TYPE_FAILED:${reason}` };
  } finally {
    if (attached) {
      try { await debuggerDetach(target); await log("CDP_INPUT_DETACHED", { search_id: state.search_id, tab_id: tab.id }); }
      catch (error) { detachError = debuggerErrorCode(error); await log("CDP_INPUT_DETACH_FAILED", { search_id: state.search_id, tab_id: tab.id, reason: detachError }); }
    }
    if (detachError) return { ok: false, error: `CDP_INPUT_DETACH_FAILED:${detachError}` };
  }
}
function clearAvitoReadyDeadline(searchId) { const timer = avitoReadyTimers.get(searchId); if (timer) clearTimeout(timer); avitoReadyTimers.delete(searchId); }
function deadlineExpired(state) { const deadline = Date.parse(String(state?.avito_ready_deadline_at || "")); return Number.isFinite(deadline) && Date.now() >= deadline; }
async function blockAvitoPageReady(state, reason, details = {}) {
  const latest = await getState();
  if (latest.search_id !== state.search_id || ["CANCELLED_BY_USER", "REPORT_SENT_CONFIRMED", "WAITING_FOR_NEXT_ASSISTANT_FORM"].includes(latest.status)) return latest;
  clearAvitoReadyDeadline(state.search_id);
  const next = await saveState({ ...latest, status: "BLOCKED_AVITO_PAGE_READY", phase: "AVITO_NAVIGATION", blocked_reason: reason });
  await log("AVITO_PAGE_READY_BLOCKED", { search_id: next.search_id, reason, avito_tab_id: next.avito_tab_id, ...details });
  return next;
}
function scheduleAvitoReadyDeadline(state, delayMs = AVITO_READY_POLL_MS) {
  clearAvitoReadyDeadline(state.search_id);
  const deadline = Date.parse(state.avito_ready_deadline_at);
  if (!Number.isFinite(deadline)) return;
  const remaining = Math.max(0, deadline - Date.now());
  const timer = setTimeout(() => {
    reconcilePendingAvitoReadiness().catch(async (error) => {
      const current = await getState();
      if (current.search_id === state.search_id && current.status === "WAITING_FOR_AVITO_PAGE_READY") {
        await blockAvitoPageReady(current, `AVITO_READY_POLL_FAILED:${String(error?.message || error)}`, { deadline_at: current.avito_ready_deadline_at });
      }
    });
  }, Math.min(Math.max(50, Number(delayMs) || AVITO_READY_POLL_MS), remaining));
  avitoReadyTimers.set(state.search_id, timer);
}
async function selectVisibleAvitoTab(windowId) {
  const candidates = (await tabsQuery({ windowId })).filter((tab) => Core.isAvitoUrl(tab.url || ""));
  const active = candidates.filter((tab) => tab.active);
  if (active.length === 1) return { tab: active[0], source: "active_avito_tab" };
  if (candidates.length === 1) return { tab: candidates[0], source: "single_avito_tab" };
  if (!candidates.length) throw new Error("AVITO_VISIBLE_TAB_REQUIRED_OPEN_ONE_PUBLIC_AVITO_TAB");
  throw new Error("AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB");
}
async function persistedRunOwnedAvitoTab(state) {
  if (!Number.isInteger(state?.avito_tab_id)) return null;
  const tab = await getTab(state.avito_tab_id);
  if (!tab || tab.windowId !== state.current_window_id || !Core.isAvitoUrl(tab.url || "")) return null;
  return tab;
}
async function createInitialPublicAvitoTab(state, purpose) {
  // Allowed only at the first Avito action of one explicit user-started run.
  // It creates a single normal public root and never restores a stale URL or tab binding.
  if (!state?.user_started || state?.avito_target_bound_once) {
    throw new Error("AVITO_VISIBLE_TAB_REQUIRED_OPEN_ONE_PUBLIC_AVITO_TAB");
  }
  // The Avito-initiator dynamic Traffic Lite rule is installed when proxy mode
  // is enabled, so even this first public root blocks CDN media before fetch.
  // Keep the canonical visible-root bootstrap contract unchanged.
  const tab = await tabsCreate({ url: "https://www.avito.ru/", active: true, windowId: state.current_window_id });
  if (!tab?.id || tab.windowId !== state.current_window_id) {
    throw new Error("AVITO_PUBLIC_ROOT_CREATE_FAILED");
  }
  await ensureTrafficLiteForAvitoTab(tab);
  await log("AVITO_INITIAL_PUBLIC_ROOT_CREATED", {
    search_id: state.search_id,
    purpose,
    tab: shortTab(tab),
    persistent_binding: false,
    bootstrap_only: true,
    traffic_lite_dynamic_rule_preinstalled: true
  });
  return { tab, created: true, navigated: false, reused: false, source: "initial_active_public_root" };
}
function directPublicAvitoUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!Core.isAvitoUrl(url.href) || url.protocol !== "https:" || !/^(?:www\.)?avito\.ru$/iu.test(url.hostname) || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch (_) { return null; }
}
function sameDocumentUrl(left, right) {
  try { const a = new URL(String(left || "")); const b = new URL(String(right || "")); a.hash = ""; b.hash = ""; return a.href === b.href; } catch (_) { return false; }
}
async function applyRequestedVisibleAvitoUrl(state, tab, requestedUrl, purpose, source) {
  const url = directPublicAvitoUrl(requestedUrl);
  const currentUrl = String(tab?.url || "");
  const pendingUrl = String(tab?.pendingUrl || "");
  if (!url) return { tab, navigated: false, source, previous_url: currentUrl, requested_url: null };
  if (sameVisibleAvitoRoute(currentUrl, url) || sameVisibleAvitoRoute(pendingUrl, url)) {
    const interruption = sameVisibleAvitoRoute(currentUrl, url) ? await probeVisibleAvitoInterruption(tab) : null;
    if (interruption?.ip_block === true && interruption?.captcha !== true) {
      await log("AVITO_EQUIVALENT_ROUTE_IP_BLOCK_RELOAD_REQUIRED", {
        search_id: state.search_id,
        purpose,
        source,
        requested_url: url,
        current_url: currentUrl || null,
        pending_url: pendingUrl || null
      });
      return {
        tab,
        navigated: false,
        reload_requested: true,
        reload_previous_time_origin: Number(interruption.time_origin || 0),
        source: `${source}_ip_block_reload`,
        previous_url: currentUrl,
        requested_url: url
      };
    }
    await log("AVITO_DIRECT_URL_NAVIGATION_SKIPPED_EQUIVALENT", {
      search_id: state.search_id,
      purpose,
      source,
      requested_url: url,
      current_url: currentUrl || null,
      pending_url: pendingUrl || null,
      captcha_retained: interruption?.captcha === true
    });
    return { tab, navigated: false, reload_requested: false, source, previous_url: currentUrl, requested_url: url };
  }
  await prepareTrafficLiteForNavigation(tab.id);
  const updated = await tabsUpdate(tab.id, { url, active: true });
  if (!updated?.id || updated.windowId !== state.current_window_id) throw new Error("AVITO_DIRECT_URL_NAVIGATION_FAILED");
  await log("AVITO_DIRECT_URL_NAVIGATED", { search_id: state.search_id, purpose, source, requested_url: url, previous_url: currentUrl || null, tab: shortTab(updated) });
  return { tab: updated, navigated: true, source: `${source}_direct_url`, previous_url: currentUrl, requested_url: url };
}
async function ensureAvitoTarget(state, requestedUrl, purpose, _policy = {}) {
  // A writing-block page URL is a normal visible navigation instruction. It
  // carries city, category, query and filters, so those controls are not typed
  // again after the target route has been supplied.
  const bound = await persistedRunOwnedAvitoTab(state);
  if (bound) {
    await log("AVITO_TAB_REUSED_WITHIN_RUN", { search_id: state.search_id, purpose, tab: shortTab(bound), persistent_binding: false });
    const routed = await applyRequestedVisibleAvitoUrl(state, bound, requestedUrl, purpose, "current_run");
    return { tab: routed.tab, created: false, navigated: routed.navigated, reload_requested: routed.reload_requested === true, reload_previous_time_origin: routed.reload_previous_time_origin || null, reused: true, source: routed.source, previous_url: routed.previous_url || null, requested_url: routed.requested_url || null };
  }
  try {
    const selected = await selectVisibleAvitoTab(state.current_window_id);
    await log("AVITO_VISIBLE_TARGET_SELECTED", { search_id: state.search_id, purpose, tab: shortTab(selected.tab), source: selected.source, persistent_binding: false });
    const routed = await applyRequestedVisibleAvitoUrl(state, selected.tab, requestedUrl, purpose, selected.source);
    return { tab: routed.tab, created: false, navigated: routed.navigated, reload_requested: routed.reload_requested === true, reload_previous_time_origin: routed.reload_previous_time_origin || null, reused: false, source: routed.source, previous_url: routed.previous_url || null, requested_url: routed.requested_url || null };
  } catch (error) {
    if (String(error?.message || error) === "AVITO_VISIBLE_TAB_REQUIRED_OPEN_ONE_PUBLIC_AVITO_TAB" && state?.user_started === true && state?.avito_target_bound_once !== true) {
      const created = await createInitialPublicAvitoTab(state, purpose);
      const routed = await applyRequestedVisibleAvitoUrl(state, created.tab, requestedUrl, purpose, created.source);
      return { tab: routed.tab, created: true, navigated: routed.navigated, reload_requested: routed.reload_requested === true, reload_previous_time_origin: routed.reload_previous_time_origin || null, reused: false, source: routed.source, previous_url: routed.previous_url || null, requested_url: routed.requested_url || null };
    }
    throw error;
  }
}
async function visibleAvitoDelay(state, stage, ms) {
  const durationMs = Math.max(0, Number(ms) || 0);
  await log("AVITO_VISIBLE_DELAY_STARTED", { search_id: state.search_id, stage, duration_ms: durationMs, avito_tab_id: state.avito_tab_id });
  await wait(durationMs);
  const latest = await getState();
  if (latest.search_id !== state.search_id || latest.status === "CANCELLED_BY_USER") throw new Error("AVITO_VISIBLE_DELAY_CANCELLED");
  await log("AVITO_VISIBLE_DELAY_COMPLETED", { search_id: state.search_id, stage, duration_ms: durationMs, avito_tab_id: state.avito_tab_id });
}
function uiTimingProfile(plan) {
  return String(plan?.timing_profile || "CONTROL_VISIBLE").toUpperCase() === "COLLECTION_FAST" ? "COLLECTION_FAST" : "CONTROL_VISIBLE";
}
function collectionStep(step) {
  const type = String(step?.type || "").toUpperCase();
  return type === "COLLECT_LISTINGS" || type === "COLLECT_LISTING_DETAILS" || type === "COLLECT_EXPLICIT_LISTING_QUEUE" || type === "RESUME_EXPLICIT_LISTING_QUEUE";
}
function firstNonWaitStep(steps) {
  for (const step of Array.isArray(steps) ? steps : []) if (String(step?.type || "").toUpperCase() !== "WAIT") return step || null;
  return null;
}
function nextNonWaitStep(steps, startIndex) {
  const list = Array.isArray(steps) ? steps : [];
  for (let index = Math.max(0, Number(startIndex) || 0); index < list.length; index += 1) {
    if (String(list[index]?.type || "").toUpperCase() !== "WAIT") return list[index] || null;
  }
  return null;
}
function planStartsCollection(plan, steps = null) {
  if (uiTimingProfile(plan) !== "COLLECTION_FAST") return false;
  const list = Array.isArray(steps) ? steps : (Array.isArray(plan?.steps) ? plan.steps : []);
  const firstIndex = list.findIndex((step) => String(step?.type || "").toUpperCase() !== "WAIT");
  if (firstIndex < 0) return false;
  const first = list[firstIndex] || null;
  if (collectionStep(first)) return true;
  // A card click followed immediately by public detail capture is already the
  // collection phase. A Find click followed by COLLECT_LISTINGS is deliberately
  // not included, because the user asked to keep that control visible.
  const second = nextNonWaitStep(list, firstIndex + 1);
  return String(first?.type || "").toUpperCase() === "CLICK" && String(second?.type || "").toUpperCase() === "COLLECT_LISTING_DETAILS";
}
function uiPlanStartDelayMs(plan) {
  // Keep the visible pause before a user-observable city/filter/search control.
  // Skip it only when this plan begins with read-only collection or with opening
  // one public card immediately followed by its read-only detail capture.
  return planStartsCollection(plan) ? 0 : AVITO_VISIBLE_PRE_ACTION_DELAY_MS;
}
function uiPlanCompletionDelayMs(plan, result) {
  // A completed collection returns without an artificial pause; the report itself
  // is still returned through the normal pinned-chat path.
  if (uiTimingProfile(plan) === "COLLECTION_FAST" && (Array.isArray(result?.listings) && result.listings.length || result?.listing_details)) return 0;
  return AVITO_VISIBLE_POST_ACTION_DELAY_MS;
}
function uiClickReconcileCollectionDelayMs(plan, remainingSteps) {
  // After a visible navigation arrives at a listing or results surface, collect
  // immediately in COLLECTION_FAST. Tab/page readiness is still verified first.
  return planStartsCollection(plan, remainingSteps) ? 0 : AVITO_VISIBLE_POST_ACTION_DELAY_MS;
}
async function requireReadyAvitoTarget(tabId, windowId, stateOverride = null) {
  const target = await getTab(tabId);
  const state = stateOverride || await getState();
  const readiness = await probeAvitoPageReadiness(target, windowId, state);
  if (!readiness.ready) throw new Error(`AVITO_PAGE_NOT_READY:${tabId}:${readiness.source}`);
  return target;
}
async function sendAvito(tabId, windowId, message) {
  const ready = await requireReadyAvitoTarget(tabId, windowId);
  try { return await tabsSend(tabId, message); } catch (error) {
    if (!noReceiver(error)) throw error;
    await execute({ target: { tabId }, files: ["core.js", "avito_content.js"], injectImmediately: true });
    await log("CONTENT_SCRIPT_INJECTED", { role: "avito", tab: shortTab(ready), files: ["core.js", "avito_content.js"] });
    return tabsSend(tabId, message);
  }
}
async function recordUiClickDispatched(message, sender) {
  const state = await getState();
  const dispatch = message?.dispatch || {};
  const tab = sender?.tab;
  const plan = state.ui_action_plan || {};
  const stepIndex = Number(dispatch.step_index || 0);
  const expectedStep = Array.isArray(plan.steps) ? plan.steps[stepIndex - 1] : null;
  if (!state.search_id || state.command_mode !== "AVITO_UI" || state.status !== "AVITO_TAB_ACTIVE") throw new Error("UI_CLICK_DISPATCH_STATE_NOT_ACTIVE");
  if (!tab?.id || tab.id !== state.avito_tab_id || tab.windowId !== state.current_window_id) throw new Error("UI_CLICK_DISPATCH_SENDER_TAB_MISMATCH");
  const current = await getTab(tab.id);
  const readiness = await probeAvitoPageReadiness(current, state.current_window_id, state);
  if (!readiness.ready) throw new Error(`UI_CLICK_DISPATCH_AVITO_NOT_READY:${readiness.source}`);
  if (String(dispatch.step_type || "") !== "CLICK" || expectedStep?.type !== "CLICK") throw new Error("UI_CLICK_DISPATCH_STEP_MISMATCH");
  if (!plan.plan_fingerprint || String(dispatch.plan_fingerprint || "") !== String(plan.plan_fingerprint)) throw new Error("UI_CLICK_DISPATCH_PLAN_MISMATCH");
  if (!Core.isAvitoUrl(dispatch.page_url || "") || new URL(dispatch.page_url).origin !== new URL(current.url).origin) throw new Error("UI_CLICK_DISPATCH_PAGE_MISMATCH");
  const expectedNavigationPath = String(dispatch.expected_navigation_path || "");
  if (expectedNavigationPath && !expectedNavigationPath.startsWith("/")) throw new Error("UI_CLICK_DISPATCH_EXPECTED_PATH_INVALID");
  const targetDescription = safeDispatchText(dispatch.target_description);
  if (!targetDescription) throw new Error("UI_CLICK_DISPATCH_TARGET_REQUIRED");
  const dispatchId = `${state.search_id}:click:${stepIndex}:${Date.now().toString(36)}`;
  const pending = { dispatch_id: dispatchId, step_index: stepIndex, target_description: targetDescription, tab_id: tab.id, page_url: String(dispatch.page_url).slice(0, 500), expected_navigation_path: expectedNavigationPath.slice(0, 500), child_tab_ids: [], dispatched_at: new Date().toISOString() };
  const next = await saveState({ ...state, pending_ui_click: pending, blocked_reason: null });
  await log("AVITO_UI_CLICK_DISPATCH_RECORDED", { search_id: next.search_id, tab_id: tab.id, dispatch_id: dispatchId, step_index: stepIndex, target_description: targetDescription });
  return { ok: true, data: { dispatch_id: dispatchId } };
}
async function inspectAvito(tabId, windowId) { const response = await sendAvito(tabId, windowId, { type: "AF_INSPECT_AVITO_DOM" }); if (!response?.ok) throw new Error(`AVITO_DOM_UNAVAILABLE:${response?.error || "unknown"}`); return response.snapshot; }
async function captureRouteContext(tabId, windowId) {
  const response = await sendAvito(tabId, windowId, { type: "AF_GET_ROUTE_CONTEXT" });
  if (!response?.ok || !response.context) throw new Error(`AVITO_ROUTE_CONTEXT_UNAVAILABLE:${response?.error || "unknown"}`);
  return response.context;
}
function isAssistantDirectedOptionalLoginDialogInspection(state) {
  return state?.command_mode === "DIAGNOSE_DOM"
    && String(state?.diagnostic_request?.scope || "").toUpperCase() === "DIALOG_VISIBLE"
    && !String(state?.diagnostic_request?.action || "").trim();
}
function isAssistantDirectedOptionalLoginGenericClick(state, current) {
  const steps = Array.isArray(state?.ui_action_plan?.steps) ? state.ui_action_plan.steps : [];
  const snapshot = state?.optional_login_dialog_snapshot;
  return state?.command_mode === "AVITO_UI"
    && steps.length === 1
    && String(steps[0]?.type || "").toUpperCase() === "CLICK"
    && Boolean(snapshot?.snapshot_fingerprint)
    && String(snapshot?.url || "") === String(current?.url || "");
}
function optionalLoginPreflightDisposition(state, current) {
  if (!current?.login_popup) return "continue";
  if (isAssistantDirectedOptionalLoginDialogInspection(state)) return "allow_dialog_inspection";
  if (isAssistantDirectedOptionalLoginGenericClick(state, current)) return "allow_exact_generic_click";
  return "report_observed";
}
async function rememberRouteContext(state, context, kind) {
  const journal = Core.appendRouteContext(state.route_journal, context, kind);
  return saveState({
    ...state,
    last_route_context: context,
    route_journal: journal,
    last_context_report_fingerprint: null,
    optional_login_dialog_snapshot: context?.login_popup ? (state.optional_login_dialog_snapshot || null) : null
  });
}
async function preflightRouteContext(state, tab) {
  const current = await captureRouteContext(tab.id, state.current_window_id);
  const previous = state.last_route_context || null;
  const disposition = optionalLoginPreflightDisposition(state, current);
  if (disposition === "report_observed") {
    const journal = Core.appendRouteContext(state.route_journal, current, "optional_login_popup_observed");
    const report = Core.formatOptionalLoginPopupObservedReport(state.search_id, previous, current, journal);
    const prepared = await saveState({
      ...state,
      last_route_context: current,
      route_journal: journal,
      status: "OPTIONAL_LOGIN_POPUP_REPORT_READY",
      phase: "OPTIONAL_LOGIN_POPUP_OBSERVED",
      report,
      report_kind: "optional_login_popup_observed",
      blocked_reason: "OPTIONAL_LOGIN_POPUP_OBSERVED",
      optional_login_dialog_snapshot: null
    });
    await log("OPTIONAL_LOGIN_POPUP_OBSERVED", {
      search_id: prepared.search_id,
      tab_id: tab.id,
      route_context: Core.routeContextFingerprint(current),
      report_fingerprint: Core.fingerprint(report),
      actions_after_overlay: "none"
    });
    await deliverReportToPinnedChat(prepared, report, "optional_login_popup_observed");
    return { changed: true, state: await getState(), context: current, login_popup_events: [{ phase: "worker_preflight", status: "observed_reported", closed: false, reason: "OPTIONAL_LOGIN_POPUP_OBSERVED" }] };
  }
  const interruptionPage = current?.page_kind === "ip_block" || current?.page_kind === "captcha";
  if (interruptionPage) {
    const remembered = await rememberRouteContext(state, current, current.page_kind === "captcha" ? "captcha_preflight" : "ip_block_preflight");
    return { changed: false, state: remembered, context: current, login_popup_events: [] };
  }
  const overlayTransition = Boolean(previous?.login_popup || current.login_popup);
  if (previous && !overlayTransition && Core.routeContextChanged(previous, current)) {
    const journal = Core.appendRouteContext(state.route_journal, current, "manual_context_changed");
    const report = Core.formatRouteContextReport(state.search_id, previous, current, journal, "VISIBLE_AVITO_CONTEXT_CHANGED");
    const prepared = await saveState({ ...state, last_route_context: current, route_journal: journal, status: "ROUTE_CONTEXT_CHANGED_REPORT_READY", phase: "ROUTE_CONTEXT_RECONCILIATION", report, report_kind: "route_context_changed", blocked_reason: "VISIBLE_AVITO_CONTEXT_CHANGED", optional_login_dialog_snapshot: null });
    await log("VISIBLE_AVITO_CONTEXT_CHANGED", { search_id: prepared.search_id, previous: Core.routeContextFingerprint(previous), current: Core.routeContextFingerprint(current) });
    await deliverReportToPinnedChat(prepared, report, "route_context_changed");
    return { changed: true, state: await getState(), context: current, login_popup_events: [] };
  }
  const kind = disposition === "allow_dialog_inspection" ? "login_popup_dialog_inspection_allowed"
    : (disposition === "allow_exact_generic_click" ? "login_popup_generic_click_allowed"
      : (current.login_popup ? "login_popup_observed_assistant_directed"
        : (previous?.login_popup ? "login_popup_overlay_dismissed_current_context"
          : (previous ? "preflight_confirmed" : "initial_preflight"))));
  const remembered = await rememberRouteContext(state, current, kind);
  return { changed: false, state: remembered, context: current, login_popup_events: current.login_popup ? [{ phase: "worker_preflight", status: disposition, closed: false, reason: null }] : [] };
}
async function diagnoseAvito(tabId, windowId, request) { const response = await sendAvito(tabId, windowId, { type: "AF_DIAGNOSE_AVITO_DOM", request }); if (!response?.ok) throw new Error(`AVITO_DIAGNOSTIC_UNAVAILABLE:${response?.error || "unknown"}`); return response.snapshot; }
async function performDiagnosticAction(tabId, windowId, request) { const response = await sendAvito(tabId, windowId, { type: "AF_PERFORM_DIAGNOSTIC_ACTION", request }); if (!response?.ok) throw new Error(`AVITO_DIAGNOSTIC_ACTION_UNAVAILABLE:${response?.error || "unknown"}`); if (!response.result?.ok) throw new Error(`AVITO_DIAGNOSTIC_ACTION_BLOCKED:${response.result?.blocked_reason || "unknown"}`); return response.result; }
// Generic plan execution is isolated to the Avito content script. The worker
// never receives selectors or JavaScript from the chat; it carries only the
// locally parsed visible-control descriptors.
async function executeAvitoUiActionPlan(tabId, windowId, plan) {
  const response = await sendAvito(tabId, windowId, { type: "AF_EXECUTE_AVITO_UI_PLAN", plan });
  if (!response?.ok) throw new Error(`AVITO_UI_PLAN_UNAVAILABLE:${response?.error || "unknown"}`);
  return response.result || { ok: false, blocked_reason: "AVITO_UI_PLAN_EMPTY_RESULT", steps: [] };
}
function canonicalPublicListingUrl(value) {
  try { const u = new URL(value); return Core.isAvitoUrl(u.href) ? `${u.origin}${u.pathname}` : ""; } catch (_) { return ""; }
}
function samePublicResultsPath(a, b) {
  try { const left = new URL(a); const right = new URL(b); return left.origin === right.origin && left.pathname === right.pathname; } catch (_) { return false; }
}
function sequentialCardUrlState(tab, windowId, expectedHref) {
  if (!tab) return { state: "missing", url: "" };
  if (tab.windowId !== windowId) return { state: "wrong_window", url: "" };
  const committedUrl = String(tab.url || "");
  const pendingUrl = String(tab.pendingUrl || "");
  if (Core.isAvitoUrl(committedUrl)) {
    if (tab.status !== "complete") return { state: "loading_avito", url: committedUrl };
    if (canonicalPublicListingUrl(committedUrl) !== canonicalPublicListingUrl(expectedHref)) return { state: "wrong_listing", url: committedUrl };
    return { state: "ready", url: committedUrl };
  }
  if (Core.isAvitoUrl(pendingUrl)) return { state: "pending_avito", url: pendingUrl };
  if (!committedUrl || /^(?:about:blank|chrome:\/\/newtab\/?)(?:#.*)?$/iu.test(committedUrl)) return { state: "transient_blank", url: committedUrl };
  return { state: "invalid_url", url: committedUrl };
}
async function waitForSequentialCardReady(tabId, windowId, expectedHref, timeoutMs = SEQUENTIAL_CARD_READY_TIMEOUT_MS) {
  const timeout = Math.max(1000, Math.min(Number(timeoutMs) || SEQUENTIAL_CARD_READY_TIMEOUT_MS, SEQUENTIAL_CARD_READY_TIMEOUT_MS));
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    let settled = false; let last = null; let timer = null; let pollTimer = null;
    const finish = (error, tab) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(pollTimer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (error) reject(error); else resolve(tab);
    };
    const assess = async (tab) => {
      if (settled) return;
      const state = sequentialCardUrlState(tab, windowId, expectedHref); last = state;
      if (state.state === "missing") { finish(new Error(`SEQUENTIAL_CARD_TAB_MISSING:${tabId}`)); return; }
      if (state.state === "wrong_window") { finish(new Error(`SEQUENTIAL_CARD_WINDOW_INVALID:${tabId}`)); return; }
      if (state.state === "wrong_listing") { finish(new Error(`SEQUENTIAL_CARD_URL_MISMATCH:${tabId}`)); return; }
      if (state.state === "ready") { finish(null, tab); return; }
      if (state.state === "loading_avito" && canonicalPublicListingUrl(state.url) === canonicalPublicListingUrl(expectedHref)) {
        const readiness = await probeAvitoPageReadiness(tab, windowId, null);
        last = { ...state, readiness_source: readiness.source };
        if (readiness.ready) { finish(null, tab); return; }
      }
      if (state.state === "invalid_url" && tab?.status === "complete") { finish(new Error(`SEQUENTIAL_CARD_NON_AVITO_FINAL_URL:${tabId}`)); return; }
    };
    const poll = async () => {
      if (settled) return;
      try { await assess(await getTab(tabId)); } catch (_) {}
      if (!settled && Date.now() < deadline) pollTimer = setTimeout(poll, Math.min(AVITO_READY_POLL_MS, Math.max(50, deadline - Date.now())));
    };
    const onUpdated = (updatedId, changeInfo, tab) => {
      if (updatedId !== tabId) return;
      if (changeInfo.url || changeInfo.status === "loading" || changeInfo.status === "complete") assess(tab).catch(() => {});
    };
    const onRemoved = (removedId) => { if (removedId === tabId) finish(new Error(`SEQUENTIAL_CARD_TAB_MISSING:${tabId}`)); };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    timer = setTimeout(() => finish(new Error(`SEQUENTIAL_CARD_READY_TIMEOUT:${tabId}:${last?.state || "unknown"}:${last?.readiness_source || "no_probe"}`)), timeout);
    poll();
  });
}
async function readSequentialPublicListing(tabId, windowId) {
  const response = await sendAvito(tabId, windowId, { type: "AF_SEQUENTIAL_READ_PUBLIC_LISTING", request: { timeout_ms: SEQUENTIAL_CARD_CONTENT_TIMEOUT_MS } });
  if (!response?.ok || !response.result) throw new Error(`SEQUENTIAL_LISTING_READ_UNAVAILABLE:${response?.error || "unknown"}`);
  return response.result.details || { blocked_reason: "SEQUENTIAL_LISTING_DETAILS_EMPTY" };
}
function sequentialDetailKey(summary) { return canonicalPublicListingUrl(summary?.href || ""); }
function mergeSequentialDetails(previous, next) {
  const old = previous && typeof previous === "object" ? previous : {};
  const fresh = next && typeof next === "object" ? next : {};
  return {
    ...old,
    ...fresh,
    price: fresh.price || old.price || "",
    title: fresh.title || old.title || "",
    seller: fresh.seller || old.seller || "",
    seller_rating: fresh.seller_rating || old.seller_rating || "",
    location: fresh.location || old.location || "",
    description: fresh.description || old.description || "",
    sections: Array.isArray(fresh.sections) && fresh.sections.length ? fresh.sections : (Array.isArray(old.sections) ? old.sections : []),
    seller_badges: Array.isArray(fresh.seller_badges) && fresh.seller_badges.length ? fresh.seller_badges : (Array.isArray(old.seller_badges) ? old.seller_badges : []),
    delivery: Array.isArray(fresh.delivery) && fresh.delivery.length ? fresh.delivery : (Array.isArray(old.delivery) ? old.delivery : [])
  };
}
function upsertSequentialDetail(checkpoint, summary, detail) {
  const rows = Array.isArray(checkpoint.details) ? checkpoint.details : [];
  const key = sequentialDetailKey(summary);
  const index = key ? rows.findIndex((row) => sequentialDetailKey(row?.summary || {}) === key) : -1;
  const row = { summary, details: mergeSequentialDetails(index >= 0 ? rows[index]?.details : null, detail) };
  if (index >= 0) rows[index] = row; else rows.push(row);
  checkpoint.details = rows;
  return row;
}
function rawCollectedRecord(summary, details) {
  const detail = details && typeof details === "object" ? details : {};
  return {
    href: canonicalPublicListingUrl(summary?.href || detail?.href || ""),
    title: detail.title || summary?.title || "",
    price: detail.price || summary?.price || "",
    location: detail.location || summary?.location || "",
    seller: detail.seller || summary?.seller || "",
    seller_rating: detail.seller_rating || summary?.seller_rating || "",
    seller_badges: Array.isArray(detail.seller_badges) ? detail.seller_badges : (Array.isArray(summary?.seller_badges) ? summary.seller_badges : []),
    delivery: Array.isArray(detail.delivery) ? detail.delivery.join("; ") : (summary?.delivery || ""),
    sections: Array.isArray(detail.sections) ? detail.sections : [],
    description: detail.description || "",
    blocked_reason: detail.blocked_reason || null
  };
}
function compactSequentialCheckpoint(checkpoint) {
  const cp = checkpoint && typeof checkpoint === "object" ? checkpoint : {};
  const candidates = Array.isArray(cp.candidates) ? cp.candidates : [];
  const details = Array.isArray(cp.details) ? cp.details : [];
  const detailsByHref = new Map(details.map((row) => [sequentialDetailKey(row?.summary || {}), row]));
  const failed = Array.isArray(cp.failed) ? cp.failed : [];
  const collected = candidates.map((summary) => {
    const row = detailsByHref.get(sequentialDetailKey(summary));
    return rawCollectedRecord(summary, row?.details || null);
  });
  return {
    collector_kind: "assistant_explicit_public_url_queue",
    status: cp.status || "paused",
    candidate_count: candidates.length,
    details_collected: details.length,
    remaining: Math.max(0, candidates.length - Number(cp.cursor || 0)),
    batch_size: cp.batch_size || SEQUENTIAL_REVIEW_DEFAULT_BATCH,
    card_gap_ms: cp.card_gap_ms ?? SEQUENTIAL_REVIEW_DEFAULT_CARD_GAP_MS,
    cards_closed: cp.cards_closed || 0,
    queue_source: "assistant_explicit_url_order",
    collected: collected.slice(0, EXPLICIT_QUEUE_MAX_ITEMS),
    failed: failed.slice(0, 20),
    captcha: cp.captcha || null,
    blocked_reason: cp.blocked_reason || null
  };
}
function normalizeSequentialCardGapMs(value, fallback = SEQUENTIAL_REVIEW_DEFAULT_CARD_GAP_MS) {
  const parsed = Number(value);
  if (Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= SEQUENTIAL_REVIEW_CARD_GAP_MAX_MS) return parsed;
  return fallback;
}
function requestedSequentialCardGapMs(plan) {
  const raw = plan?.sequential_card_gap_ms;
  return raw === null || raw === undefined ? null : normalizeSequentialCardGapMs(raw, null);
}
function checkpointCardGapMs(plan, checkpoint) {
  const requested = requestedSequentialCardGapMs(plan);
  return requested === null ? normalizeSequentialCardGapMs(checkpoint?.card_gap_ms) : requested;
}
async function persistSequentialCheckpoint(state, checkpoint, status = null, phase = null) {
  const next = await saveState({ ...state, sequential_review: checkpoint, ...(status ? { status } : {}), ...(phase ? { phase } : {}) });
  return next;
}
async function closeSequentialOwnedCard(tabId, parentTabId, windowId) {
  const tab = await getTab(tabId);
  if (!tab || tab.windowId !== windowId || Number(tab.openerTabId) !== Number(parentTabId)) return false;
  try { await tabsRemove(tabId); return true; } catch (_) { return false; }
}
async function assertSequentialParent(state, parentTab, checkpoint = null) {
  const cp = checkpoint && typeof checkpoint === "object" ? checkpoint : (state?.sequential_review || {});
  if (!samePublicResultsPath(cp.parent_url || parentTab.url, parentTab.url)) throw new Error("SEQUENTIAL_PARENT_RESULTS_PATH_MISMATCH");
  if (cp.parent_window_id !== null && cp.parent_window_id !== undefined && cp.parent_window_id !== parentTab.windowId) throw new Error("SEQUENTIAL_PARENT_WINDOW_MISMATCH");
  if (Number.isInteger(cp.parent_tab_id) && cp.parent_tab_id === parentTab.id) return cp;
  // A reload or a fresh explicit run may bind the same visible public results
  // URL to a new tab. Rebind only after exact public path and window checks.
  const rebound = { ...cp, parent_tab_id: parentTab.id, parent_window_id: parentTab.windowId, parent_url: parentTab.url || cp.parent_url || "" };
  await persistSequentialCheckpoint(state, rebound);
  await log("SEQUENTIAL_PARENT_REBOUND_SAME_RESULTS", { search_id: state.search_id, parent_tab_id: parentTab.id, parent_url: rebound.parent_url });
  return rebound;
}
async function runSequentialCardBatch(state, parentTab, checkpoint) {
  const batchTarget = Math.max(1, Math.min(Number(checkpoint.batch_size || SEQUENTIAL_REVIEW_DEFAULT_BATCH), SEQUENTIAL_REVIEW_DEFAULT_BATCH));
  let attempted = 0;
  const currentRun = async () => { const latest = await getState(); return latest.search_id === state.search_id && latest.status !== "CANCELLED_BY_USER"; };
  // A retained CAPTCHA tab is always re-read first. The extension never clicks, solves or refreshes a CAPTCHA.
  if (checkpoint.captcha?.child_tab_id) {
    const child = await getTab(checkpoint.captcha.child_tab_id);
    if (!child) {
      checkpoint.failed.push({ title: checkpoint.captcha.title || "", href: checkpoint.captcha.href || "", reason: "SEQUENTIAL_CAPTCHA_TAB_CLOSED_BY_USER" });
      checkpoint.cursor = Math.max(Number(checkpoint.cursor || 0), Number(checkpoint.captcha.cursor || 0) + 1);
      checkpoint.captcha = null;
    } else {
      let ready = await waitForSequentialCardReady(child.id, parentTab.windowId, checkpoint.captcha.href, SEQUENTIAL_CARD_READY_TIMEOUT_MS);
      await activate(ready, "explicit_queue_captcha_manual_recheck");
      let detail = await readSequentialPublicListing(ready.id, parentTab.windowId);
      if (detail?.blocked_reason === "BLOCKED_LOGIN_OR_CAPTCHA") {
        const interruption = await probeVisibleAvitoInterruption(ready);
        if (interruption?.captcha === true) {
          const mediaReload = await reloadCaptchaWithMediaIfNeeded(ready, parentTab.windowId, checkpoint.captcha.href, interruption, "SEQUENTIAL_CAPTCHA_MEDIA_RELOAD_REQUESTED");
          if (mediaReload.reloaded) {
            ready = mediaReload.tab;
            await activate(ready, "explicit_queue_captcha_media_reloaded");
            detail = await readSequentialPublicListing(ready.id, parentTab.windowId);
          }
        }
      }
      if (detail?.blocked_reason === "BLOCKED_LOGIN_OR_CAPTCHA") {
        checkpoint.status = "paused_for_manual_captcha";
        checkpoint.blocked_reason = "CAPTCHA_MANUAL_REQUIRED";
        checkpoint.captcha = { ...checkpoint.captcha, child_tab_id: ready.id };
        await persistSequentialCheckpoint(state, checkpoint);
        await log("SEQUENTIAL_CAPTCHA_STILL_PRESENT", { search_id: state.search_id, child_tab_id: ready.id, cursor: checkpoint.cursor });
        return { checkpoint, attempted, blocked_reason: "CAPTCHA_MANUAL_REQUIRED" };
      }
      const summary = checkpoint.candidates[Number(checkpoint.captcha.cursor || checkpoint.cursor)] || checkpoint.captcha.summary || {};
      if (detail?.blocked_reason) checkpoint.failed.push({ title: summary.title || "", href: summary.href || "", reason: detail.blocked_reason });
      else upsertSequentialDetail(checkpoint, summary, detail);
      if (await closeSequentialOwnedCard(ready.id, parentTab.id, parentTab.windowId)) checkpoint.cards_closed += 1;
      checkpoint.cursor = Math.max(Number(checkpoint.cursor || 0), Number(checkpoint.captcha.cursor || 0) + 1);
      checkpoint.captcha = null; checkpoint.blocked_reason = null; checkpoint.status = "running"; attempted += 1;
      await persistSequentialCheckpoint(state, checkpoint);
    }
  }
  while (attempted < batchTarget && Number(checkpoint.cursor || 0) < checkpoint.candidates.length) {
    if (!await currentRun()) throw new Error("SEQUENTIAL_REVIEW_CANCELLED");
    const cursor = Number(checkpoint.cursor || 0); const summary = checkpoint.candidates[cursor]; let child = null;
    try {
      await log("SEQUENTIAL_CARD_OPEN_REQUESTED", { search_id: state.search_id, cursor, title: summary.title || "", href: summary.href || "", active: true });
      child = await tabsCreate({ url: "about:blank", active: true, windowId: parentTab.windowId, openerTabId: parentTab.id });
      await prepareTrafficLiteForNavigation(child.id);
      child = await tabsUpdate(child.id, { url: summary.href, active: true });
      let ready = await waitForSequentialCardReady(child.id, parentTab.windowId, summary.href, SEQUENTIAL_CARD_READY_TIMEOUT_MS);
      await log("SEQUENTIAL_CARD_READY", { search_id: state.search_id, cursor, tab_id: ready.id, href: ready.url || null });
      let detail = await readSequentialPublicListing(ready.id, parentTab.windowId);
      if (detail?.blocked_reason === "BLOCKED_LOGIN_OR_CAPTCHA") {
        const interruption = await probeVisibleAvitoInterruption(ready);
        if (interruption?.captcha === true) {
          const mediaReload = await reloadCaptchaWithMediaIfNeeded(ready, parentTab.windowId, summary.href, interruption, "SEQUENTIAL_CAPTCHA_MEDIA_RELOAD_REQUESTED");
          if (mediaReload.reloaded) {
            ready = mediaReload.tab;
            await activate(ready, "explicit_queue_captcha_media_reloaded");
            detail = await readSequentialPublicListing(ready.id, parentTab.windowId);
          }
        }
      }
      if (detail?.blocked_reason === "BLOCKED_LOGIN_OR_CAPTCHA") {
        checkpoint.status = "paused_for_manual_captcha"; checkpoint.blocked_reason = "CAPTCHA_MANUAL_REQUIRED";
        checkpoint.captcha = { child_tab_id: ready.id, cursor, title: summary.title || "", href: summary.href || "", summary };
        await persistSequentialCheckpoint(state, checkpoint);
        await log("SEQUENTIAL_CAPTCHA_MANUAL_PAUSE", { search_id: state.search_id, child_tab_id: ready.id, cursor, title: summary.title || "" });
        return { checkpoint, attempted, blocked_reason: "CAPTCHA_MANUAL_REQUIRED" };
      }
      if (detail?.blocked_reason) checkpoint.failed.push({ title: summary.title || "", href: summary.href || "", reason: detail.blocked_reason });
      else upsertSequentialDetail(checkpoint, summary, detail);
    } catch (error) {
      checkpoint.failed.push({ title: summary?.title || "", href: summary?.href || "", reason: String(error?.message || error).slice(0, 180) });
    } finally {
      if (child?.id && !checkpoint.captcha?.child_tab_id) { if (await closeSequentialOwnedCard(child.id, parentTab.id, parentTab.windowId)) checkpoint.cards_closed += 1; }
    }
    checkpoint.cursor = cursor + 1; checkpoint.status = "running"; checkpoint.blocked_reason = null; attempted += 1;
    await persistSequentialCheckpoint(state, checkpoint);
    const cardGapMs = normalizeSequentialCardGapMs(checkpoint.card_gap_ms);
    if (attempted < batchTarget && checkpoint.cursor < checkpoint.candidates.length && cardGapMs > 0) {
      await log("SEQUENTIAL_CARD_GAP_WAIT", { search_id: state.search_id, cursor: checkpoint.cursor, card_gap_ms: cardGapMs });
      await wait(cardGapMs);
    }
  }
  checkpoint.status = checkpoint.cursor >= checkpoint.candidates.length ? "completed" : "paused_after_test_batch";
  checkpoint.blocked_reason = null;
  await persistSequentialCheckpoint(state, checkpoint);
  return { checkpoint, attempted, blocked_reason: null };
}
async function runExplicitListingQueue(state, parentTab, plan) {
  const action = (plan.steps || []).find((step) => ["COLLECT_EXPLICIT_LISTING_QUEUE", "RESUME_EXPLICIT_LISTING_QUEUE"].includes(String(step?.type || ""))) || {};
  const actionType = String(action.type || "");
  const isStart = actionType === "COLLECT_EXPLICIT_LISTING_QUEUE";
  const isResume = actionType === "RESUME_EXPLICIT_LISTING_QUEUE";
  let checkpoint = state.sequential_review && typeof state.sequential_review === "object" ? { ...state.sequential_review } : null;
  const batchSize = Math.max(1, Math.min(Number(action.batch || checkpoint?.batch_size || SEQUENTIAL_REVIEW_DEFAULT_BATCH), SEQUENTIAL_REVIEW_DEFAULT_BATCH));
  const configuredCardGapMs = checkpointCardGapMs(plan, checkpoint);

  if (isStart) {
    const requestedUrls = Array.isArray(action.selected_urls) ? action.selected_urls.map((value) => canonicalPublicListingUrl(value)).filter(Boolean) : [];
    if (!requestedUrls.length) throw new Error("UI_PLAN_EXPLICIT_PUBLIC_QUEUE_REQUIRED");
    const candidates = requestedUrls.slice(0, EXPLICIT_QUEUE_MAX_ITEMS).map((href) => ({ href, title: "" }));
    checkpoint = {
      version: 1,
      kind: "assistant_explicit_public_url_queue",
      parent_tab_id: parentTab.id,
      parent_window_id: parentTab.windowId,
      parent_url: parentTab.url || "",
      candidates,
      cursor: 0,
      batch_size: batchSize,
      card_gap_ms: configuredCardGapMs,
      cards_closed: 0,
      details: [],
      failed: [],
      captcha: null,
      queue_source: "assistant_explicit_url_order",
      status: "running",
      blocked_reason: null
    };
    await persistSequentialCheckpoint(state, checkpoint, "AVITO_TAB_ACTIVE", "EXECUTING_EXPLICIT_PUBLIC_QUEUE");
    await log("EXPLICIT_PUBLIC_QUEUE_ACCEPTED", { search_id: state.search_id, candidate_count: candidates.length, batch_size: batchSize, card_gap_ms: checkpoint.card_gap_ms, parent_tab_id: parentTab.id });
  } else if (isResume) {
    if (!checkpoint || checkpoint.kind !== "assistant_explicit_public_url_queue" || !Array.isArray(checkpoint.candidates) || !checkpoint.candidates.length || checkpoint.status === "completed") throw new Error("EXPLICIT_PUBLIC_QUEUE_NO_RESUMABLE_CHECKPOINT");
    checkpoint = await assertSequentialParent(state, parentTab, checkpoint);
    checkpoint = { ...checkpoint, batch_size: batchSize, card_gap_ms: configuredCardGapMs, status: "running", blocked_reason: null };
    await persistSequentialCheckpoint(state, checkpoint, "AVITO_TAB_ACTIVE", "RESUMING_EXPLICIT_PUBLIC_QUEUE");
  } else {
    throw new Error("EXPLICIT_PUBLIC_QUEUE_ACTION_UNKNOWN");
  }

  const batch = await runSequentialCardBatch(state, parentTab, checkpoint);
  const review = compactSequentialCheckpoint(batch.checkpoint);
  const status = batch.blocked_reason ? "paused_for_manual_captcha" : review.status;
  return {
    ok: !batch.blocked_reason,
    url: parentTab.url || null,
    plan_fingerprint: plan.plan_fingerprint || "",
    steps: [{ index: 1, type: actionType, status: batch.blocked_reason ? "paused" : "completed", count: review.details_collected, text: `cursor=${batch.checkpoint.cursor}/${batch.checkpoint.candidates.length}; attempted=${batch.attempted}; status=${status}` }],
    listings: [],
    sequential_review: review,
    listing_details: null,
    blocked_reason: batch.blocked_reason || null
  };
}

function continuationSequentialCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== "object") return null;
  const status = String(checkpoint.status || "");
  return ["running", "paused_after_test_batch", "paused_for_manual_captcha"].includes(status) ? checkpoint : null;
}
async function deliverReportToPinnedChat(state, report, reportKind) {
  const latest = await getState();
  if (latest.search_id !== state.search_id || latest.status === "CANCELLED_BY_USER") return latest;
  const deliveryId = latest.report_delivery_id || `${latest.search_id}:${reportKind}`;
  const staged = await saveState({ ...latest, status: "REPORT_DELIVERY_IN_PROGRESS", phase: "CHATGPT_REPORT_DELIVERY", report, report_kind: reportKind, report_delivery_id: deliveryId, blocked_reason: null });
  let pinned;
  try { pinned = await assertPinnedChatContext(staged, `chatgpt_return_after_${reportKind}`, { activateTab: true }); } catch (_) { return await getState(); }
  await log("REPORT_DELIVERY_REQUESTED", { search_id: staged.search_id, report_kind: reportKind, tab_id: pinned.tab.id, report_fingerprint: Core.fingerprint(report) });
  let response;
  try {
    response = await sendChat(pinned.tab.id, { type: "AF_CAPTURE_SEND_REPORT", search_id: staged.search_id, delivery_id: deliveryId, report_text: report, expected_identity: pinned.context });
  } catch (error) { response = { ok: false, error: String(error?.message || error), code: "REPORT_TRANSPORT_FAILED" }; }
  if (!response?.ok || !Core.sameConversationIdentity(pinned.context, response.identity)) {
    const reason = response?.error || "REPORT_DELIVERY_CONTEXT_UNCONFIRMED";
    const pause = /PRIMARY_COMPOSER_OCCUPIED|composer.*другой|неотправленный текст/i.test(reason);
    const current = await getState();
    const next = await saveState({ ...current, status: pause ? "PAUSED_USER_COMPOSER_OCCUPIED" : "REPORT_DELIVERY_BLOCKED", phase: "CHATGPT_REPORT_DELIVERY", blocked_reason: reason, report, report_kind: reportKind, report_delivery_id: deliveryId });
    await log(pause ? "REPORT_DELIVERY_PAUSED_USER_COMPOSER_OCCUPIED" : "REPORT_DELIVERY_BLOCKED", { search_id: next.search_id, report_kind: reportKind, reason });
    return next;
  }
  const nextAnchorTurnId = response.anchor_turn_id || staged.anchor_turn_id || null;
  if (!nextAnchorTurnId) {
    const current = await getState();
    const blocked = await saveState({ ...current, status: "CONTINUATION_ANCHOR_MISSING", phase: "CHATGPT_CONTINUATION", blocked_reason: "REPORT_SENT_WITHOUT_USER_TURN_ANCHOR", report, report_kind: reportKind });
    await log("CONTINUATION_ANCHOR_MISSING", { search_id: blocked.search_id, report_kind: reportKind, chatgpt_tab_id: pinned.tab.id });
    return blocked;
  }
  // A delivered result is not terminal. Its exact user turn becomes the next
  // anchor, matching the Bridge dialogue cycle: report → next assistant form.
  // Full collected payloads are transient and are deleted once delivery is confirmed.
  await storageRemove([INSPECTION_KEY]);
  const waiting = await saveState({
    ...staged,
    status: "WAITING_FOR_NEXT_ASSISTANT_FORM",
    phase: "CHATGPT_CONTINUATION",
    anchor_turn_id: nextAnchorTurnId,
    report: null,
    report_kind: null,
    report_delivery_id: null,
    sequential_review: continuationSequentialCheckpoint(staged.sequential_review),
    blocked_reason: null
  });
  await log(reportKind === "validation_error" ? "VALIDATION_ERROR_REPORTED_TO_CHAT" : "REPORT_SENT_CONFIRMED", {
    search_id: waiting.search_id,
    report_kind: reportKind,
    user_turn_id: nextAnchorTurnId,
    chatgpt_tab_id: pinned.tab.id
  });
  await log("NEXT_FORM_POLL_REQUESTED", { search_id: waiting.search_id, report_kind: reportKind, anchor_turn_id: nextAnchorTurnId, chatgpt_tab_id: pinned.tab.id });
  let continuation;
  try {
    continuation = await sendChat(pinned.tab.id, {
      type: "AF_CAPTURE_BEGIN_PROMPT_POLL",
      search_id: waiting.search_id,
      conversation_id: waiting.conversation_id,
      anchor_turn_id: nextAnchorTurnId,
      expected_identity: pinned.context
    });
  } catch (error) {
    continuation = { ok: false, error: String(error?.message || error) };
  }
  if (!continuation?.ok) {
    const current = await getState();
    const blocked = await saveState({ ...current, status: "WAITING_FOR_NEXT_ASSISTANT_FORM", phase: "CHATGPT_CONTINUATION", blocked_reason: continuation?.error || "NEXT_FORM_POLL_START_FAILED" });
    await log("NEXT_FORM_POLL_START_FAILED", { search_id: blocked.search_id, anchor_turn_id: nextAnchorTurnId, reason: blocked.blocked_reason });
    return blocked;
  }
  const final = await saveState({ ...(await getState()), status: "WAITING_FOR_NEXT_ASSISTANT_FORM", phase: "CHATGPT_CONTINUATION", anchor_turn_id: nextAnchorTurnId, blocked_reason: null });
  await log("NEXT_FORM_POLL_STARTED", { search_id: final.search_id, report_kind: reportKind, anchor_turn_id: nextAnchorTurnId, chatgpt_tab_id: pinned.tab.id });
  return final;
}

function clearUiClickReconcileDeadline(searchId) {
  const timer = uiClickReconcileTimers.get(searchId);
  if (timer) clearTimeout(timer);
  uiClickReconcileTimers.delete(searchId);
}
function scheduleUiClickReconcile(state, delayMs = UI_CLICK_RECONCILE_DELAY_MS) {
  clearUiClickReconcileDeadline(state.search_id);
  const timer = setTimeout(() => { reconcilePendingUiClickHandoff().catch(async (error) => {
    const current = await getState();
    if (current.search_id === state.search_id && current.status === "WAITING_FOR_UI_CLICK_RECONCILIATION") await finishUiClickReconciliationFailure(current, `UI_CLICK_RECONCILIATION_FAILED:${String(error?.message || error)}`);
  }); }, Math.max(0, Number(delayMs) || 0));
  uiClickReconcileTimers.set(state.search_id, timer);
}
function pendingUiClickMatches(state, tabId) {
  const pending = state?.pending_ui_click || null;
  return Boolean(pending && pending.tab_id === tabId && Number.isInteger(Number(pending.step_index)) && pending.dispatch_id);
}
function expectedNavigationPathMatches(candidateUrl, expectedPath) {
  if (!candidateUrl || !expectedPath) return false;
  try {
    const candidate = new URL(candidateUrl);
    const expected = new URL(expectedPath, "https://www.avito.ru/");
    // Avito may rewrite opaque context query values. The public pathname includes
    // the actual listing identity, so require same origin plus exact pathname.
    return candidate.origin === "https://www.avito.ru" && expected.origin === "https://www.avito.ru" && candidate.pathname === expected.pathname;
  } catch (_) { return false; }
}
function pendingChildTabIds(state) {
  const ids = Array.isArray(state?.pending_ui_click?.child_tab_ids) ? state.pending_ui_click.child_tab_ids : [];
  return ids.filter((id) => Number.isInteger(id));
}
function isPendingUiClickChildTab(state, tab) {
  const pending = state?.pending_ui_click || null;
  if (!pending || !tab?.id || tab.windowId !== state.current_window_id) return false;
  if (!pendingChildTabIds(state).includes(tab.id)) return false;
  return Number(tab.openerTabId) === Number(pending.tab_id);
}
// A form submit (for example Avito's visible “Найти” button) has no href.
// It may reload the source tab before the content-script message can respond.
// Accept it only when the exact source tab has visibly changed URL; child tabs
// remain ineligible unless a visible anchor supplied an expected pathname.
function pendingUiClickNavigationMatches(state, tab) {
  const pending = state?.pending_ui_click || {};
  const sourceTab = pendingUiClickMatches(state, tab?.id);
  const childTab = isPendingUiClickChildTab(state, tab);
  if (!sourceTab && !childTab) return false;
  const expectedPath = String(pending.expected_navigation_path || "");
  if (expectedPath) return expectedNavigationPathMatches(tab?.url || "", expectedPath);
  return sourceTab && String(tab?.url || "") !== String(pending.page_url || "");
}
async function rememberPendingUiClickChildTab(tab, source) {
  const state = await getState();
  const pending = state?.pending_ui_click || null;
  const allowedState = state.status === "AVITO_TAB_ACTIVE" || state.status === "WAITING_FOR_UI_CLICK_RECONCILIATION";
  if (!allowedState || !pending || !tab?.id || tab.windowId !== state.current_window_id) return false;
  if (Number(tab.openerTabId) !== Number(pending.tab_id)) return false;
  const known = pendingChildTabIds(state);
  if (known.includes(tab.id)) return true;
  const childTabIds = [...known, tab.id].slice(-8);
  await saveState({ ...state, pending_ui_click: { ...pending, child_tab_ids: childTabIds, child_tab_observed_at: new Date().toISOString() } });
  await log("AVITO_UI_CHILD_TAB_CAPTURED", { search_id: state.search_id, source, source_tab_id: pending.tab_id, child_tab_id: tab.id, child_opener_tab_id: tab.openerTabId ?? null, child_url: tab.url || tab.pendingUrl || null });
  return true;
}
async function choosePendingUiClickNavigationTab(state) {
  const pending = state?.pending_ui_click || {};
  const sourceTab = await getTab(pending.tab_id);
  if (sourceTab && pendingUiClickNavigationMatches(state, sourceTab)) {
    const readiness = await probeAvitoPageReadiness(sourceTab, state.current_window_id, state);
    if (readiness.ready) return { tab: sourceTab, source: "same_tab_navigation", readiness_source: readiness.source };
  }
  for (const childTabId of pendingChildTabIds(state)) {
    const child = await getTab(childTabId);
    if (!isPendingUiClickChildTab(state, child) || !pendingUiClickNavigationMatches(state, child)) continue;
    const readiness = await probeAvitoPageReadiness(child, state.current_window_id, state);
    if (!readiness.ready) continue;
    return { tab: child, source: "visible_child_tab", readiness_source: readiness.source };
  }
  return null;
}
async function finishUiClickReconciliationFailure(state, reason) {
  clearUiClickReconcileDeadline(state.search_id);
  const terminal = await saveState({ ...state, status: "UI_CLICK_RECONCILIATION_REPORT_READY", phase: "AVITO_UI_CLICK_HANDOFF", blocked_reason: reason, pending_ui_click: { ...(state.pending_ui_click || {}), reconciliation: "unconfirmed" } });
  const plan = terminal.ui_action_plan || {};
  const pending = terminal.pending_ui_click || {};
  const result = { ok: false, url: pending.page_url || null, plan_fingerprint: plan.plan_fingerprint || "", steps: [{ index: pending.step_index || null, type: "CLICK", status: "dispatched_unconfirmed", target_description: pending.target_description || null, blocked_reason: reason, text: pending.dispatch_id ? `dispatch_id=${pending.dispatch_id}` : "" }], listings: [], blocked_reason: reason };
  const report = Core.formatUiActionPlanReport({ search_id: terminal.search_id, mode: "AVITO_UI", captured_at: new Date().toISOString(), avito: result });
  const ready = await saveState({ ...terminal, status: "REPORT_READY_FOR_DELIVERY", phase: "AVITO_UI_CLICK_HANDOFF_REPORT_READY", report, report_kind: "ui_action_plan" });
  await log("AVITO_UI_CLICK_RECONCILIATION_UNCONFIRMED", { search_id: ready.search_id, dispatch_id: pending.dispatch_id || null, reason });
  await deliverReportToPinnedChat(ready, report, "ui_action_plan");
}
async function completeUiClickReconciliation(state, readyTab, source) {
  if (state.status !== "WAITING_FOR_UI_CLICK_RECONCILIATION") return;
  const pending = state.pending_ui_click || {};
  const isSourceTab = pendingUiClickMatches(state, readyTab.id);
  const isChildTab = isPendingUiClickChildTab(state, readyTab);
  if (!isSourceTab && !isChildTab) return;
  const readiness = await probeAvitoPageReadiness(readyTab, state.current_window_id, state);
  if (!readiness.ready) return;
  if (!pendingUiClickNavigationMatches(state, readyTab)) return;
  clearUiClickReconcileDeadline(state.search_id);
  const active = readyTab.active ? readyTab : await activate(readyTab, "avito_ui_post_click_reconciliation");
  const verified = await requireReadyAvitoTarget(active.id, state.current_window_id, state);
  let working = await saveState({ ...state, status: "AVITO_TAB_ACTIVE", phase: "AVITO_UI_POST_CLICK_RECONCILIATION", avito_tab_id: verified.id, avito_target_binding_source: isChildTab ? "visible_child_tab" : (state.avito_target_binding_source || "current_run"), blocked_reason: null, pending_ui_click: { ...pending, reconciliation: "resuming", reconciled_tab_id: verified.id, reconciliation_source: source } });
  const routePreflight = await preflightRouteContext(working, verified);
  if (routePreflight.changed) return;
  working = routePreflight.state;
  const preflightLoginPopupEvents = Array.isArray(routePreflight.login_popup_events) ? routePreflight.login_popup_events : [];
  const plan = working.ui_action_plan || { steps: [] };
  const clickIndex = Number(pending.step_index || 0);
  const remainingSteps = Array.isArray(plan.steps) ? plan.steps.slice(Math.max(0, clickIndex)) : [];
  await visibleAvitoDelay(working, "after_dispatched_click_before_reconciliation_capture", uiClickReconcileCollectionDelayMs(plan, remainingSteps));
  let resumed = null;
  let blockedReason = null;
  if (remainingSteps.some((step) => String(step?.type || "").toUpperCase() === "CLICK")) {
    blockedReason = "UI_CLICK_CONTINUATION_SECOND_CLICK_NOT_SUPPORTED";
    resumed = { ok: false, url: verified.url || null, plan_fingerprint: plan.plan_fingerprint || "", steps: [], listings: [], listing_details: null, blocked_reason: blockedReason };
  } else if (remainingSteps.length) {
    resumed = await executeAvitoUiActionPlan(verified.id, working.current_window_id, { ...plan, steps: remainingSteps, step_index_offset: clickIndex });
    blockedReason = resumed.blocked_reason || null;
  } else {
    const snapshot = await diagnoseAvito(verified.id, working.current_window_id, { scope: "PAGE_MAIN_VISIBLE" });
    resumed = { ok: !snapshot.blocked_reason, url: snapshot.url || verified.url || null, plan_fingerprint: plan.plan_fingerprint || "", steps: [], listings: [], listing_details: null, snapshot, blocked_reason: snapshot.blocked_reason || null };
    blockedReason = resumed.blocked_reason;
  }
  const clickStep = { index: clickIndex || null, type: "CLICK", status: "dispatched_reconciled", target_description: pending.target_description || null, text: pending.dispatch_id ? `dispatch_id=${pending.dispatch_id}` : "", navigation_url: verified.url || null };
  const result = {
    ok: !blockedReason && Boolean(resumed?.ok !== false),
    url: resumed?.url || verified.url || pending.page_url || null,
    plan_fingerprint: plan.plan_fingerprint || "",
    steps: [clickStep, ...(Array.isArray(resumed?.steps) ? resumed.steps : [])],
    listings: Array.isArray(resumed?.listings) ? resumed.listings : [],
    listing_details: resumed?.listing_details || null,
    snapshot: resumed?.snapshot || null,
    login_popup_events: [...preflightLoginPopupEvents, ...(Array.isArray(resumed?.login_popup_events) ? resumed.login_popup_events : [])],
    blocked_reason: blockedReason
  };
  working = await rememberRouteContext(working, await captureRouteContext(verified.id, working.current_window_id), "ui_click_handoff_completed");
  const actionPlan = { search_id: working.search_id, mode: "AVITO_UI", captured_at: new Date().toISOString(), avito: result };
  const report = Core.formatUiActionPlanReport(actionPlan);
  await storageSet({ [INSPECTION_KEY]: actionPlan });
  const ready = await saveState({ ...working, status: "REPORT_READY_FOR_DELIVERY", phase: "AVITO_UI_CLICK_HANDOFF_REPORT_READY", report, report_kind: "ui_action_plan", blocked_reason: result.blocked_reason, pending_ui_click: { ...pending, reconciliation: "completed" } });
  await log("AVITO_UI_CLICK_RECONCILIATION_CAPTURED", { search_id: ready.search_id, tab_id: verified.id, dispatch_id: pending.dispatch_id || null, source, resumed_step_count: Array.isArray(resumed?.steps) ? resumed.steps.length : 0, blocked_reason: result.blocked_reason || null });
  await deliverReportToPinnedChat(ready, report, "ui_action_plan");
}
async function startUiClickReconciliation(state, tabId, error) {
  const latest = await getState();
  if (latest.search_id !== state.search_id || !pendingUiClickMatches(latest, tabId)) return false;
  const deadline = new Date(Date.now() + UI_CLICK_RECONCILE_TIMEOUT_MS).toISOString();
  const waiting = await saveState({ ...latest, status: "WAITING_FOR_UI_CLICK_RECONCILIATION", phase: "AVITO_UI_CLICK_HANDOFF", blocked_reason: null, ui_click_reconcile_deadline_at: deadline, pending_ui_click: { ...latest.pending_ui_click, reconciliation: "waiting" } });
  await log("AVITO_UI_CHANNEL_CLOSED_AFTER_CLICK_DISPATCH", { search_id: waiting.search_id, tab_id: tabId, dispatch_id: waiting.pending_ui_click?.dispatch_id || null, step_index: waiting.pending_ui_click?.step_index || null, reason: String(error?.message || error).slice(0, 220), deadline_at: deadline });
  // Reconcile immediately: the navigation may already be complete when the
  // old content-script response channel closes. If it is not ready yet, the
  // bounded reconciler schedules its next readiness check itself.
  scheduleUiClickReconcile(waiting, 0);
  return true;
}
async function reconcilePendingUiClickHandoff() {
  const state = await getState();
  if (state.status !== "WAITING_FOR_UI_CLICK_RECONCILIATION" || !state.avito_tab_id || !pendingUiClickMatches(state, state.avito_tab_id)) return;
  const deadline = Date.parse(state.ui_click_reconcile_deadline_at || "");
  const sourceTab = await getTab(state.avito_tab_id);
  if (!sourceTab) { await finishUiClickReconciliationFailure(state, `UI_CLICK_RECONCILIATION_TAB_MISSING:${state.avito_tab_id}`); return; }
  if (sourceTab.windowId !== state.current_window_id) { await finishUiClickReconciliationFailure(state, `UI_CLICK_RECONCILIATION_TAB_WINDOW_MISMATCH:${state.avito_tab_id}`); return; }
  const target = await choosePendingUiClickNavigationTab(state);
  if (target?.tab) { await completeUiClickReconciliation(state, target.tab, target.source); return; }
  if (Number.isFinite(deadline) && Date.now() >= deadline) { await finishUiClickReconciliationFailure(state, `UI_CLICK_NAVIGATION_UNCONFIRMED:${state.avito_tab_id}`); return; }
  scheduleUiClickReconcile(state);
}
async function recoverAvitoIpBlockAndReload(state, tab, previousTimeOrigin, source) {
  const attempt = Number(state.avito_ip_block_reload_count || 0) + 1;
  if (attempt > AVITO_IP_BLOCK_AUTO_RECOVERY_MAX) return null;
  state = await saveState({ ...state, status: "WAITING_FOR_AVITO_PAGE_READY", phase: "AVITO_IP_BLOCK_PROXY_RECOVERY_VERIFYING", blocked_reason: null });
  await log("AVITO_IP_BLOCK_PROXY_RECOVERY_VERIFYING", { search_id: state.search_id, tab_id: tab.id, attempt, source });

  let rotation = { ok: false, strategy: "egress_verification_failed", error: null };
  try {
    rotation = await forceProxyExitRotation(attempt, state.search_id);
  } catch (error) {
    rotation = { ok: false, strategy: "egress_verification_failed", error: proxyErrorText(error) };
    await log("PROXY_IP_BLOCK_RECOVERY_ROTATION_FAILED", { search_id: state.search_id, attempt, error: rotation.error });
  }

  const runtimeBeforeDecision = await getProxyRuntime();
  const recoveryRecord = {
    at: new Date().toISOString(),
    attempt,
    strategy: rotation.strategy || "unknown",
    profile_id: rotation.profile_id || null,
    ok: rotation.ok === true,
    egress_before: rotation.egress_before || null,
    egress_after: rotation.egress_after || null,
    samples: Array.isArray(rotation.samples) ? rotation.samples.slice(0, 6) : [],
    auto_created_profile_id: rotation.auto_created_profile_id || runtimeBeforeDecision.auto_created_recovery_profile_id || null,
    error: rotation.error || null
  };
  await saveProxyRuntime({
    ...runtimeBeforeDecision,
    ip_block_recovery_count: Number(runtimeBeforeDecision.ip_block_recovery_count || 0) + 1,
    last_ip_block_recovery: recoveryRecord
  });

  if (rotation.ok !== true) {
    const blocked = await blockAvitoPageReady(state, `PROXY_EGRESS_ROTATION_UNVERIFIED:${rotation.error || rotation.strategy || "unknown"}`, {
      source,
      attempt,
      strategy: rotation.strategy || "unknown",
      profile_id: rotation.profile_id || null,
      egress_before: rotation.egress_before || null,
      egress_after: rotation.egress_after || null
    });
    await log("AVITO_IP_BLOCK_PROXY_RECOVERY_NOT_RELOADED", {
      search_id: state.search_id,
      tab_id: tab.id,
      attempt,
      strategy: rotation.strategy || "unknown",
      error: rotation.error || null,
      reason: "EGRESS_NOT_VERIFIED"
    });
    return blocked;
  }

  const retryDeadline = new Date(Date.now() + AVITO_READY_TIMEOUT_MS).toISOString();
  const reloading = await saveState({
    ...state,
    status: "WAITING_FOR_AVITO_PAGE_READY",
    phase: "AVITO_IP_BLOCK_PROXY_RECOVERY",
    avito_tab_id: tab.id,
    avito_navigation_expected: false,
    avito_navigation_from_url: null,
    avito_requested_url: tab.url || state.avito_requested_url || null,
    avito_reload_expected: true,
    avito_reload_previous_time_origin: Number(previousTimeOrigin || 0),
    avito_ip_block_reload_count: attempt,
    avito_ready_deadline_at: retryDeadline,
    blocked_reason: null
  });

  await log("AVITO_IP_BLOCK_PROXY_RECOVERY_REQUESTED", {
    search_id: reloading.search_id,
    tab_id: tab.id,
    requested_url: reloading.avito_requested_url || null,
    attempt,
    max_attempts: AVITO_IP_BLOCK_AUTO_RECOVERY_MAX,
    strategy: rotation.strategy || "unknown",
    profile_id: rotation.profile_id || null,
    egress_before: rotation.egress_before || null,
    egress_after: rotation.egress_after || null,
    source,
    bypass_cache: true
  });

  await tabsReload(tab.id, AVITO_IP_BLOCK_RELOAD_PROPERTIES);
  scheduleAvitoReadyDeadline(reloading);
  return reloading;
}

async function completeAvitoTaskUnlocked(queuedState, readyTab, source, readinessHint = null) {
  const state = await getState();
  if (state.search_id !== queuedState.search_id || state.status !== "WAITING_FOR_AVITO_PAGE_READY" || state.avito_tab_id !== readyTab.id) return;
  if (deadlineExpired(state)) {
    const finalProbe = readinessHint || await probeAvitoPageReadiness(readyTab, state.current_window_id, state);
    await blockAvitoPageReady(state, `AVITO_PAGE_READY_TIMEOUT:${readyTab.id}`, { source, tab: shortTab(readyTab), readiness: finalProbe });
    return;
  }
  const readiness = readinessHint?.ready ? readinessHint : await probeAvitoPageReadiness(readyTab, state.current_window_id, state);
  if (!readiness.ready) return;
  const role = state.command_mode === "DIAGNOSE_DOM" ? "avito_diagnose_dom" : (state.command_mode === "AVITO_UI" ? "avito_ui_action_plan" : "avito_inspect_filters");
  const activeAvito = await activate(readyTab, role);
  let verified;
  try {
    verified = await requireReadyAvitoTarget(activeAvito.id, state.current_window_id, state);
  } catch (error) {
    const reason = String(error?.message || error || "");
    if (/^AVITO_PAGE_NOT_READY:/i.test(reason) && !deadlineExpired(state)) {
      await log("AVITO_PAGE_READY_TRANSIENT_RETRY", { search_id: state.search_id, tab_id: activeAvito.id, source, reason });
      scheduleAvitoReadyDeadline(state);
      return;
    }
    throw error;
  }
  const latest = await getState(); if (latest.search_id !== state.search_id || latest.status !== "WAITING_FOR_AVITO_PAGE_READY") return;
  clearAvitoReadyDeadline(state.search_id);
  await log("AVITO_PAGE_READY", { search_id: state.search_id, tab: shortTab(verified), source, readiness_source: readiness.source, readiness_probe: readiness.probe || null, mode: state.command_mode });
  const interruption = await probeVisibleAvitoInterruption(verified);
  if (interruption.captcha === true) {
    // Hard manual CAPTCHA boundary is preserved. On first detection only,
    // install the high-priority media allow rule and reload the same visible
    // CAPTCHA once so resources that were blocked before detection can render.
    // The second pass sees the existing allow rule and does not reload again.
    const overrideAdded = await ensureCaptchaMediaOverride(verified.id);
    if (overrideAdded) {
      clearAvitoReadyDeadline(state.search_id);
      const retryDeadline = new Date(Date.now() + AVITO_READY_TIMEOUT_MS).toISOString();
      const reloading = await saveState({
        ...latest,
        status: "WAITING_FOR_AVITO_PAGE_READY",
        phase: "AVITO_CAPTCHA_MEDIA_RELOAD",
        avito_tab_id: verified.id,
        avito_navigation_expected: false,
        avito_navigation_from_url: null,
        avito_requested_url: verified.url || state.avito_requested_url || null,
        avito_reload_expected: true,
        avito_reload_previous_time_origin: Number(interruption.time_origin || 0),
        avito_ready_deadline_at: retryDeadline,
        blocked_reason: null
      });
      await log("TRAFFIC_LITE_CAPTCHA_MEDIA_RELOAD_REQUESTED", { search_id: reloading.search_id, tab_id: verified.id, requested_url: reloading.avito_requested_url || null, previous_time_origin: reloading.avito_reload_previous_time_origin || 0, reload_once: true });
      await tabsReload(verified.id);
      scheduleAvitoReadyDeadline(reloading);
      return;
    }
  } else {
    await clearCaptchaMediaOverride(verified.id);
  }
  if (interruption.ip_block === true && interruption.captcha !== true && Number(state.avito_ip_block_reload_count || 0) < AVITO_IP_BLOCK_AUTO_RECOVERY_MAX) {
    clearAvitoReadyDeadline(state.search_id);
    const recovered = await recoverAvitoIpBlockAndReload(latest, verified, Number(interruption.time_origin || 0), "post_navigation_ip_block");
    if (recovered) return;
  }
  let working = await saveState({ ...latest, status: "AVITO_TAB_ACTIVE", phase: state.command_mode === "DIAGNOSE_DOM" ? "DIAGNOSING_DOM" : (state.command_mode === "AVITO_UI" ? "EXECUTING_AVITO_UI_PLAN" : "INSPECTING_FILTERS"), avito_tab_id: verified.id, avito_navigation_expected: false, avito_navigation_from_url: null, avito_requested_url: null, avito_reload_expected: false, avito_reload_previous_time_origin: null, avito_ip_block_reload_count: 0, blocked_reason: null });
  const activationDelay = working.command_mode === "AVITO_UI" && planStartsCollection(working.ui_action_plan) ? 0 : AVITO_VISIBLE_ACTIVATION_DELAY_MS;
  await visibleAvitoDelay(working, "after_avito_activation_before_readonly_capture", activationDelay);
  // The snapshot is intentionally delayed only for visible control flow; it is not used as a source of hidden data.
  const routePreflight = await preflightRouteContext(working, verified);
  if (routePreflight.changed) return;
  working = routePreflight.state;
  const preflightLoginPopupEvents = Array.isArray(routePreflight.login_popup_events) ? routePreflight.login_popup_events : [];
  if (working.command_mode === "DIAGNOSE_DOM") {
    let actionResult = null;
    const diagnosticAction = String(working.diagnostic_request?.action || "").toUpperCase();
    if (diagnosticAction) {
      await visibleAvitoDelay(working, "before_allowlisted_diagnostic_action", AVITO_VISIBLE_PRE_ACTION_DELAY_MS);
      await log("AVITO_DIAGNOSTIC_ACTION_REQUESTED", { search_id: working.search_id, tab_id: verified.id, action: diagnosticAction, scope: working.diagnostic_request?.scope || null });
      actionResult = await performDiagnosticAction(verified.id, working.current_window_id, working.diagnostic_request);
      await log("AVITO_DIAGNOSTIC_ACTION_COMPLETED", { search_id: working.search_id, tab_id: verified.id, action: diagnosticAction, target_description: actionResult.target_description || null, target_text: actionResult.target_text || null });
      await visibleAvitoDelay(working, "after_allowlisted_diagnostic_action_before_capture", AVITO_VISIBLE_POST_ACTION_DELAY_MS);
    }
    const snapshot = await diagnoseAvito(verified.id, working.current_window_id, working.diagnostic_request);
    snapshot.actions_performed = actionResult?.actions_performed || snapshot.actions_performed || "none_read_only";
    await log("AVITO_DOM_SNAPSHOT_CAPTURED", { search_id: working.search_id, tab_id: verified.id, scope: working.diagnostic_request?.scope || null, action: diagnosticAction || null, root_description: snapshot.root_description || null, blocked_reason: snapshot.blocked_reason || null, scope_candidate_count: Array.isArray(snapshot.scope_candidates) ? snapshot.scope_candidates.length : 0, snapshot_fingerprint: snapshot.snapshot_fingerprint || null, truncated: snapshot.truncated === true });
    const observedAfterDiagnostic = await captureRouteContext(verified.id, working.current_window_id);
    if (observedAfterDiagnostic.login_popup && String(working.diagnostic_request?.scope || "").toUpperCase() === "DIALOG_VISIBLE" && !snapshot.blocked_reason) {
      working = await saveState({
        ...working,
        optional_login_dialog_snapshot: {
          snapshot_fingerprint: snapshot.snapshot_fingerprint || "",
          url: observedAfterDiagnostic.url || "",
          captured_at: snapshot.captured_at || new Date().toISOString()
        }
      });
      await log("OPTIONAL_LOGIN_DIALOG_SNAPSHOT_RECORDED", { search_id: working.search_id, tab_id: verified.id, snapshot_fingerprint: snapshot.snapshot_fingerprint || null });
    }
    working = await rememberRouteContext(working, observedAfterDiagnostic, "diagnostic_completed");
    const diagnostic = { search_id: working.search_id, mode: "DIAGNOSE_DOM", captured_at: new Date().toISOString(), avito: snapshot, action: actionResult };
    const report = Core.formatDiagnosticReport(diagnostic);
    await storageSet({ [INSPECTION_KEY]: diagnostic });
    await visibleAvitoDelay(working, "after_readonly_capture_before_chatgpt_return", AVITO_VISIBLE_POST_CAPTURE_DELAY_MS);
    const readyForReport = await saveState({ ...working, status: "REPORT_READY_FOR_DELIVERY", phase: "DIAGNOSTIC_REPORT_READY", report, blocked_reason: snapshot.blocked_reason || null });
    await log("DIAGNOSTIC_REPORT_READY", { search_id: readyForReport.search_id, report_fingerprint: Core.fingerprint(report), scope: working.diagnostic_request?.scope || null });
    await deliverReportToPinnedChat(readyForReport, report, "diagnostic");
    return;
  }
  if (working.command_mode === "AVITO_UI") {
    const plan = working.ui_action_plan || { steps: [] };
    await visibleAvitoDelay(working, "before_generic_ui_action_plan", uiPlanStartDelayMs(plan));
    await log("AVITO_UI_PLAN_REQUESTED", { search_id: working.search_id, tab_id: verified.id, plan_fingerprint: plan.plan_fingerprint || null, step_count: Array.isArray(plan.steps) ? plan.steps.length : 0 });
    let result;
    try {
      const hasExplicitQueueCollection = Array.isArray(plan.steps) && plan.steps.some((step) => ["COLLECT_EXPLICIT_LISTING_QUEUE", "RESUME_EXPLICIT_LISTING_QUEUE"].includes(String(step?.type || "")));
      if (hasExplicitQueueCollection) {
        if (plan.steps.length !== 1) throw new Error("EXPLICIT_PUBLIC_QUEUE_PLAN_MUST_CONTAIN_EXACTLY_ONE_COLLECTION_ACTION");
        result = await runExplicitListingQueue(working, verified, plan);
        working = await getState();
        if (working.search_id !== state.search_id || working.status === "CANCELLED_BY_USER") return;
      } else result = await executeAvitoUiActionPlan(verified.id, working.current_window_id, plan);
    } catch (error) {
      if (asyncResponseChannelClosed(error) && await startUiClickReconciliation(working, verified.id, error)) return;
      throw error;
    }
    if (result?.navigation_handoff?.dispatch_id) {
      await log("AVITO_UI_VISIBLE_ANCHOR_NAVIGATION_HANDOFF", { search_id: working.search_id, tab_id: verified.id, dispatch_id: result.navigation_handoff.dispatch_id, step_index: result.navigation_handoff.step_index || null, expected_navigation_path: result.navigation_handoff.expected_navigation_path || null });
      if (await startUiClickReconciliation(working, verified.id, "VISIBLE_ANCHOR_NAVIGATION_HANDOFF")) return;
      throw new Error("UI_CLICK_RECONCILIATION_START_FAILED");
    }
    for (const step of Array.isArray(result.steps) ? result.steps : []) {
      await log("AVITO_UI_PLAN_STEP_RESULT", { search_id: working.search_id, tab_id: verified.id, index: step.index ?? null, type: step.type || null, status: step.status || null, blocked_reason: step.blocked_reason || null, target_description: step.target_description || null });
    }
    await visibleAvitoDelay(working, "after_generic_ui_action_plan_before_chatgpt_return", uiPlanCompletionDelayMs(plan, result));
    if (!Array.isArray(plan.steps) || !plan.steps.some((step) => ["COLLECT_EXPLICIT_LISTING_QUEUE", "RESUME_EXPLICIT_LISTING_QUEUE"].includes(String(step?.type || "")))) {
      working = await rememberRouteContext(working, await captureRouteContext(verified.id, working.current_window_id), "ui_plan_completed");
    }
    if (preflightLoginPopupEvents.length) result.login_popup_events = [...preflightLoginPopupEvents, ...(Array.isArray(result.login_popup_events) ? result.login_popup_events : [])];
    const actionPlan = { search_id: working.search_id, mode: "AVITO_UI", captured_at: new Date().toISOString(), avito: result };
    const report = Core.formatUiActionPlanReport(actionPlan);
    await storageSet({ [INSPECTION_KEY]: actionPlan });
    const readyForReport = await saveState({ ...working, status: "REPORT_READY_FOR_DELIVERY", phase: "AVITO_UI_PLAN_REPORT_READY", report, blocked_reason: result.blocked_reason || null });
    await log("AVITO_UI_PLAN_REPORT_READY", { search_id: readyForReport.search_id, report_fingerprint: Core.fingerprint(report), plan_fingerprint: result.plan_fingerprint || null, blocked_reason: result.blocked_reason || null });
    await deliverReportToPinnedChat(readyForReport, report, "ui_action_plan");
    return;
  }
  const snapshot = await inspectAvito(verified.id, working.current_window_id);
  working = await rememberRouteContext(working, await captureRouteContext(verified.id, working.current_window_id), "filters_completed");
  await log("AVITO_FILTER_SURFACE_CAPTURED", { search_id: working.search_id, tab_id: verified.id, blocked_reason: snapshot.blocked_reason || null });
  const inspection = { search_id: working.search_id, mode: working.command_mode, captured_at: new Date().toISOString(), avito: snapshot };
  const report = Core.formatInspectionReport(inspection);
  await storageSet({ [INSPECTION_KEY]: inspection });
  await visibleAvitoDelay(working, "after_readonly_capture_before_chatgpt_return", AVITO_VISIBLE_POST_CAPTURE_DELAY_MS);
  const readyForReport = await saveState({ ...working, status: "REPORT_READY_FOR_DELIVERY", phase: "INSPECTION_REPORT_READY", report, blocked_reason: snapshot.blocked_reason || null });
  await log("READONLY_INSPECTION_REPORT_READY", { search_id: readyForReport.search_id, report_fingerprint: Core.fingerprint(report) });
  await deliverReportToPinnedChat(readyForReport, report, "inspection");
}
function buildAvitoTargetRequest(parsed) {
  const request = parsed.mode === "DIAGNOSE_DOM" ? parsed.diagnostic : null;
  const uiPlan = parsed.mode === "AVITO_UI" ? parsed.ui_plan : null;
  const commandUrlEvidence = request?.page_url || uiPlan?.page_url || null;
  const requestedUrl = directPublicAvitoUrl(commandUrlEvidence);
  return {
    request,
    uiPlan,
    requestedUrl,
    commandUrlEvidence,
    purpose: parsed.mode === "DIAGNOSE_DOM" ? "avito_diagnose_dom" : (parsed.mode === "AVITO_UI" ? "avito_ui_action_plan" : "avito_inspect_filters")
  };
}
async function completeAvitoTask(queuedState, readyTab, source, readinessHint = null) {
  return withAvitoCompletionLock(queuedState?.search_id, async () => completeAvitoTaskUnlocked(queuedState, readyTab, source, readinessHint));
}

async function queueAvitoTask(initialState, parsed) {
  const targetRequest = buildAvitoTargetRequest(parsed);
  const avito = await ensureAvitoTarget(initialState, targetRequest.requestedUrl, targetRequest.purpose);
  if (targetRequest.commandUrlEvidence && !targetRequest.requestedUrl) {
    await log("AVITO_COMMAND_URL_REJECTED", { search_id: initialState.search_id, purpose: targetRequest.purpose, requested_url: targetRequest.commandUrlEvidence, bound_tab_id: avito.tab.id, bound_url: avito.tab.url || null });
  }
  const deadline = new Date(Date.now() + AVITO_READY_TIMEOUT_MS).toISOString();
  const state = await saveState({
    ...initialState,
    status: "WAITING_FOR_AVITO_PAGE_READY",
    phase: "AVITO_NAVIGATION",
    avito_tab_id: avito.tab.id,
    avito_tab_created: avito.created,
    avito_target_bound_once: true,
    avito_target_binding_source: avito.source || null,
    avito_navigation_expected: avito.navigated === true,
    avito_navigation_from_url: avito.previous_url || null,
    avito_requested_url: avito.requested_url || targetRequest.requestedUrl || null,
    avito_reload_expected: avito.reload_requested === true,
    avito_reload_previous_time_origin: avito.reload_previous_time_origin || null,
    avito_ip_block_reload_count: 0,
    command_mode: parsed.mode,
    diagnostic_request: targetRequest.request,
    ui_action_plan: targetRequest.uiPlan,
    avito_ready_deadline_at: deadline,
    ui_click_reconcile_deadline_at: null,
    pending_ui_click: null,
    blocked_reason: null
  });
  if (avito.reload_requested === true) {
    const recovered = await recoverAvitoIpBlockAndReload(state, avito.tab, Number(avito.reload_previous_time_origin || 0), "equivalent_route_ip_block");
    if (recovered) {
      const current = await getTab(avito.tab.id);
      if (!current) { await blockAvitoPageReady(recovered, `AVITO_TAB_MISSING:${avito.tab.id}`); return; }
      const readiness = await probeAvitoPageReadiness(current, recovered.current_window_id, recovered);
      if (readiness.ready) { await completeAvitoTask(recovered, current, "ip_block_recovery_immediate", readiness); }
      return;
    }
  }
  const current = await getTab(avito.tab.id);
  if (!current) { await blockAvitoPageReady(state, `AVITO_TAB_MISSING:${avito.tab.id}`); return; }
  if (current.windowId !== state.current_window_id) { await blockAvitoPageReady(state, `AVITO_TAB_WINDOW_MISMATCH:${avito.tab.id}`, { actual_tab: shortTab(current) }); return; }
  const readiness = await probeAvitoPageReadiness(current, state.current_window_id, state);
  if (readiness.ready) { await completeAvitoTask(state, current, "immediate", readiness); return; }
  await log("AVITO_TARGET_READY_WAIT_STARTED", {
    search_id: state.search_id,
    tab: shortTab(current),
    required_url_prefix: "https://www.avito.ru/",
    readiness_gate: "tab_complete_or_content_probe",
    initial_readiness_source: readiness.source,
    initial_readiness_probe: readiness.probe || null,
    deadline_at: deadline,
    poll_ms: AVITO_READY_POLL_MS,
    mode: parsed.mode,
    target_source: avito.source || null,
    reused: avito.reused === true,
    navigation_expected: state.avito_navigation_expected === true,
    navigation_from_url: state.avito_navigation_from_url || null,
    requested_url: state.avito_requested_url || null
  });
  scheduleAvitoReadyDeadline(state);
}
async function reconcilePendingAvitoReadiness() {
  const state = await getState(); if (state.status !== "WAITING_FOR_AVITO_PAGE_READY" || !state.avito_tab_id) return;
  const tab = await getTab(state.avito_tab_id);
  if (!tab) { await blockAvitoPageReady(state, `AVITO_TAB_MISSING:${state.avito_tab_id}`, { source: "reconcile" }); return; }
  if (tab.windowId !== state.current_window_id) { await blockAvitoPageReady(state, `AVITO_TAB_WINDOW_MISMATCH:${state.avito_tab_id}`, { source: "reconcile", actual_tab: shortTab(tab) }); return; }
  const readiness = await probeAvitoPageReadiness(tab, state.current_window_id, state);
  if (readiness.ready) { await completeAvitoTask(state, tab, "reconcile", readiness); return; }
  if (deadlineExpired(state)) {
    await blockAvitoPageReady(state, `AVITO_PAGE_READY_TIMEOUT:${state.avito_tab_id}`, { source: "reconcile", tab: shortTab(tab), readiness });
    return;
  }
  scheduleAvitoReadyDeadline(state);
}

function diagnosticFields(details = {}) {
  const allowed = ["code", "anchor_turn_id", "assistant_turn_id", "copy_mode", "copy_ready", "assistant_finality_confirmed", "structural_signature", "trace_id", "anchor_mode", "anchor_policy", "anchor_selection", "candidate_turn_id", "candidate_text_fingerprint", "candidate_text_length", "candidate_position", "baseline_user_turn_count", "candidate_count", "rejection_reason", "event_source", "payload_extracted", "payload_bytes", "payload_extraction_error", "composer_scope", "composer_anchor", "embedded_editor_detected", "form_path", "buttons", "run_id", "conversation_id", "chat_path", "phase", "expected_assistant_turn_id", "expected_origin", "poll_generation", "form_key"];
  const result = {}; for (const key of allowed) if (details[key] !== undefined) result[key] = details[key]; return result;
}
async function observeManualContextChange(tabId, reason) {
  const state = await getState();
  if (state.status !== "WAITING_FOR_NEXT_ASSISTANT_FORM" || state.avito_tab_id !== tabId || !state.last_route_context) return;
  const tab = await getTab(tabId);
  if (!tab || tab.windowId !== state.current_window_id || !Core.isAvitoUrl(tab.url || "") || tab.status !== "complete") return;
  const current = await captureRouteContext(tabId, state.current_window_id);
  if (!Core.routeContextChanged(state.last_route_context, current)) return;
  const fingerprint = Core.routeContextFingerprint(current);
  if (state.last_context_report_fingerprint === fingerprint) return;
  const journal = Core.appendRouteContext(state.route_journal, current, "manual_context_changed");
  const report = Core.formatRouteContextReport(state.search_id, state.last_route_context, current, journal, reason || "VISIBLE_AVITO_CONTEXT_CHANGED");
  const prepared = await saveState({ ...state, last_route_context: current, route_journal: journal, last_context_report_fingerprint: fingerprint, status: "ROUTE_CONTEXT_CHANGED_REPORT_READY", phase: "ROUTE_CONTEXT_RECONCILIATION", report, report_kind: "route_context_changed", blocked_reason: reason || "VISIBLE_AVITO_CONTEXT_CHANGED" });
  await log("VISIBLE_AVITO_CONTEXT_CHANGED", { search_id: prepared.search_id, reason: reason || "VISIBLE_AVITO_CONTEXT_CHANGED", previous: Core.routeContextFingerprint(state.last_route_context), current: fingerprint });
  await deliverReportToPinnedChat(prepared, report, "route_context_changed");
}
async function reportAvitoTabClosed(tabId) {
  const state = await getState();
  if (state.status !== "WAITING_FOR_NEXT_ASSISTANT_FORM" || state.avito_tab_id !== tabId) return;
  const previous = state.last_route_context || null;
  const report = Core.formatRouteContextReport(state.search_id, previous, null, state.route_journal, "AVITO_TAB_CLOSED_BY_USER");
  const prepared = await saveState({ ...state, avito_tab_id: null, avito_target_bound_once: false, avito_target_binding_source: null, last_route_context: null, status: "ROUTE_CONTEXT_CHANGED_REPORT_READY", phase: "ROUTE_CONTEXT_RECONCILIATION", report, report_kind: "route_context_changed", blocked_reason: "AVITO_TAB_CLOSED_BY_USER" });
  await log("AVITO_TAB_CLOSED_BY_USER", { search_id: prepared.search_id, tab_id: tabId });
  await deliverReportToPinnedChat(prepared, report, "route_context_changed");
}
async function reconcileBlockedReport(existingState = null) {
  const state = existingState || await getState();
  if (!state?.report || !["REPORT_DELIVERY_BLOCKED", "REPORT_DELIVERY_IN_PROGRESS", "REPORT_READY_IN_COMPOSER", "REPORT_DELIVERY_UNCERTAIN"].includes(state.status)) {
    return { ok: false, error: "NO_UNCERTAIN_REPORT", state };
  }
  let pinned;
  try { pinned = await assertPinnedChatContext(state, "report_delivery_reconciliation"); }
  catch (error) { return { ok: false, error: String(error?.message || error), state: error.state || await getState() }; }
  let response;
  try {
    response = await sendChat(pinned.tab.id, {
      type: "AF_CAPTURE_RECONCILE_REPORT",
      search_id: state.search_id,
      report_text: state.report,
      previous_anchor_turn_id: state.anchor_turn_id || "",
      expected_identity: pinned.context
    });
  } catch (error) { response = { ok: false, error: String(error?.message || error) }; }
  if (!response?.ok || !Core.sameConversationIdentity(pinned.context, response.identity)) {
    const next = await saveState({ ...state, status: "REPORT_DELIVERY_UNCERTAIN", phase: "CHATGPT_REPORT_RECONCILIATION", blocked_reason: response?.error || "REPORT_RECONCILE_CONTEXT_UNCONFIRMED" });
    await log("REPORT_RECONCILIATION_BLOCKED", { search_id: next.search_id, reason: next.blocked_reason });
    return { ok: false, error: next.blocked_reason, state: next };
  }
  if (response.state === "confirmed" && response.anchor_turn_id) {
    await storageRemove([INSPECTION_KEY]);
    const waiting = await saveState({ ...state, status: "WAITING_FOR_NEXT_ASSISTANT_FORM", phase: "CHATGPT_CONTINUATION", anchor_turn_id: response.anchor_turn_id, report: null, report_kind: null, report_delivery_id: null, sequential_review: continuationSequentialCheckpoint(state.sequential_review), blocked_reason: null });
    const poll = await sendChat(pinned.tab.id, { type: "AF_CAPTURE_BEGIN_PROMPT_POLL", search_id: waiting.search_id, conversation_id: waiting.conversation_id, anchor_turn_id: response.anchor_turn_id, expected_identity: pinned.context });
    const final = poll?.ok ? await saveState({ ...(await getState()), status: "WAITING_FOR_NEXT_ASSISTANT_FORM", phase: "CHATGPT_CONTINUATION", anchor_turn_id: response.anchor_turn_id, blocked_reason: null }) : await saveState({ ...(await getState()), status: "WAITING_FOR_NEXT_ASSISTANT_FORM", phase: "CHATGPT_CONTINUATION", blocked_reason: poll?.error || "NEXT_FORM_POLL_START_FAILED" });
    await log("REPORT_RECONCILED_CONFIRMED", { search_id: final.search_id, anchor_turn_id: response.anchor_turn_id });
    return { ok: true, state: final };
  }
  const nextStatus = response.state === "staged" ? "REPORT_READY_IN_COMPOSER" : "REPORT_DELIVERY_UNCERTAIN";
  const next = await saveState({ ...state, status: nextStatus, phase: "CHATGPT_REPORT_RECONCILIATION", blocked_reason: nextStatus === "REPORT_READY_IN_COMPOSER" ? "REPORT_STILL_IN_PRIMARY_COMPOSER" : "REPORT_ABSENT_AFTER_UNCERTAIN_SEND" });
  await log("REPORT_RECONCILED_NOT_CONFIRMED", { search_id: next.search_id, response_state: response.state || "absent" });
  return { ok: true, state: next };
}
async function begin() {
  const prior = await getState();
  if (prior.report && ["REPORT_DELIVERY_BLOCKED", "REPORT_DELIVERY_IN_PROGRESS", "REPORT_READY_IN_COMPOSER", "REPORT_DELIVERY_UNCERTAIN"].includes(prior.status)) return reconcileBlockedReport(prior);
  let active;
  try { active = await captureActiveChatContext(); } catch (error) {
    const state = await saveState(Core.makeState({ status: "ACTIVE_CHATGPT_CONTEXT_REQUIRED", phase: "CHATGPT_START", blocked_reason: String(error?.message || error), user_started: true })); await log("START_BLOCKED", { search_id: state.search_id, reason: state.blocked_reason }); return { ok: false, state, error: state.blocked_reason };
  }
  const searchId = Core.makeSearchId(); let state = await saveState(Core.makeState({ search_id: searchId, status: "STARTING_BRIDGE_EXACT_CAPTURE", phase: "CHATGPT_START", started_at: new Date().toISOString(), current_window_id: active.context.window_id, chatgpt_tab_id: active.context.tab_id, chatgpt_window_id: active.context.window_id, chat_origin: active.context.origin, chat_path: active.context.chat_path, conversation_id: active.context.conversation_id, user_started: true, inspection_only: true, report: null, avito_tab_id: null, avito_target_bound_once: false, avito_target_binding_source: null, last_route_context: null, route_journal: [], last_context_report_fingerprint: null, sequential_review: null }));
  await log("BRIDGE_EXACT_START_REQUESTED", { search_id: searchId, message_text: "Ищи", tab_id: active.context.tab_id, window_id: active.context.window_id, conversation_id: active.context.conversation_id, chat_path: active.context.chat_path });
  let pinned; try { pinned = await assertPinnedChatContext(state, "chatgpt_start_command"); } catch (error) { return { ok: false, state: error.state || await getState(), error: String(error?.message || error) }; }
  let startResult;
  try { startResult = await sendChat(pinned.tab.id, { type: "AF_CAPTURE_START_AND_ANCHOR", search_id: searchId, message_text: "Ищи", wait_for_conversation_identity: true, expected_identity: pinned.context }); } catch (error) {
    const reason = String(error?.message || error); state = await saveState({ ...state, status: "START_CAPTURE_TRANSPORT_FAILED", phase: "CHATGPT_START", blocked_reason: reason }); await log("START_CAPTURE_TRANSPORT_FAILED", { search_id: searchId, reason }); return { ok: false, state, error: reason };
  }
  if (!startResult?.ok || !startResult.anchor_turn_id || !Core.sameConversationIdentity(pinned.context, startResult.identity)) {
    const reason = startResult?.error || "START_EXACT_ANCHOR_OR_CONTEXT_UNCONFIRMED"; state = await saveState({ ...state, status: "START_CAPTURE_FAILED", phase: "CHATGPT_START", blocked_reason: reason }); await log("START_CAPTURE_FAILED", { search_id: searchId, reason, code: startResult?.code || null }); return { ok: false, state, error: reason };
  }
  state = await saveState({ ...state, status: "WAITING_FOR_ASSISTANT_WRITING_BLOCK", phase: "CHATGPT_CAPTURE", anchor_turn_id: startResult.anchor_turn_id, blocked_reason: null }); await log("BRIDGE_EXACT_START_SENT_AND_ANCHORED", { search_id: searchId, anchor_turn_id: startResult.anchor_turn_id, conversation_id: state.conversation_id, content_script_version: startResult.content_script_version || null });
  const poll = await sendChat(pinned.tab.id, { type: "AF_CAPTURE_BEGIN_PROMPT_POLL", search_id: searchId, conversation_id: state.conversation_id, anchor_turn_id: startResult.anchor_turn_id, expected_identity: pinned.context });
  if (!poll?.ok) { const reason = poll?.error || "PROMPT_POLL_START_FAILED"; state = await saveState({ ...state, status: "PROMPT_POLL_START_FAILED", phase: "CHATGPT_CAPTURE", blocked_reason: reason }); await log("PROMPT_POLL_START_FAILED", { search_id: searchId, reason }); return { ok: false, state, error: reason }; }
  await log("BRIDGE_EXACT_PROMPT_POLL_STARTED", { search_id: searchId, anchor_turn_id: startResult.anchor_turn_id, conversation_id: state.conversation_id }); return { ok: true, state };
}
function validationErrorReport(state, parsed, text) {
  const mode = parsed.mode || "не определён";
  const errors = Array.isArray(parsed.errors) && parsed.errors.length ? parsed.errors.join("; ") : "LOCAL_VALIDATOR_UNSPECIFIED";
  return [
    "Avito Finder: локальный валидатор не смог подготовить действие.",
    "",
    `Задача: ${state.search_id || "?"}`,
    `Текст writing block получен полностью: ${Core.fingerprint(text)}`,
    `Определённый режим: ${mode}`,
    `Причины: ${errors}`,
    "",
    "На Avito ничего не открывалось и не изменялось.",
    "Расширение вернуло ошибку в этот же чат. Следующая команда может быть обычным текстом: фиксированный шаблон не требуется."
  ].join("\n");
}
async function returnValidationErrorToPinnedChat(state, parsed, text) {
  const report = validationErrorReport(state, parsed, text);
  const staged = await saveState({ ...state, status: "VALIDATION_ERROR_REPORT_READY", phase: "LOCAL_EXTENSION_VALIDATION", command_mode: parsed.mode || null, diagnostic_request: null, ui_action_plan: null, blocked_reason: (parsed.errors || []).join("; "), report, report_kind: "validation_error" });
  await log("LOCAL_COMMAND_VALIDATION_FAILED", { search_id: staged.search_id, errors: parsed.errors || [], mode: parsed.mode || null, mode_source: parsed.mode_source || null, text_fingerprint: Core.fingerprint(text) });
  await log("VALIDATION_ERROR_REPORT_READY", { search_id: staged.search_id, report_fingerprint: Core.fingerprint(report), report_kind: "validation_error" });
  return deliverReportToPinnedChat(staged, report, "validation_error");
}
function avitoRuntimeFailureReport(state, reason) {
  return [
    "Avito Finder: действие на Avito остановлено безопасно.",
    "",
    `Задача: ${state.search_id || "?"}`,
    `Этап: ${state.phase || "AVITO_TASK"}`,
    `Причина: ${reason || "AVITO_TASK_FAILED"}`,
    "",
    "Повторные клики, ввод и навигация автоматически не выполнялись.",
    "Расширение вернуло этот отчёт в тот же чат и продолжает ожидать следующую форму."
  ].join("\n");
}
async function returnAvitoRuntimeFailureToPinnedChat(state, reason) {
  const report = avitoRuntimeFailureReport(state, reason);
  const staged = await saveState({
    ...state,
    status: "AVITO_FAILURE_REPORT_READY",
    phase: "AVITO_FAILURE",
    blocked_reason: reason,
    report,
    report_kind: "avito_failure"
  });
  await log("AVITO_FAILURE_REPORT_READY", { search_id: staged.search_id, reason, report_fingerprint: Core.fingerprint(report) });
  return deliverReportToPinnedChat(staged, report, "avito_failure");
}

async function handleFullText(message, sender) {
  let state = await getState(); const candidate = message.candidate && typeof message.candidate === "object" ? message.candidate : {};
  if (!state.search_id || candidate.run_id !== state.search_id) return { ok: true, data: { ignored: true, reason: "SEARCH_ID_MISMATCH" } };
  if (sender?.tab?.id !== state.chatgpt_tab_id) return { ok: true, data: { ignored: true, reason: "SENDER_TAB_MISMATCH" } };
  const expected = contextFromState(state); const actual = { tab_id: sender?.tab?.id ?? null, window_id: sender?.tab?.windowId ?? null, origin: candidate.origin, chat_path: candidate.chat_path, conversation_id: candidate.conversation_id };
  if (!Core.samePinnedChatContext(expected, actual)) {
    const next = await blockConversationContext(state, "FULL_TEXT_CONTEXT_MISMATCH", { actual_conversation_id: actual.conversation_id, actual_chat_path: actual.chat_path, actual_tab: shortTab(sender?.tab) });
    return { ok: true, data: { ignored: true, reason: next.blocked_reason } };
  }
  if (candidate.anchor_turn_id !== state.anchor_turn_id) {
    // A late Copy reply from the prior form is normal around report delivery.
    // Ignore it without changing the pinned conversation or cancelling the newer
    // anchor wait. The current content script will keep waiting for the current
    // same-chat assistant form.
    await log("STALE_FORM_CANDIDATE_IGNORED", { search_id: state.search_id, expected_anchor_turn_id: state.anchor_turn_id, actual_anchor_turn_id: candidate.anchor_turn_id || null, assistant_turn_id: candidate.assistant_turn_id || null, sender_tab_id: sender?.tab?.id ?? null });
    return { ok: true, data: { ignored: true, reason: "STALE_ANCHOR_CANDIDATE", debug: { expected_anchor_turn_id: state.anchor_turn_id, actual_anchor_turn_id: candidate.anchor_turn_id || null, anchor_matches: false } } };
  }
  const text = String(candidate.prompt_text || "");
  const normalizedText = Core.normalizeText(text);
  const claimedPayloadBytes = Number(candidate.payload_bytes || 0);
  // Defense in depth: an old or interrupted content script can never turn a
  // zero-byte renderer shell into a same-chat MODE_UNRESOLVED report. This
  // guard runs before deduplication, state mutation, validation and delivery.
  if (candidate.payload_extracted !== true || !normalizedText || claimedPayloadBytes <= 0) {
    await log("EMPTY_WRITING_BLOCK_CANDIDATE_IGNORED", {
      search_id: state.search_id,
      anchor_turn_id: state.anchor_turn_id,
      assistant_turn_id: candidate.assistant_turn_id || null,
      payload_extracted: candidate.payload_extracted === true,
      payload_bytes: claimedPayloadBytes,
      text_fingerprint: Core.fingerprint(text),
      poll_generation: candidate.poll_generation ?? null
    });
    return {
      ok: true,
      data: {
        ignored: true,
        waiting_payload_extraction: true,
        reason: "EMPTY_WRITING_BLOCK_PAYLOAD_IGNORED"
      }
    };
  }
  const formKey = String(candidate.form_key || `${candidate.anchor_turn_id || ""}|${candidate.assistant_turn_id || ""}|${Core.fingerprint(text)}`);
  if (state.last_consumed_form_key && state.last_consumed_form_key === formKey) {
    await log("DUPLICATE_FORM_CANDIDATE_IGNORED", { search_id: state.search_id, anchor_turn_id: state.anchor_turn_id, assistant_turn_id: candidate.assistant_turn_id || null, form_key: formKey, poll_generation: candidate.poll_generation ?? null });
    return { ok: true, data: { ignored: true, reason: "DUPLICATE_FORM_CANDIDATE" } };
  }
  await log("FULL_WRITING_BLOCK_TEXT_RECEIVED", { search_id: state.search_id, anchor_turn_id: state.anchor_turn_id, assistant_turn_id: candidate.assistant_turn_id || null, payload_bytes: Number(candidate.payload_bytes || 0), payload_extracted: candidate.payload_extracted === true, text_fingerprint: Core.fingerprint(text), form_key: formKey, poll_generation: candidate.poll_generation ?? null });
  state = await saveState({ ...state, status: "FORM_TEXT_CAPTURED_UNVALIDATED", phase: "LOCAL_EXTENSION_VALIDATION", assistant_turn_id: candidate.assistant_turn_id || null, last_consumed_form_key: formKey, blocked_reason: null });
  const parsed = Core.parseCommandForm(text); await log("LOCAL_COMMAND_VALIDATION_COMPLETED", { search_id: state.search_id, valid: parsed.valid, errors: parsed.errors, mode: parsed.mode, mode_source: parsed.mode_source, candidate_count: parsed.candidate_count, candidate_count_source: parsed.candidate_count_source, text_fingerprint: Core.fingerprint(text), form_key: formKey });
  if (!parsed.valid) {
    const delivered = await returnValidationErrorToPinnedChat(state, parsed, text);
    return { ok: true, data: { accepted: true, disposition: "continuation_started", continuation_anchor_turn_id: delivered.anchor_turn_id || null, validation_error_reported: delivered.status === "WAITING_FOR_NEXT_ASSISTANT_FORM", reason: "COMMAND_INVALID_AFTER_FULL_COPY" } };
  }
  if (parsed.mode === "SEARCH") {
    const report = "Avito Finder: локальный валидатор получил команду SEARCH, но этап 5 ТЗ ещё не реализован. Avito не изменялся.";
    const staged = await saveState({ ...state, status: "SEARCH_NOT_IMPLEMENTED_REPORT_READY", phase: "COMMAND_CAPTURED", command_mode: "SEARCH", blocked_reason: "SEARCH_NOT_IMPLEMENTED", report, report_kind: "validation_error" });
    const delivered = await deliverReportToPinnedChat(staged, report, "validation_error");
    return { ok: true, data: { accepted: true, disposition: "continuation_started", continuation_anchor_turn_id: delivered.anchor_turn_id || null, validation_error_reported: delivered.status === "WAITING_FOR_NEXT_ASSISTANT_FORM", reason: "SEARCH_NOT_IMPLEMENTED" } };
  }
  state = await saveState({ ...state, status: "COMMAND_CAPTURED", phase: "COMMAND_CAPTURED", command_mode: parsed.mode, diagnostic_request: parsed.diagnostic || null, ui_action_plan: parsed.ui_plan || null, blocked_reason: null });
  queueAvitoTask(state, parsed).catch(async (error) => {
    const reason = String(error?.message || error);
    const latest = await getState();
    if (latest.search_id !== state.search_id || latest.status === "CANCELLED_BY_USER") return;
    const pageReadyFailure = /^AVITO_(?:PAGE_READY_TIMEOUT|PAGE_NOT_READY|TAB_MISSING|TAB_CLOSED|TAB_WINDOW_MISMATCH|TAB_READ_FAILED)/.test(reason);
    const failed = await saveState({ ...latest, status: pageReadyFailure ? "BLOCKED_AVITO_PAGE_READY" : "FAILED_WITH_EVIDENCE", phase: latest.phase || "AVITO_TASK", blocked_reason: reason });
    await log(pageReadyFailure ? "AVITO_PAGE_READY_BLOCKED" : "AVITO_TASK_BLOCKED", { search_id: state.search_id, reason });
    // Bridge-style handoff invariant: after an accepted writing block, every
    // terminal local failure becomes a same-chat user-turn report. A failure may
    // never leave the capture poll stopped behind an assistant writing block.
    await returnAvitoRuntimeFailureToPinnedChat(failed, reason);
  });
  return { ok: true, data: { accepted: true, disposition: "avito_task_queued" } };
}
async function resumeSequentialReviewFromPopup(state) {
  const checkpoint = state?.sequential_review;
  if (!checkpoint || !Array.isArray(checkpoint.candidates) || checkpoint.status === "completed") return { ok: false, error: "NO_RESUMABLE_SEQUENTIAL_REVIEW" };
  const parent = await getTab(checkpoint.parent_tab_id);
  if (!parent || parent.windowId !== checkpoint.parent_window_id || !Core.isAvitoUrl(parent.url || "")) return { ok: false, error: "SEQUENTIAL_PARENT_TAB_MISSING" };
  const plan = { page_url: parent.url, timing_profile: "COLLECTION_FAST", steps: [{ type: "RESUME_EXPLICIT_LISTING_QUEUE", source_line: "popup_resume_explicit_queue" }], plan_fingerprint: Core.fingerprint("popup_resume_explicit_queue") };
  const staged = await saveState({ ...state, status: "COMMAND_CAPTURED", phase: "SEQUENTIAL_REVIEW_RESUME_REQUESTED", command_mode: "AVITO_UI", ui_action_plan: plan, avito_tab_id: parent.id, blocked_reason: null });
  await log("SEQUENTIAL_REVIEW_POPUP_RESUME_REQUESTED", { search_id: staged.search_id, parent_tab_id: parent.id, cursor: checkpoint.cursor || 0, captcha_child_tab_id: checkpoint.captcha?.child_tab_id || null });
  queueAvitoTask(staged, { mode: "AVITO_UI", ui_plan: plan }).catch(async (error) => {
    const current = await getState();
    if (current.search_id !== staged.search_id || current.status === "CANCELLED_BY_USER") return;
    const reason = String(error?.message || error);
    const failed = await saveState({ ...current, status: "FAILED_WITH_EVIDENCE", phase: "SEQUENTIAL_REVIEW_RESUME", blocked_reason: reason });
    await log("SEQUENTIAL_REVIEW_RESUME_BLOCKED", { search_id: failed.search_id, reason });
    await returnAvitoRuntimeFailureToPinnedChat(failed, reason);
  });
  return { ok: true, data: { resumed: true, search_id: staged.search_id } };
}
async function continueReport() {
  const state = await getState();
  if (["REPORT_DELIVERY_BLOCKED", "REPORT_DELIVERY_IN_PROGRESS", "REPORT_READY_IN_COMPOSER", "REPORT_DELIVERY_UNCERTAIN"].includes(state.status) && state.report) return reconcileBlockedReport(state);
  if (state.sequential_review && ["WAITING_FOR_NEXT_ASSISTANT_FORM", "SEQUENTIAL_REVIEW_PAUSED", "PAUSED_USER_COMPOSER_OCCUPIED"].includes(state.status)) return resumeSequentialReviewFromPopup(state);
  if (state.status !== "PAUSED_USER_COMPOSER_OCCUPIED" || !state.report) return { ok: false, error: "NO_PENDING_REPORT" };
  const fallbackKind = state.command_mode === "DIAGNOSE_DOM" ? "diagnostic" : (state.command_mode === "AVITO_UI" ? "ui_action_plan" : "inspection");
  const result = await deliverReportToPinnedChat(state, state.report, state.report_kind || fallbackKind);
  return { ok: true, state: result };
}
async function stop() {
  const old = await getState(); clearAvitoReadyDeadline(old.search_id); clearUiClickReconcileDeadline(old.search_id);
  if (old.chatgpt_tab_id && old.conversation_id) { try { const pinned = await assertPinnedChatContext(old, "chatgpt_stop"); await sendChat(pinned.tab.id, { type: "AF_CAPTURE_STOP", expected_identity: pinned.context }); } catch (error) { await log("CAPTURE_STOP_CONTEXT_BLOCKED", { search_id: old.search_id, reason: String(error?.message || error) }); } }
  const state = await saveState({ ...old, status: "CANCELLED_BY_USER", phase: "STOPPED", blocked_reason: "CANCELLED_BY_USER", user_started: false }); await log("STOPPED_BY_USER", { search_id: state.search_id }); return state;
}
async function view() { await reconcilePendingAvitoReadiness(); await reconcilePendingUiClickHandoff(); const raw = await storageGet([STATE_KEY, LOG_KEY, INSPECTION_KEY]); return { ok: true, state: Core.makeState(raw[STATE_KEY] || {}), logs: raw[LOG_KEY] || [], inspection: raw[INSPECTION_KEY] || null, proxy: await proxyView() }; }
async function recoverContinuousPromptPoll(message, sender) {
  let state = await getState();
  if (!["WAITING_FOR_NEXT_ASSISTANT_FORM", "PAUSED_CHAT_CONTEXT_CHANGED"].includes(state.status) || !state.search_id || !state.anchor_turn_id) {
    return { ok: true, data: { resume: false } };
  }
  const expected = contextFromState(state);
  const actual = { tab_id: sender?.tab?.id ?? null, window_id: sender?.tab?.windowId ?? null, origin: message?.identity?.origin || null, chat_path: message?.identity?.chat_path || null, conversation_id: message?.identity?.conversation_id || null };
  if (!Core.samePinnedChatContext(expected, actual)) {
    return { ok: true, data: { resume: false, paused: state.status === "PAUSED_CHAT_CONTEXT_CHANGED", reason: "PINNED_CHAT_NOT_VISIBLE" } };
  }
  if (state.status === "PAUSED_CHAT_CONTEXT_CHANGED") {
    state = await saveState({
      ...state,
      status: state.chat_context_resume_status || "WAITING_FOR_NEXT_ASSISTANT_FORM",
      phase: "CHATGPT_CONTEXT_RECOVERED",
      blocked_reason: null,
      chat_context_resume_status: null,
      chat_context_paused_at: null,
      chat_context_actual_path: null
    });
    await log("CHATGPT_CONTEXT_RECOVERED", { search_id: state.search_id, anchor_turn_id: state.anchor_turn_id, chatgpt_tab_id: state.chatgpt_tab_id, actual_chat_path: actual.chat_path });
  }
  if (state.status !== "WAITING_FOR_NEXT_ASSISTANT_FORM") return { ok: true, data: { resume: false, recovered: true, state } };
  await log("NEXT_FORM_POLL_RECOVERY_GRANTED", { search_id: state.search_id, anchor_turn_id: state.anchor_turn_id, chatgpt_tab_id: state.chatgpt_tab_id });
  return { ok: true, data: { resume: true, search_id: state.search_id, conversation_id: state.conversation_id, anchor_turn_id: state.anchor_turn_id, expected_identity: expected } };
}
async function contextBlockedFromContent(message, sender) {
  const state = await getState();
  if (!state.search_id || message.search_id !== state.search_id || sender?.tab?.id !== state.chatgpt_tab_id) {
    return { ok: true, data: { ignored: true } };
  }
  const actualOrigin = message.actual_identity?.origin || null;
  const samePinnedTab = sender?.tab?.id === state.chatgpt_tab_id && sender?.tab?.windowId === state.chatgpt_window_id;
  if (samePinnedTab && actualOrigin === state.chat_origin) {
    const next = await pauseConversationContext(state, message.reason || "CONTENT_CONTEXT_CHANGED", {
      actual_conversation_id: message.actual_identity?.conversation_id || null,
      actual_chat_path: message.actual_identity?.chat_path || null,
      actual_tab: shortTab(sender?.tab)
    });
    return { ok: true, data: { paused: true, recoverable: true, state: next } };
  }
  const next = await blockConversationContext(state, message.reason || "CONTENT_CONTEXT_CHANGED", {
    actual_conversation_id: message.actual_identity?.conversation_id || null,
    actual_chat_path: message.actual_identity?.chat_path || null,
    actual_tab: shortTab(sender?.tab)
  });
  return { ok: true, data: { blocked: true, state: next } };
}

if (globalThis.__AF_TEST_EXPORTS) {
  globalThis.__AF_TEST_EXPORTS.debuggerInput = { DEBUGGER_ALLOWED_METHODS, validDebuggerBounds, validDebuggerText, validDebuggerOptionText, debuggerSend, inputMouseFocus, inputClearExistingValue, typeVisibleAvitoTargetWithDebugger, clickVisibleTargetWithDebugger, clickVisibleOptionWithDebugger };
  globalThis.__AF_TEST_EXPORTS.uiClickHandoff = { asyncResponseChannelClosed, pendingUiClickMatches, expectedNavigationPathMatches, pendingChildTabIds, isPendingUiClickChildTab, pendingUiClickNavigationMatches };
  globalThis.__AF_TEST_EXPORTS.targetBinding = { ensureAvitoTarget, selectVisibleAvitoTab };
  globalThis.__AF_TEST_EXPORTS.optionalLogin = { preflightRouteContext, isAssistantDirectedOptionalLoginDialogInspection, isAssistantDirectedOptionalLoginGenericClick, optionalLoginPreflightDisposition };
  globalThis.__AF_TEST_EXPORTS.readiness = { normalizedVisibleAvitoUrl, sameVisibleAvitoRoute, avitoNavigationCommitObserved, avitoReadyProbeAccepted, probeAvitoPageReadiness, sequentialCardUrlState, fixedAvitoReadyDomProbe, AVITO_IP_BLOCK_RELOAD_PROPERTIES };
}
const proxyAuthAttempts = new Map();
function proxyAuthAttemptKey(details) {
  const host = ProxyCore.text(details?.challenger?.host, 255).replace(/^\[|\]$/g, "").toLowerCase();
  const port = ProxyCore.int(details?.challenger?.port, null);
  return `${String(details?.requestId || "unknown")}|${host}|${port || ""}`;
}
if (chrome.webRequest?.onAuthRequired?.addListener) {
  chrome.webRequest.onAuthRequired.addListener((details, callback) => {
    if (!details?.isProxy) { callback({}); return; }
    Promise.all([getProxySecret(), getProxyRuntime()]).then(async ([secret, runtime]) => {
      const profile = (secret.profiles || []).find((item) => String(item.id) === String(secret.active_profile_id || runtime.selected_profile_id || ""));
      const activeProxyMode = runtime.mode === "proxy" && Boolean(profile);
      if (!activeProxyMode || (!profile.login && !profile.password)) { callback({}); return; }

      const challengeMatches = ProxyCore.challengerMatchesProfile(details, profile);
      if (!challengeMatches) {
        const failureAt = new Date().toISOString();
        await patchProxyDiagnostics({ last_auth_failure_at: failureAt, last_auth_failure: "PROXY_AUTH_CHALLENGER_MISMATCH" });
        await log("PROXY_AUTH_CHALLENGER_MISMATCH", { challenger_host: ProxyCore.text(details.challenger?.host, 255), challenger_port: ProxyCore.int(details.challenger?.port, null), expected_host: profile.host, expected_port: profile.http_port, request_type: details.type || null });
        callback({ cancel: true });
        return;
      }

      const key = proxyAuthAttemptKey(details);
      const attempts = (proxyAuthAttempts.get(key) || 0) + 1;
      proxyAuthAttempts.set(key, attempts);
      setTimeout(() => proxyAuthAttempts.delete(key), 120000);

      if (attempts > PROXY_AUTH_MAX_ATTEMPTS_PER_REQUEST) {
        const failureAt = new Date().toISOString();
        await patchProxyDiagnostics({ last_auth_failure_at: failureAt, last_auth_failure: "PROXY_AUTH_RETRY_LIMIT" });
        await log("PROXY_AUTH_RETRY_LIMIT", { host: ProxyCore.text(details.challenger?.host, 255), port: ProxyCore.int(details.challenger?.port, null), request_type: details.type || null, attempts });
        callback({ cancel: true });
        return;
      }

      const authAt = new Date().toISOString();
      await patchProxyDiagnostics({ last_auth_at: authAt, last_auth_host: ProxyCore.text(details.challenger?.host, 255), last_auth_port: ProxyCore.int(details.challenger?.port, null), last_auth_attempt: attempts, last_auth_failure_at: null, last_auth_failure: null });
      await log("PROXY_AUTH_CREDENTIALS_SUPPLIED", { host: ProxyCore.text(details.challenger?.host, 255), port: ProxyCore.int(details.challenger?.port, null), request_type: details.type || null, attempt: attempts });
      callback({ authCredentials: { username: profile.login || "", password: profile.password || "" } });
    }).catch(async (error) => {
      const failureAt = new Date().toISOString();
      try { await patchProxyDiagnostics({ last_auth_failure_at: failureAt, last_auth_failure: "PROXY_AUTH_HANDLER_ERROR" }); } catch (_) {}
      try { await log("PROXY_AUTH_HANDLER_ERROR", { error: String(error?.message || error).slice(0, 200) }); } catch (_) {}
      callback({ cancel: true });
    });
  }, { urls: ["https://avito.ru/*", "https://*.avito.ru/*", "http://avito.ru/*", "http://*.avito.ru/*", "https://api.ipify.org/*", "https://api64.ipify.org/*"] }, ["asyncBlocking"]);
}
if (chrome.webRequest?.onActionIgnored?.addListener) {
  chrome.webRequest.onActionIgnored.addListener((details) => {
    if (details?.action !== "auth_credentials") return;
    log("PROXY_AUTH_ACTION_IGNORED", { request_id: String(details.requestId || ""), action: details.action }).catch(() => {});
  });
}
if (chrome.proxy?.onProxyError?.addListener) {
  chrome.proxy.onProxyError.addListener((details) => {
    const at = new Date().toISOString();
    const errorText = String(details?.error || details?.details || "").slice(0, 240);
    patchProxyDiagnostics({ last_proxy_error_at: at, last_proxy_error: errorText }).catch(() => {});
    log("PROXY_ERROR", { fatal: details?.fatal === true, error: String(details?.error || ""), details: String(details?.details || "").slice(0, 240) }).catch(() => {});
  });
}
if (chrome.webRequest?.onCompleted?.addListener) {
  chrome.webRequest.onCompleted.addListener((details) => {
    if (details?.type !== "main_frame") return;
    const at = new Date().toISOString();
    patchProxyDiagnostics({ last_avito_main_frame_at: at, last_avito_status_code: ProxyCore.int(details.statusCode, null), last_avito_tab_id: details.tabId ?? null, last_avito_request_id: String(details.requestId || ""), last_avito_error_at: null, last_avito_error: null }).catch(() => {});
    log("AVITO_MAIN_FRAME_COMPLETED", { status_code: ProxyCore.int(details.statusCode, null), tab_id: details.tabId ?? null, from_cache: details.fromCache === true, request_id: String(details.requestId || "") }).catch(() => {});
  }, { urls: ["https://avito.ru/*", "https://*.avito.ru/*"] });
}
if (chrome.webRequest?.onErrorOccurred?.addListener) {
  chrome.webRequest.onErrorOccurred.addListener((details) => {
    if (details?.type !== "main_frame") return;
    const at = new Date().toISOString();
    const errorText = String(details.error || "").slice(0, 240);
    patchProxyDiagnostics({ last_avito_error_at: at, last_avito_error: errorText, last_avito_tab_id: details.tabId ?? null, last_avito_request_id: String(details.requestId || "") }).catch(() => {});
    log("AVITO_MAIN_FRAME_ERROR", { error: errorText, tab_id: details.tabId ?? null, from_cache: details.fromCache === true, request_id: String(details.requestId || "") }).catch(() => {});
    if (!PROXY_TRANSPORT_RECOVERABLE_ERRORS.has(errorText)) return;
    (async () => {
      const state = await getState();
      if (!state.search_id || state.status !== "WAITING_FOR_AVITO_PAGE_READY" || state.avito_tab_id !== details.tabId) return;
      if (String(state.phase || "").startsWith("AVITO_IP_BLOCK_PROXY_RECOVERY")) return;
      if (Number(state.avito_ip_block_reload_count || 0) >= AVITO_IP_BLOCK_AUTO_RECOVERY_MAX) return;
      const runtime = await getProxyRuntime();
      if (runtime.mode !== "proxy") return;
      await withAvitoCompletionLock(state.search_id, async () => {
        const latest = await getState();
        if (latest.status !== "WAITING_FOR_AVITO_PAGE_READY" || latest.avito_tab_id !== details.tabId || String(latest.phase || "").startsWith("AVITO_IP_BLOCK_PROXY_RECOVERY")) return;
        const tab = await getTab(details.tabId);
        if (!tab) return;
        clearAvitoReadyDeadline(latest.search_id);
        await log("AVITO_PROXY_TRANSPORT_ERROR_RECOVERY_STARTED", { search_id: latest.search_id, tab_id: details.tabId, error: errorText });
        await recoverAvitoIpBlockAndReload(latest, tab, 0, "proxy_transport_error");
      });
    })().catch((error) => log("AVITO_PROXY_TRANSPORT_ERROR_RECOVERY_FAILED", { tab_id: details.tabId ?? null, error: proxyErrorText(error) }).catch(() => {}));
  }, { urls: ["https://avito.ru/*", "https://*.avito.ru/*"] });
}

chrome.runtime.onInstalled.addListener(async (details) => { try { if (chrome.storage.local.setAccessLevel) await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }); } catch (_) {} const current = await getState(); await saveState(current); const runtime = await migrateLegacyProxyProfiles(details); const active = runtime.mode === "proxy" && runtime.data_saver_enabled !== false; try { await syncProxyDataSaverRules(active); } catch (_) {} await saveProxyRuntime({ ...runtime, data_saver_active: active }); await log("EXTENSION_INSTALLED_OR_UPDATED", { version: chrome.runtime.getManifest().version }); });
chrome.tabs.onCreated.addListener((tab) => { (async () => {
  if (Core.isAvitoUrl(String(tab?.pendingUrl || tab?.url || ""))) await ensureTrafficLiteForAvitoTab(tab);
  const accepted = await rememberPendingUiClickChildTab(tab, "tabs.onCreated");
  if (accepted) reconcilePendingUiClickHandoff().catch(() => {});
})().catch(() => {}); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => { (async () => {
  const updatedUrl = String(changeInfo.url || tab?.pendingUrl || tab?.url || "");
  if (updatedUrl && Core.isAvitoUrl(updatedUrl)) await ensureTrafficLiteForAvitoTab(tab || { id: tabId, url: updatedUrl });
  else if (changeInfo.url && !Core.isAvitoUrl(changeInfo.url)) await removeTrafficLiteRulesForTab(tabId);
  if (tab) await rememberPendingUiClickChildTab(tab, "tabs.onUpdated");
  reconcilePendingAvitoReadiness().catch(async (error) => { const state = await getState(); if (state.status === "WAITING_FOR_AVITO_PAGE_READY") await blockAvitoPageReady(state, `AVITO_READY_EVENT_FAILED:${String(error?.message || error)}`); });
  reconcilePendingUiClickHandoff().catch(async (error) => { const state = await getState(); if (state.status === "WAITING_FOR_UI_CLICK_RECONCILIATION") await finishUiClickReconciliationFailure(state, `UI_CLICK_RECONCILIATION_EVENT_FAILED:${String(error?.message || error)}`); });
  if (changeInfo.status === "complete") setTimeout(() => { observeManualContextChange(tabId, "VISIBLE_AVITO_CONTEXT_CHANGED").catch(() => {}); }, 450);
})().catch(() => {}); });
chrome.tabs.onRemoved.addListener((tabId) => { (async () => {
  await removeTrafficLiteRulesForTab(tabId);
  const state = await getState();
  if (state.status === "WAITING_FOR_AVITO_PAGE_READY" && state.avito_tab_id === tabId) await blockAvitoPageReady(state, `AVITO_TAB_CLOSED:${tabId}`, { source: "tabs.onRemoved" });
  if (state.status === "WAITING_FOR_UI_CLICK_RECONCILIATION" && state.avito_tab_id === tabId) await finishUiClickReconciliationFailure(state, `UI_CLICK_RECONCILIATION_TAB_CLOSED:${tabId}`);
  await reportAvitoTabClosed(tabId);
})().catch(() => {}); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { (async () => { try {
  switch (message?.type) {
    case "AF_START": sendResponse(await begin()); return;
    case "AF_STOP": sendResponse({ ok: true, state: await stop() }); return;
    case "AF_CONTINUE_REPORT": sendResponse(await continueReport()); return;
    case "AF_GET_VIEW": sendResponse(await view()); return;
    case "AF_PROXY_KEY_CHECK": sendResponse(await checkProxyMarketKey(message)); return;
    case "AF_PROXY_KEY_IMPORT": sendResponse(await importProxyKeyBundle(message)); return;
    case "AF_PROXY_KEY_EXPORT": sendResponse(await exportProxyKeyBundle(message)); return;
    case "AF_PROXY_MARKET_SYNC": sendResponse(await syncProxyMarket(message)); return;
    case "AF_PROXY_ENDPOINT_CREATE": sendResponse(await createProxyMarketEndpoint(message)); return;
    case "AF_PROXY_MANUAL_PROFILE_SAVE": sendResponse(await saveManualTrafficProfile(message)); return;
    case "AF_PROXY_APPLY": sendResponse(await applyProxyProfile(message.profile_id)); return;
    case "AF_PROXY_DIRECT": sendResponse(await setProxyDirect()); return;
    case "AF_PROXY_DATA_SAVER": sendResponse(await setProxyDataSaver(message.enabled === true)); return;
    case "AF_PROXY_TRAFFIC_REFRESH": sendResponse(await refreshProxyTrafficUsage()); return;
    case "AF_PROXY_DIAGNOSTIC": sendResponse(await proxyDiagnosticView()); return;
    case "AF_PROXY_PROFILE_DETAILS": if (!trustedExtensionUiSender(sender)) { sendResponse({ ok: false, error: "PROXY_PROFILE_DETAILS_FORBIDDEN" }); return; } sendResponse(await getProxyProfileDetails(message.profile_id)); return;
    case "AF_PROXY_PROFILE_DELETE": if (!trustedExtensionUiSender(sender)) { sendResponse({ ok: false, error: "PROXY_PROFILE_DELETE_FORBIDDEN" }); return; } sendResponse(await deleteProxyProfileLocally(message.profile_id)); return;
    case "AF_PROXY_PROFILE_RESTORE": if (!trustedExtensionUiSender(sender)) { sendResponse({ ok: false, error: "PROXY_PROFILE_RESTORE_FORBIDDEN" }); return; } sendResponse(await restoreHiddenProxyProfiles()); return;
    case "AF_CAPTURE_PING": sendResponse({ ok: false, error: "PING_IS_CONTENT_ONLY" }); return;
    case "AF_CAPTURE_GET_SEND_PROFILE": sendResponse({ ok: true, data: null }); return;
    case "AF_CAPTURE_DIAGNOSTIC": await log(`CAPTURE_${message.details?.code || "DIAGNOSTIC"}`, diagnosticFields(message.details)); sendResponse({ ok: true, data: { recorded: true } }); return;
    case "AF_CAPTURE_ACTIVITY": await log("CAPTURE_ACTIVITY", diagnosticFields(message)); sendResponse({ ok: true, data: { recorded: true } }); return;
    case "AF_CAPTURE_CONTEXT_BLOCKED": sendResponse(await contextBlockedFromContent(message, sender)); return;
    case "AF_CAPTURE_FULL_TEXT": sendResponse(await handleFullText(message, sender)); return;
    case "AF_DEBUGGER_TYPE_VISIBLE_TARGET": sendResponse(await typeVisibleAvitoTargetWithDebugger(message, sender)); return;
    case "AF_DEBUGGER_CLICK_VISIBLE_TARGET": sendResponse(await clickVisibleTargetWithDebugger(message, sender)); return;
    case "AF_DEBUGGER_CLICK_VISIBLE_OPTION": sendResponse(await clickVisibleOptionWithDebugger(message, sender)); return;
    case "AF_UI_CLICK_DISPATCHED": sendResponse(await recordUiClickDispatched(message, sender)); return;
    case "AF_CAPTURE_RECOVER_CONTINUOUS": sendResponse(await recoverContinuousPromptPoll(message, sender)); return;
    default: sendResponse({ ok: false, error: "UNKNOWN_MESSAGE" }); return;
  }
} catch (error) { sendResponse({ ok: false, error: String(error?.message || error) }); } })(); return true; });
