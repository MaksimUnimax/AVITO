"use strict";
const $ = (selector) => document.querySelector(selector);
const status = $("#status"), detail = $("#detail"), logs = $("#logs"), report = $("#report");
const start = $("#start"), resume = $("#continue"), stop = $("#stop"), copy = $("#copy");
const assistantPrompt = $("#assistant-prompt"), copyAssistantPrompt = $("#copy-assistant-prompt");

const proxyBadge = $("#proxy-main-badge"), proxyProfile = $("#proxy-profile"), proxyProfileMeta = $("#proxy-profile-meta");
const proxyCredentials = $("#proxy-credentials"), proxyProfileLogin = $("#proxy-profile-login"), proxyProfilePassword = $("#proxy-profile-password"), proxyPasswordToggle = $("#proxy-password-toggle"), proxyCredentialsStatus = $("#proxy-credentials-status");
const proxyMainAction = $("#proxy-main-action"), proxyRemoveProfile = $("#proxy-remove-profile"), proxyStatus = $("#proxy-status");
const proxySync = $("#proxy-sync"), proxyDataSaver = $("#proxy-data-saver"), proxyTrafficRefresh = $("#proxy-traffic-refresh"), proxyTrafficStatus = $("#proxy-traffic-status");
const proxyApiKey = $("#proxy-api-key"), proxyApiKeyToggle = $("#proxy-api-key-toggle"), proxyPackageId = $("#proxy-package-id"), proxyOrderId = $("#proxy-order-id");
const proxyKeyCheck = $("#proxy-key-check"), proxyKeyExport = $("#proxy-key-export"), proxyKeyImportButton = $("#proxy-key-import-button"), proxyKeyImport = $("#proxy-key-import"), proxyKeyStatus = $("#proxy-key-status");
const proxyOperationStatus = $("#proxy-operation-status"), proxyCreateCountry = $("#proxy-create-country"), proxyCreateRotation = $("#proxy-create-rotation"), proxyEndpointCreate = $("#proxy-endpoint-create"), proxyEndpointStatus = $("#proxy-endpoint-status"), proxyRestoreHidden = $("#proxy-restore-hidden");
const proxyDiagnostic = $("#proxy-diagnostic"), proxyDiagnosticStatus = $("#proxy-diagnostic-status");

const send = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
let refreshTimer = null;
let lastProxyView = null;
let lastCredentialProfileId = null;
let profileDetailsGeneration = 0;

function compact(value) { const text = typeof value === "string" ? value : JSON.stringify(value); return text.length > 380 ? `${text.slice(0, 377)}…` : text; }
function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  const units = ["KB", "MB", "GB", "TB"]; let n = bytes / 1024; let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)} ${units[i]}`;
}
function formatMoney(value) { const n = Number(value); return Number.isFinite(n) ? `${n.toFixed(2)} ₽` : "—"; }
function rotationLabel(value) {
  const n = Number(value);
  if (n === -1) return "Sticky";
  if (n === 0) return "Каждый запрос";
  if (Number.isInteger(n) && n >= 1) return `${n} мин`;
  return "Ротация не указана";
}
function proxyFriendlyError(code) {
  const raw = String(code || "");
  const staged = raw.match(/^PROXY_MARKET_(BALANCE|PACKAGES|LIST|CREATE)_HTTP_(\d+|ERROR)$/);
  if (staged) {
    const stageLabel = staged[1] === "BALANCE" ? "проверка ключа" : staged[1] === "PACKAGES" ? "список пакетов" : staged[1] === "CREATE" ? "создание endpoint" : "список прокси";
    return `Proxy.Market: ${stageLabel}, HTTP ${staged[2]}.`;
  }
  const map = {
    PROXY_MARKET_API_KEY_REQUIRED: "API key не введён или не загружен.",
    PROXY_MARKET_HTTP_403: "Proxy.Market отклонил API key.",
    PROXY_MARKET_NO_RESIDENT_PROFILES: "Proxy.Market не вернул residential-профили.",
    PROXY_MARKET_ENDPOINT_EXISTS_LIST_EMPTY: "Endpoint есть, но список профилей пуст.",
    PROXY_MARKET_NO_ENDPOINTS_CREATED: "В пакете ещё нет endpoint. Создай его в настройках.",
    PROXY_PACKAGE_ID_REQUIRED_FOR_CREATE: "Не определён Package ID. Сначала проверь ключ.",
    PROXY_CREATE_COUNTRY_INVALID: "Код страны должен быть двухбуквенным, например ru.",
    PROXY_CREATE_ROTATION_INVALID: "Ротация: -1, 0 или 1–60 минут.",
    PROXY_MUTATION_WAIT_FOR_CURRENT_STEP: "Finder сейчас выполняет шаг. Дождись его завершения — останавливать весь Finder не нужно.",
    PROXY_PROFILE_NOT_FOUND_IN_SESSION: "Профиль не найден. Нажми «Обновить».",
    PROXY_PROFILE_NOT_FOUND: "Профиль не найден.",
    PROXY_PROFILE_REQUIRED: "Выбери профиль.",
    PROXY_KEY_FILE_INVALID: "Неверный файл конфигурации.",
    PROXY_KEY_FILE_FORMAT_UNSUPPORTED: "Формат конфигурации не поддерживается.",
    PROXY_AUTH_RETRY_LIMIT: "Proxy.Market отклонил сохранённые логин/пароль.",
    PROXY_AUTH_CHALLENGER_MISMATCH: "Proxy-auth пришёл не от выбранного gateway.",
    PROXY_ALL_PROFILES_HIDDEN: "Все синхронизированные профили удалены из расширения."
  };
  return map[raw] || raw || "Неизвестная ошибка";
}
function profileLabel(profile) {
  const loc = profile.country ? profile.country.toUpperCase() : "--";
  return `${profile.id} · ${loc} · ${rotationLabel(profile.rotation)}`;
}
function profileMeta(profile) {
  if (!profile) return "Профиль не выбран.";
  const pkg = profile.package_id ? ` · package #${profile.package_id}` : "";
  return `${profile.host}:${profile.http_port || "—"}${pkg}`;
}
function selectedSummary() {
  const profiles = Array.isArray(lastProxyView?.profiles) ? lastProxyView.profiles : [];
  return profiles.find((profile) => String(profile.id) === String(proxyProfile.value || "")) || null;
}
function activeId() { return String(lastProxyView?.active_profile?.id || ""); }
function renderPrimaryAction() {
  const selected = String(proxyProfile.value || "");
  const modeProxy = lastProxyView?.mode === "proxy";
  const active = activeId();
  proxyMainAction.disabled = !selected && !modeProxy;
  proxyRemoveProfile.disabled = !selected;
  proxyMainAction.classList.toggle("off", modeProxy && active === selected);
  if (modeProxy && active === selected) proxyMainAction.textContent = "Выключить прокси";
  else if (modeProxy && active && selected && active !== selected) proxyMainAction.textContent = "Переключить на выбранный";
  else proxyMainAction.textContent = "Включить прокси";
}
function renderProxy(proxy) {
  const p = proxy || {};
  lastProxyView = p;
  const profiles = Array.isArray(p.profiles) ? p.profiles : [];
  const desired = String(proxyProfile.value || p.selected_profile_id || "");
  proxyProfile.textContent = "";
  if (!profiles.length) {
    const option = document.createElement("option"); option.value = ""; option.textContent = "Нет профилей"; proxyProfile.appendChild(option);
  } else {
    for (const profile of profiles) {
      const option = document.createElement("option"); option.value = String(profile.id); option.textContent = `${String(p.active_profile?.id || "") === String(profile.id) ? "● " : ""}${profileLabel(profile)}`; proxyProfile.appendChild(option);
    }
    proxyProfile.value = profiles.some((x) => String(x.id) === desired) ? desired : String(profiles[0].id);
  }
  const selected = selectedSummary();
  proxyProfileMeta.textContent = profileMeta(selected);

  const isOn = p.mode === "proxy" && Boolean(p.active_profile);
  proxyBadge.textContent = isOn ? "ВКЛЮЧЕН" : "ВЫКЛЮЧЕН";
  proxyBadge.className = `proxy-badge ${isOn ? "proxy-badge-on" : "proxy-badge-off"}`;
  if (isOn) {
    const selectedId = String(proxyProfile.value || "");
    const activeProfileId = String(p.active_profile.id || "");
    const selectedProfile = selectedSummary();
    if (selectedProfile && selectedId && selectedId !== activeProfileId) {
      proxyStatus.textContent = `Сейчас активен ${p.active_profile.id} · ${rotationLabel(p.active_profile.rotation)}. Выбран ${selectedProfile.id} · ${rotationLabel(selectedProfile.rotation)} — нажми «Переключить на выбранный».`;
    } else {
      proxyStatus.textContent = `Активен профиль ${p.active_profile.id} · ${rotationLabel(p.active_profile.rotation)} · ${p.active_profile.host}:${p.active_profile.http_port}`;
    }
  } else {
    proxyStatus.textContent = "Прокси выключен. Avito идёт напрямую.";
  }
  if (p.error) proxyStatus.textContent += ` · ${proxyFriendlyError(p.error)}`;
  proxyDataSaver.checked = p.data_saver_enabled !== false;
  renderPrimaryAction();

  const kc = p.key_check || null;
  if (kc?.valid === true) proxyKeyStatus.textContent = `Ключ OK · баланс ${formatMoney(kc.balance)} · package ${kc.suggested_package_id ? `#${kc.suggested_package_id}` : "не выбран"}`;
  else if (kc?.valid === false) proxyKeyStatus.textContent = `Ошибка ключа · ${proxyFriendlyError(kc.error)}`;
  else proxyKeyStatus.textContent = p.key_present ? "Ключ загружен, но не проверен" : "Ключ не загружен";

  if (p.error && p.last_operation !== "PROXY_PROFILE_REMOVED_LOCAL") proxyOperationStatus.textContent = proxyFriendlyError(p.error);
  else if (p.last_operation === "PROXY_MARKET_SYNCED") proxyOperationStatus.textContent = `Профили обновлены: ${profiles.length}`;
  else if (p.last_operation === "PROXY_PROFILE_REMOVED_LOCAL") proxyOperationStatus.textContent = "Профиль удалён из расширения. На Proxy.Market endpoint не удалялся.";
  else if (p.last_operation === "PROXY_HIDDEN_PROFILES_RESTORED") proxyOperationStatus.textContent = "Удалённые профили возвращены.";
  else if (p.last_operation === "PROXY_MARKET_SYNCED_ALL_HIDDEN") proxyOperationStatus.textContent = "Все профили скрыты в расширении.";
  else if (["PROXY_PROFILE_EGRESS_DIAGNOSTIC_APPLIED", "PROXY_PROFILE_EGRESS_BEFORE_FORCE_APPLIED", "PROXY_PROFILE_EGRESS_AFTER_FORCE_APPLIED", "PROXY_PROFILE_EGRESS_VERIFIED", "PROXY_RECOVERY_ENDPOINT_CREATED"].includes(p.last_operation) || p.last_ip_block_recovery) {
    const recovery = p.last_ip_block_recovery || null;
    if (recovery?.ok === true && recovery.egress_before && recovery.egress_after) {
      proxyOperationStatus.textContent = `IP-block: egress подтверждён ${recovery.egress_before} → ${recovery.egress_after}${recovery.attempt ? ` · попытка ${recovery.attempt}` : ""}`;
    } else if (recovery?.ok === false) {
      proxyOperationStatus.textContent = `IP-block: смена egress НЕ подтверждена${recovery.attempt ? ` · попытка ${recovery.attempt}` : ""}${recovery.error ? ` · ${proxyFriendlyError(recovery.error)}` : ""}`;
    } else {
      proxyOperationStatus.textContent = "IP-block: проверяется фактический proxy egress";
    }
  }

  const hidden = Number(p.hidden_profile_count || 0);
  proxyRestoreHidden.textContent = hidden ? `Вернуть удалённые (${hidden})` : "Вернуть удалённые из расширения";
  proxyRestoreHidden.disabled = hidden <= 0;

  const t = p.traffic || null;
  proxyTrafficStatus.textContent = t ? `Трафик: ${formatBytes(t.used)} / ${formatBytes(t.total)} · осталось ${formatBytes(t.remaining)}` : "Трафик: нет данных";

  if (proxyProfile.value && proxyProfile.value !== lastCredentialProfileId) loadSelectedProfileDetails();
  if (!proxyProfile.value) clearProfileDetails();
}
function clearProfileDetails() {
  lastCredentialProfileId = null;
  proxyCredentials.hidden = true;
  proxyProfileLogin.value = "";
  proxyProfilePassword.value = "";
  proxyProfilePassword.type = "password";
  proxyPasswordToggle.textContent = "Показать";
  proxyPasswordToggle.setAttribute("aria-label", "Показать пароль");
}
async function loadSelectedProfileDetails() {
  const id = String(proxyProfile.value || "");
  const generation = ++profileDetailsGeneration;
  if (!id) { clearProfileDetails(); return; }
  const result = await send({ type: "AF_PROXY_PROFILE_DETAILS", profile_id: id });
  if (generation !== profileDetailsGeneration || String(proxyProfile.value || "") !== id) return;
  if (!result?.ok || !result.profile) {
    clearProfileDetails();
    proxyCredentialsStatus.textContent = proxyFriendlyError(result?.error);
    return;
  }
  lastCredentialProfileId = id;
  proxyCredentials.hidden = false;
  proxyProfileLogin.value = result.profile.login || "";
  proxyProfilePassword.value = result.profile.password || "";
  proxyProfilePassword.type = "password";
  proxyPasswordToggle.textContent = "Показать";
  proxyPasswordToggle.setAttribute("aria-label", "Показать пароль");
  proxyCredentialsStatus.textContent = result.profile.login && result.profile.password ? "Логин и пароль сохранены для этого профиля" : "У профиля нет сохранённых credentials";
}
function setProxyBusy(busy) {
  for (const control of [proxySync, proxyMainAction, proxyRemoveProfile, proxyDataSaver, proxyTrafficRefresh, proxyKeyCheck, proxyKeyExport, proxyKeyImportButton, proxyEndpointCreate, proxyRestoreHidden, proxyDiagnostic]) if (control) control.disabled = busy;
  if (!busy) renderPrimaryAction();
}
function toggleSecretField(input, button, showLabel, hideLabel) {
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  button.textContent = show ? hideLabel : showLabel;
  button.setAttribute("aria-label", show ? hideLabel : showLabel);
}
function formatProxyDiagnostic(result) {
  if (!result) return "Нет данных";
  const profile = result.active_profile;
  const endpoint = profile ? `${profile.id} · ${profile.host}:${profile.http_port}` : "нет активного профиля";
  const auth = result.auth_seen_after_apply ? "auth OK" : "auth ещё не наблюдался";
  const page = result.avito_tab ? (result.avito_tab.ip_block ? "Avito: IP BLOCK" : result.avito_tab.normal_avito ? "Avito: OK" : "Avito: нечитаемо") : "Avito-вкладки нет";
  const err = result.last_proxy_error ? ` · ${result.last_proxy_error}` : "";
  return `${result.status} · ${endpoint} · ${auth} · ${page}${err}`;
}
function render(view) {
  const state = view?.state || {};
  status.textContent = state.status || "IDLE";
  detail.textContent = state.blocked_reason || state.phase || state.search_id || "";
  report.value = view?.inspection?.report || state.report || "";
  const sequential = state.sequential_review || null;
  const canResumeSequential = Boolean(sequential && ["paused_for_manual_captcha", "paused_after_test_batch"].includes(sequential.status) && ["WAITING_FOR_NEXT_ASSISTANT_FORM", "SEQUENTIAL_REVIEW_PAUSED", "PAUSED_USER_COMPOSER_OCCUPIED"].includes(state.status));
  resume.textContent = canResumeSequential ? "Продолжить сбор" : "Продолжить отчёт";
  resume.disabled = canResumeSequential ? false : (!["PAUSED_USER_COMPOSER_OCCUPIED", "REPORT_DELIVERY_BLOCKED"].includes(state.status) || !state.report);
  logs.textContent = (view?.logs || []).slice(-100).map((entry) => { const fields = Object.entries(entry).filter(([key]) => key !== "at" && key !== "type").map(([key, value]) => `${key}=${compact(value)}`).join(" "); return `${entry.at || ""} ${entry.type || "EVENT"}${fields ? ` ${fields}` : ""}`; }).join("\n");
  logs.scrollTop = logs.scrollHeight;
  renderProxy(view?.proxy);
}
async function refresh() { const view = await send({ type: "AF_GET_VIEW" }); if (view?.ok) render(view); }

start.addEventListener("click", async () => { start.disabled = true; try { await send({ type: "AF_START" }); } finally { start.disabled = false; await refresh(); } });
resume.addEventListener("click", async () => { resume.disabled = true; try { await send({ type: "AF_CONTINUE_REPORT" }); } finally { await refresh(); } });
stop.addEventListener("click", async () => { await send({ type: "AF_STOP" }); await refresh(); });
copy.addEventListener("click", async () => { if (!report.value) return; try { await navigator.clipboard.writeText(report.value); copy.textContent = "Скопировано"; setTimeout(() => copy.textContent = "Скопировать отчёт", 1200); } catch (_) { report.focus();report.select();document.execCommand("copy"); } });
copyAssistantPrompt.addEventListener("click", async () => { if (!assistantPrompt.value) return; try { await navigator.clipboard.writeText(assistantPrompt.value); copyAssistantPrompt.textContent = "Скопировано"; setTimeout(() => copyAssistantPrompt.textContent = "Скопировать промпт", 1200); } catch (_) { assistantPrompt.focus();assistantPrompt.select();document.execCommand("copy"); } });

proxyProfile.addEventListener("change", () => { lastCredentialProfileId = null; proxyProfileMeta.textContent = profileMeta(selectedSummary()); renderPrimaryAction(); if (lastProxyView) renderProxy({ ...lastProxyView, selected_profile_id: proxyProfile.value }); loadSelectedProfileDetails(); });
proxyPasswordToggle.addEventListener("click", () => toggleSecretField(proxyProfilePassword, proxyPasswordToggle, "Показать", "Скрыть"));
proxyApiKeyToggle.addEventListener("click", () => toggleSecretField(proxyApiKey, proxyApiKeyToggle, "Показать", "Скрыть"));

proxyMainAction.addEventListener("click", async () => {
  const selected = String(proxyProfile.value || "");
  const turnOff = lastProxyView?.mode === "proxy" && activeId() === selected;
  if (!turnOff && !selected) return;
  setProxyBusy(true);
  proxyStatus.textContent = turnOff ? "Выключение…" : "Подключение…";
  try {
    const result = turnOff ? await send({ type: "AF_PROXY_DIRECT" }) : await send({ type: "AF_PROXY_APPLY", profile_id: selected });
    if (result?.proxy) renderProxy(result.proxy);
    if (!result?.ok) proxyStatus.textContent = proxyFriendlyError(result?.error);
  } finally { setProxyBusy(false); await refresh(); }
});

proxyRemoveProfile.addEventListener("click", async () => {
  const id = String(proxyProfile.value || ""); if (!id) return;
  if (!confirm(`Удалить профиль ${id} из расширения? На Proxy.Market endpoint останется.`)) return;
  setProxyBusy(true);
  try {
    const result = await send({ type: "AF_PROXY_PROFILE_DELETE", profile_id: id });
    if (result?.proxy) renderProxy(result.proxy);
    if (!result?.ok) proxyOperationStatus.textContent = proxyFriendlyError(result?.error);
    else { clearProfileDetails(); proxyOperationStatus.textContent = "Профиль удалён из расширения. Endpoint на Proxy.Market не изменён."; }
  } finally { setProxyBusy(false); await refresh(); }
});
proxyRestoreHidden.addEventListener("click", async () => {
  setProxyBusy(true);
  try { const result = await send({ type: "AF_PROXY_PROFILE_RESTORE" }); if (result?.proxy) renderProxy(result.proxy); if (!result?.ok) proxyOperationStatus.textContent = proxyFriendlyError(result?.error); }
  finally { setProxyBusy(false); await refresh(); }
});

proxyKeyCheck.addEventListener("click", async () => {
  setProxyBusy(true); proxyKeyStatus.textContent = "Проверка…";
  try {
    const result = await send({ type: "AF_PROXY_KEY_CHECK", api_key: proxyApiKey.value, package_id: proxyPackageId.value, order_id: proxyOrderId.value });
    if (result?.suggested_package_id && !proxyPackageId.value) proxyPackageId.value = String(result.suggested_package_id);
    if (result?.proxy) renderProxy(result.proxy);
    if (!result?.ok) proxyKeyStatus.textContent = proxyFriendlyError(result?.error);
  } finally { setProxyBusy(false); await refresh(); }
});
proxyKeyExport.addEventListener("click", async () => {
  setProxyBusy(true);
  try {
    const result = await send({ type: "AF_PROXY_KEY_EXPORT", api_key: proxyApiKey.value, package_id: proxyPackageId.value, order_id: proxyOrderId.value });
    if (!result?.ok || !result.bundle) { proxyOperationStatus.textContent = `Экспорт: ${proxyFriendlyError(result?.error)}`; return; }
    const blob = new Blob([`${JSON.stringify(result.bundle, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "avito-finder-proxy-market-config.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    proxyOperationStatus.textContent = "Конфиг скачан.";
  } finally { setProxyBusy(false); await refresh(); }
});
proxyKeyImportButton.addEventListener("click", () => { proxyKeyImport.value = ""; proxyKeyImport.click(); });
proxyKeyImport.addEventListener("change", async () => {
  const file = proxyKeyImport.files?.[0]; if (!file) return;
  if (file.size > 65536) { proxyOperationStatus.textContent = "Файл конфигурации слишком большой."; return; }
  setProxyBusy(true);
  try {
    let bundle; try { bundle = JSON.parse(await file.text()); } catch (_) { proxyOperationStatus.textContent = "Неверный JSON."; return; }
    const result = await send({ type: "AF_PROXY_KEY_IMPORT", bundle });
    if (!result?.ok) { proxyOperationStatus.textContent = proxyFriendlyError(result?.error); return; }
    proxyApiKey.value = String(bundle.api_key || ""); proxyPackageId.value = bundle.package_id == null ? "" : String(bundle.package_id); proxyOrderId.value = bundle.order_id == null ? "" : String(bundle.order_id);
    if (result?.proxy) renderProxy(result.proxy);
    proxyOperationStatus.textContent = result?.profile_count ? `Конфиг загружен · профилей ${result.profile_count}` : "Конфиг загружен. Нажми «Обновить».";
  } finally { setProxyBusy(false); await refresh(); }
});
proxySync.addEventListener("click", async () => {
  setProxyBusy(true); proxyOperationStatus.textContent = "Обновление профилей…";
  try {
    const result = await send({ type: "AF_PROXY_MARKET_SYNC", api_key: proxyApiKey.value, package_id: proxyPackageId.value, order_id: proxyOrderId.value });
    if (result?.proxy) renderProxy(result.proxy);
    if (!result?.ok) proxyOperationStatus.textContent = proxyFriendlyError(result?.error);
    else proxyOperationStatus.textContent = `Профили обновлены: ${result.proxy?.profiles?.length || 0}`;
  } finally { setProxyBusy(false); await refresh(); }
});
proxyEndpointCreate.addEventListener("click", async () => {
  setProxyBusy(true); proxyEndpointStatus.textContent = "Создание…";
  try {
    const result = await send({ type: "AF_PROXY_ENDPOINT_CREATE", api_key: proxyApiKey.value, package_id: proxyPackageId.value, order_id: proxyOrderId.value, country: proxyCreateCountry.value, rotation: proxyCreateRotation.value });
    if (result?.proxy) renderProxy(result.proxy);
    if (!result?.ok) proxyEndpointStatus.textContent = proxyFriendlyError(result?.error);
    else proxyEndpointStatus.textContent = result?.sync_ok === false ? `Endpoint создан; список пока не обновился: ${proxyFriendlyError(result?.sync_error)}` : "Endpoint создан и список обновлён.";
  } finally { setProxyBusy(false); await refresh(); }
});
proxyDataSaver.addEventListener("change", async () => {
  setProxyBusy(true);
  try { const result = await send({ type: "AF_PROXY_DATA_SAVER", enabled: proxyDataSaver.checked }); if (result?.proxy) renderProxy(result.proxy); if (!result?.ok) proxyStatus.textContent = proxyFriendlyError(result?.error); }
  finally { setProxyBusy(false); await refresh(); }
});
proxyTrafficRefresh.addEventListener("click", async () => {
  setProxyBusy(true); proxyTrafficStatus.textContent = "Обновление…";
  try { const result = await send({ type: "AF_PROXY_TRAFFIC_REFRESH" }); if (result?.proxy) renderProxy(result.proxy); if (!result?.ok) proxyTrafficStatus.textContent = proxyFriendlyError(result?.error); }
  finally { setProxyBusy(false); await refresh(); }
});
proxyDiagnostic.addEventListener("click", async () => {
  setProxyBusy(true); proxyDiagnosticStatus.textContent = "Проверка…";
  try { const result = await send({ type: "AF_PROXY_DIAGNOSTIC" }); proxyDiagnosticStatus.textContent = result?.ok ? formatProxyDiagnostic(result) : proxyFriendlyError(result?.error); }
  finally { setProxyBusy(false); await refresh(); }
});

chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local" || area === "session") refresh(); });
refresh();
refreshTimer = setInterval(refresh, 1000);
window.addEventListener("unload", () => { if (refreshTimer) clearInterval(refreshTimer); });
