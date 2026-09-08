/* Avito Finder v1.0.24 — Proxy.Market recovery is evidence-driven: keep the selected every-request profile, force a fresh proxy transport epoch, verify real egress rotation, and only then reload Avito. */
"use strict";
(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AvitoFinderProxy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const STORAGE = Object.freeze({ runtime: "af_proxy_runtime_v1", secret: "af_proxy_secret_v1", profiles: "af_proxy_profiles_local_v1", hidden: "af_proxy_hidden_profile_ids_v1" });
  const PROVIDER = "proxy_market";
  const PROXY_TYPE = "resident";
  const API_BASE = "https://api.dashboard.proxy.market";
  const MAX_PROFILES = 500;
  const KEY_FILE_FORMAT = "avito-finder-proxy-market-key";
  const KEY_FILE_VERSION = 2;
  const TRAFFIC_POOL_HOST = "pool.proxy.market";
  const TRAFFIC_HTTP_PORT = 10000;
  const TRAFFIC_SOCKS_PORT = 10999;
  const EGRESS_CHECK_HOSTS = Object.freeze(["api.ipify.org", "api64.ipify.org"]);
  const EGRESS_CHECK_HOST = EGRESS_CHECK_HOSTS[0];
  const EGRESS_CHECK_ORIGIN = `https://${EGRESS_CHECK_HOST}`;

  function text(value, max = 512) { return String(value == null ? "" : value).trim().slice(0, max); }
  function int(value, fallback = null) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function validPort(value) { const port = int(value, 0); return port >= 1 && port <= 65535; }
  function validProxyHost(value) {
    const host = text(value, 255);
    if (!host || /[\s/\\@?#]/.test(host)) return false;
    return /^[A-Za-z0-9.-]+$/.test(host) || /^\[[0-9A-Fa-f:]+\]$/.test(host) || /^[0-9A-Fa-f:]+$/.test(host);
  }
  function normalizeId(value) { const raw = text(value, 96); return raw || null; }

  function normalizeChangeIpLink(value) {
    const raw = text(value, 2048);
    if (!raw) return "";
    try {
      const url = new URL(raw);
      const host = String(url.hostname || "").toLowerCase();
      if (url.protocol !== "https:" || url.username || url.password) return "";
      // Provider rotation links are treated as trusted only when they remain on
      // Proxy.Market-controlled HTTPS hosts. Unknown/external URLs are discarded.
      if (!(host === "proxy.market" || host.endsWith(".proxy.market"))) return "";
      return url.href;
    } catch (_) { return ""; }
  }

  function safeProviderMessage(payload) {
    if (!payload || typeof payload !== "object") return "";
    const candidates = [payload.message, payload.error, payload.code, payload.detail];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const value = text(candidate, 180).replace(/https?:\/\/\S+/g, "[url]");
      if (value) return value;
    }
    return "";
  }
  function proxyMarketHttpError(stage, response, payload) {
    const cleanStage = text(stage, 32).toUpperCase().replace(/[^A-Z0-9_]/g, "_") || "API";
    const status = int(response?.status, 0);
    const error = new Error(`PROXY_MARKET_${cleanStage}_HTTP_${status || "ERROR"}`);
    error.stage = cleanStage;
    error.status = status || null;
    error.provider_message = safeProviderMessage(payload);
    return error;
  }

  function nested(value, keys) {
    let current = value;
    for (const key of keys) {
      if (!current || typeof current !== "object") return undefined;
      current = current[key];
    }
    return current;
  }
  function countryCode(value) {
    if (typeof value === "string") return text(value, 16).toLowerCase();
    if (value && typeof value === "object") return text(value.code || value.iso || value.value, 16).toLowerCase();
    return "";
  }
  function stableProfileId(record, host, httpPort, packageId) {
    const direct = normalizeId(record.id ?? record.proxy_id ?? record.proxyId ?? record.endpoint_id ?? record.endpointId);
    if (direct) return direct;
    if (packageId && validPort(httpPort)) return `traffic-${packageId}-${httpPort}`;
    const seed = `${host}|${httpPort || ""}|${countryCode(record.country)}|${int(record.rotation, null) ?? ""}`;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return host && validPort(httpPort) ? `proxy-${(hash >>> 0).toString(16)}` : null;
  }
  function normalizeProxyMarketRecord(record, context = {}) {
    if (!record || typeof record !== "object") return null;
    const packageId = int(record.package_id ?? record.packageId ?? context.package_id, null);
    const login = text(record.login ?? record.username ?? record.user ?? nested(record, ["auth", "login"]), 256);
    const password = text(record.password ?? record.pass ?? nested(record, ["auth", "password"]), 512);
    let host = text(record.ip || record.host || record.hostname || record.gateway || record.server || record.proxy_host || nested(record, ["proxy", "host"]), 255);
    let httpPort = int(record.http_port ?? record.httpPort ?? record.port ?? record.port_http ?? nested(record, ["ports", "http"]) ?? nested(record, ["http", "port"]) ?? record.port_from, null);
    let socksPort = int(record.socks_port ?? record.socksPort ?? record.port_socks ?? nested(record, ["ports", "socks"]) ?? nested(record, ["socks", "port"]) ?? record.port_to, null);
    const residentTrafficHint = Boolean(packageId || context.package_id) && Boolean(login || password);
    if (!host && residentTrafficHint) host = TRAFFIC_POOL_HOST;
    if (!validPort(httpPort) && residentTrafficHint) httpPort = TRAFFIC_HTTP_PORT;
    if (!validPort(socksPort) && residentTrafficHint) socksPort = TRAFFIC_SOCKS_PORT;
    const id = stableProfileId(record, host, httpPort, packageId);
    if (!id || !validProxyHost(host) || (!validPort(httpPort) && !validPort(socksPort))) return null;
    const rotateValue = int(record.rotation ?? record.rotate ?? nested(record, ["rotation_settings", "rotate"]), null);
    return {
      id,
      provider: PROVIDER,
      proxy_type: text(record.proxy_type || record.proxyType || context.proxy_type || PROXY_TYPE, 32) || PROXY_TYPE,
      type: text(record.type || context.type, 32),
      host,
      http_port: validPort(httpPort) ? httpPort : null,
      socks_port: validPort(socksPort) ? socksPort : null,
      login,
      password,
      country: countryCode(record.country || record.country_code || context.country),
      expires_at: text(record.expires_at || record.expiresAt || context.expires_at, 64),
      comment: text(record.comment || context.comment, 240),
      order_id: int(record.order_id ?? record.orderId ?? context.order_id, null),
      package_id: packageId,
      rotation_settings: record.rotation_settings && typeof record.rotation_settings === "object" ? {
        rotate: rotateValue,
        rotate_min: int(record.rotation_settings.rotate_min, null),
        rotate_max: int(record.rotation_settings.rotate_max, null),
        rotate_can_change: record.rotation_settings.rotate_can_change === true,
        change_ip_link: record.rotation_settings.rotate_can_change === true ? normalizeChangeIpLink(record.rotation_settings.change_ip_link) : ""
      } : (rotateValue != null ? { rotate: rotateValue, rotate_min: null, rotate_max: null, rotate_can_change: false, change_ip_link: "" } : null)
    };
  }

  function proxyRows(payload) {
    if (Array.isArray(payload?.list?.data)) return payload.list.data;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.list)) return payload.list;
    return [];
  }
  function safeProxyRowShape(payload) {
    const row = proxyRows(payload)[0];
    if (!row || typeof row !== "object") return { row_count: proxyRows(payload).length, keys: [], nested: {} };
    const keys = Object.keys(row).slice(0, 40).sort();
    const nestedShape = {};
    for (const key of ["ports", "auth", "rotation_settings", "proxy"]) {
      if (row[key] && typeof row[key] === "object" && !Array.isArray(row[key])) nestedShape[key] = Object.keys(row[key]).slice(0, 20).sort();
    }
    return { row_count: proxyRows(payload).length, keys, nested: nestedShape };
  }
  function normalizeProxyMarketList(payload, context = {}) {
    const rows = proxyRows(payload);
    const seen = new Set();
    const profiles = [];
    for (const row of rows) {
      const profile = normalizeProxyMarketRecord(row, context);
      if (!profile || seen.has(profile.id)) continue;
      seen.add(profile.id);
      profiles.push(profile);
      if (profiles.length >= MAX_PROFILES) break;
    }
    return profiles;
  }
  function proxyListTotal(payload) {
    const candidates = [payload?.list?.total, payload?.total, payload?.metadata?.total];
    for (const candidate of candidates) if (Number.isFinite(Number(candidate))) return Number(candidate);
    return null;
  }
  function profileSummary(profile) {
    if (!profile) return null;
    return {
      id: profile.id,
      provider: profile.provider,
      proxy_type: profile.proxy_type,
      type: profile.type,
      host: profile.host,
      http_port: profile.http_port,
      socks_port: profile.socks_port,
      country: profile.country,
      expires_at: profile.expires_at,
      comment: profile.comment,
      package_id: profile.package_id,
      order_id: profile.order_id,
      has_credentials: Boolean(profile.login || profile.password),
      rotation: profile.rotation_settings?.rotate ?? null,
      can_force_change_ip: Boolean(profile.rotation_settings?.rotate_can_change && profile.rotation_settings?.change_ip_link)
    };
  }


  async function forceChangeIpByLink(requestFn, changeIpLink) {
    if (typeof requestFn !== "function") throw new Error("PROXY_MARKET_REQUEST_FN_REQUIRED");
    const safeLink = normalizeChangeIpLink(changeIpLink);
    if (!safeLink) throw new Error("PROXY_MARKET_CHANGE_IP_LINK_UNAVAILABLE");
    const response = await requestFn(safeLink, {
      method: "GET",
      headers: { "Accept": "application/json,text/plain,*/*" },
      cache: "no-store",
      credentials: "omit",
      redirect: "follow"
    });
    if (!response || response.ok !== true) {
      const error = new Error(`PROXY_MARKET_CHANGE_IP_HTTP_${int(response?.status, 0) || "ERROR"}`);
      error.status = int(response?.status, null);
      throw error;
    }
    return { ok: true, status: int(response.status, 200) || 200 };
  }

  function apiBalanceUrl(apiKey) {
    const key = text(apiKey, 512);
    if (!key) throw new Error("PROXY_MARKET_API_KEY_REQUIRED");
    return `${API_BASE}/dev-api/balance/${encodeURIComponent(key)}`;
  }
  async function fetchProxyMarketBalance(requestFn, apiKey) {
    if (typeof requestFn !== "function") throw new Error("PROXY_MARKET_REQUEST_FN_REQUIRED");
    const response = await requestFn(apiBalanceUrl(apiKey), {
      method: "GET", headers: { "Accept": "application/json" }, cache: "no-store", credentials: "omit", redirect: "error"
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok) throw proxyMarketHttpError("BALANCE", response, payload);
    const balance = Number(payload?.balance);
    if (!payload || !Number.isFinite(balance)) throw new Error("PROXY_MARKET_BALANCE_FAILED");
    return { balance };
  }

  function apiListUrl(apiKey) {
    const key = text(apiKey, 512);
    if (!key) throw new Error("PROXY_MARKET_API_KEY_REQUIRED");
    return `${API_BASE}/dev-api/list/${encodeURIComponent(key)}`;
  }
  function apiListBody(options = {}) {
    const packageId = int(options.package_id, null);
    const orderId = int(options.order_id, null);
    const allowedTypes = new Set(["ipv4", "ipv4-shared", "ipv6", "all"]);
    const requestedType = text(options.type || (packageId ? "all" : "ipv4"), 24).toLowerCase();
    const body = {
      type: allowedTypes.has(requestedType) ? requestedType : (packageId ? "all" : "ipv4"),
      page: Math.max(1, int(options.page, 1)),
      page_size: Math.min(50, Math.max(1, int(options.page_size, 10))),
      sort: options.sort === 0 ? 0 : 1
    };
    if (packageId && packageId > 0) body.package_id = packageId;
    if (!packageId || options.force_proxy_type === true) body.proxy_type = PROXY_TYPE;
    if (orderId && orderId > 0) body.order_id = orderId;
    return body;
  }
  async function fetchProxyMarketPage(requestFn, apiKey, options = {}) {
    if (typeof requestFn !== "function") throw new Error("PROXY_MARKET_REQUEST_FN_REQUIRED");
    const response = await requestFn(apiListUrl(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(apiListBody(options)), cache: "no-store", credentials: "omit", redirect: "error"
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok) throw proxyMarketHttpError("LIST", response, payload);
    if (!payload || payload.success === false || payload?.list?.error === true) throw new Error("PROXY_MARKET_LIST_FAILED");
    return payload;
  }


  function apiCreateProxyUrl(apiKey) {
    const key = text(apiKey, 512);
    if (!key) throw new Error("PROXY_MARKET_API_KEY_REQUIRED");
    return `${API_BASE}/dev-api/v2/package/create-proxy/${encodeURIComponent(key)}`;
  }
  function apiCreateProxyBody(options = {}) {
    const packageId = int(options.package_id ?? options.packageId, null);
    if (!packageId || packageId <= 0) throw new Error("PROXY_PACKAGE_ID_REQUIRED_FOR_CREATE");
    const country = text(options.country || "ru", 8).toLowerCase();
    if (!/^[a-z]{2}$/.test(country)) throw new Error("PROXY_CREATE_COUNTRY_INVALID");
    const rotation = int(options.rotation, -1);
    if (rotation < -1 || rotation > 60) throw new Error("PROXY_CREATE_ROTATION_INVALID");
    const body = { packageId, country, rotation };
    const regionId = int(options.region_id ?? options.regionId, null);
    const cityId = int(options.city_id ?? options.cityId, null);
    const ipAuth = text(options.ip_auth ?? options.ipAuth, 1024);
    if (regionId && regionId > 0) body.regionId = regionId;
    if (cityId && cityId > 0) body.cityId = cityId;
    if (ipAuth) body.ipAuth = ipAuth;
    return body;
  }
  async function createProxyInPackage(requestFn, apiKey, options = {}) {
    if (typeof requestFn !== "function") throw new Error("PROXY_MARKET_REQUEST_FN_REQUIRED");
    const response = await requestFn(apiCreateProxyUrl(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(apiCreateProxyBody(options)), cache: "no-store", credentials: "omit", redirect: "error"
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok) throw proxyMarketHttpError("CREATE", response, payload);
    return { ok: true, payload };
  }

  function apiPackagesUrl(apiKey, page = 1, perPage = 10) {
    const key = text(apiKey, 512);
    if (!key) throw new Error("PROXY_MARKET_API_KEY_REQUIRED");
    const p = Math.max(1, int(page, 1));
    const pp = Math.min(50, Math.max(1, int(perPage, 10)));
    return `${API_BASE}/dev-api/v2/packages/${encodeURIComponent(key)}?page=${p}&perPage=${pp}`;
  }
  function normalizeTrafficPackage(record) {
    if (!record || typeof record !== "object") return null;
    const id = int(record.id, null);
    const total = Number(record.total);
    const used = Number(record.used);
    if (!id || !Number.isFinite(total) || !Number.isFinite(used)) return null;
    return {
      id,
      total: Math.max(0, total),
      used: Math.max(0, used),
      remaining: Math.max(0, total - used),
      name: text(record.name, 240),
      expires_at: text(record.expires_at, 64),
      proxies_count: Math.max(0, int(record.proxies_count, 0)),
      is_active: record.is_active === true,
      prepaid: record.prepaid === true
    };
  }
  function packageSummary(record) {
    const p = normalizeTrafficPackage(record);
    if (!p) return null;
    return { id: p.id, name: p.name, proxies_count: p.proxies_count, is_active: p.is_active, prepaid: p.prepaid, total: p.total, used: p.used, remaining: p.remaining, expires_at: p.expires_at };
  }
  async function fetchTrafficPackages(requestFn, apiKey, options = {}) {
    if (typeof requestFn !== "function") throw new Error("PROXY_MARKET_REQUEST_FN_REQUIRED");
    const page = Math.max(1, int(options.page, 1));
    const perPage = Math.min(50, Math.max(1, int(options.per_page, 10)));
    const response = await requestFn(apiPackagesUrl(apiKey, page, perPage), {
      method: "GET", headers: { "Accept": "application/json" }, cache: "no-store", credentials: "omit", redirect: "error"
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok) throw proxyMarketHttpError("PACKAGES", response, payload);
    if (!payload || !Array.isArray(payload.data)) throw new Error("PROXY_MARKET_PACKAGES_FAILED");
    return { packages: payload.data.map(normalizeTrafficPackage).filter(Boolean), metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {} };
  }

  function normalizeBundleProfiles(inputProfiles) {
    if (!Array.isArray(inputProfiles)) return [];
    const seen = new Set();
    const out = [];
    for (const record of inputProfiles) {
      const profile = normalizeProxyMarketRecord(record, { proxy_type: PROXY_TYPE });
      if (!profile || seen.has(profile.id)) continue;
      seen.add(profile.id); out.push(profile);
      if (out.length >= MAX_PROFILES) break;
    }
    return out;
  }
  function makeKeyBundle(input = {}) {
    const apiKey = text(input.api_key, 512);
    if (!apiKey) throw new Error("PROXY_MARKET_API_KEY_REQUIRED");
    return {
      format: KEY_FILE_FORMAT,
      version: KEY_FILE_VERSION,
      provider: "proxy.market",
      api_key: apiKey,
      package_id: int(input.package_id, null),
      order_id: int(input.order_id, null),
      profiles: normalizeBundleProfiles(input.profiles),
      created_at: text(input.created_at || new Date().toISOString(), 64)
    };
  }
  function parseKeyBundle(payload) {
    if (!payload || typeof payload !== "object") throw new Error("PROXY_KEY_FILE_INVALID");
    const version = int(payload.version, 0);
    if (text(payload.format, 80) !== KEY_FILE_FORMAT || ![1, KEY_FILE_VERSION].includes(version)) throw new Error("PROXY_KEY_FILE_FORMAT_UNSUPPORTED");
    return makeKeyBundle({ ...payload, profiles: version >= 2 ? payload.profiles : [] });
  }
  function makeManualTrafficProfile(input = {}) {
    const packageId = int(input.package_id ?? input.packageId, null);
    const host = text(input.host || TRAFFIC_POOL_HOST, 255);
    const httpPort = int(input.http_port ?? input.httpPort ?? TRAFFIC_HTTP_PORT, null);
    const socksPort = int(input.socks_port ?? input.socksPort ?? TRAFFIC_SOCKS_PORT, null);
    const login = text(input.login ?? input.username, 256);
    const password = text(input.password, 512);
    const country = countryCode(input.country || "ru");
    const rotation = int(input.rotation, -1);
    if (!validProxyHost(host)) throw new Error("PROXY_HOST_INVALID");
    if (!validPort(httpPort)) throw new Error("PROXY_HTTP_ENDPOINT_UNAVAILABLE");
    if (!login || !password) throw new Error("PROXY_CREDENTIALS_REQUIRED");
    const id = normalizeId(input.id) || `traffic-${packageId || "manual"}-${httpPort}`;
    return normalizeProxyMarketRecord({ id, host, http_port: httpPort, socks_port: validPort(socksPort) ? socksPort : null, login, password, country, package_id: packageId, proxy_type: PROXY_TYPE, type: "traffic", rotation }, { package_id: packageId, country, proxy_type: PROXY_TYPE, type: "traffic" });
  }


  function isLegacyManualProfile(profile) {
    return /^traffic-/i.test(text(profile?.id, 96));
  }
  function profileCredentialKey(profile) {
    if (!profile || typeof profile !== "object") return "";
    return [
      text(profile.host, 255).toLowerCase(),
      int(profile.http_port, null) ?? "",
      int(profile.package_id, null) ?? "",
      text(profile.login, 256)
    ].join("|");
  }
  function dedupeProfileSet(inputProfiles) {
    const normalized = normalizeBundleProfiles(inputProfiles);
    const realProfiles = normalized.filter((profile) => !isLegacyManualProfile(profile));
    const source = realProfiles.length ? realProfiles : normalized;
    const seenIds = new Set();
    const out = [];
    for (const profile of source) {
      if (seenIds.has(String(profile.id))) continue;
      seenIds.add(String(profile.id));
      out.push(profile);
      if (out.length >= MAX_PROFILES) break;
    }
    return out;
  }

  function selectedHttpEndpoint(profile) {
    if (!profile || !validProxyHost(profile.host) || !validPort(profile.http_port)) throw new Error("PROXY_HTTP_ENDPOINT_UNAVAILABLE");
    return { scheme: "http", host: profile.host, port: profile.http_port };
  }
  function pacHost(host) {
    const value = text(host, 255);
    if (!validProxyHost(value)) throw new Error("PROXY_HOST_INVALID");
    return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
  }
  function safePacNonce(value) { return text(value, 120).replace(/[^A-Za-z0-9_.:-]/g, "_"); }
  function normalizedPacExtraHosts(input) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(input) ? input : []) {
      const host = text(value, 255).toLowerCase();
      if (!host || !validProxyHost(host) || seen.has(host)) continue;
      seen.add(host); out.push(host);
    }
    return out.slice(0, 12);
  }
  function buildAvitoOnlyPacConfig(profile, options = {}) {
    const endpoint = selectedHttpEndpoint(profile);
    const proxy = `${pacHost(endpoint.host)}:${endpoint.port}`;
    const extraHosts = normalizedPacExtraHosts(options.extra_hosts);
    const nonce = safePacNonce(options.nonce);
    const hostTests = [
      "host === 'avito.ru'",
      "dnsDomainIs(host, '.avito.ru')",
      ...extraHosts.map((host) => `host === '${host}'`)
    ].join(" || ");
    const data = [
      `// avito-finder-proxy-epoch:${nonce || "stable"}`,
      "function FindProxyForURL(url, host) {",
      "  host = String(host || '').toLowerCase();",
      `  if (${hostTests}) {`,
      `    return 'PROXY ${proxy}';`,
      "  }",
      "  return 'DIRECT';",
      "}"
    ].join("\n");
    return { mode: "pac_script", pacScript: { data, mandatory: true } };
  }
  function buildProxyTransportCutPacConfig(options = {}) {
    const extraHosts = normalizedPacExtraHosts(options.extra_hosts);
    const nonce = safePacNonce(options.nonce);
    const hostTests = [
      "host === 'avito.ru'",
      "dnsDomainIs(host, '.avito.ru')",
      ...extraHosts.map((host) => `host === '${host}'`)
    ].join(" || ");
    const data = [
      `// avito-finder-transport-cut:${nonce || "cut"}`,
      "function FindProxyForURL(url, host) {",
      "  host = String(host || '').toLowerCase();",
      `  if (${hostTests}) {`,
      "    return 'PROXY 127.0.0.1:9';",
      "  }",
      "  return 'DIRECT';",
      "}"
    ].join("\n");
    return { mode: "pac_script", pacScript: { data, mandatory: true } };
  }
  function egressCheckUrl(nonce = "", host = EGRESS_CHECK_HOST) {
    const safeHost = EGRESS_CHECK_HOSTS.includes(text(host, 255).toLowerCase()) ? text(host, 255).toLowerCase() : EGRESS_CHECK_HOST;
    const token = safePacNonce(nonce) || String(Date.now());
    return `https://${safeHost}?format=json&af_nonce=${encodeURIComponent(token)}`;
  }
  function normalizeEgressIp(value) {
    const raw = text(value, 96);
    if (!raw || /[\s/?#@]/.test(raw)) return "";
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(raw)) {
      const octets = raw.split(".").map(Number);
      return octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? raw : "";
    }
    if (/^[0-9A-Fa-f:]+$/.test(raw) && raw.includes(":")) return raw.toLowerCase();
    return "";
  }
  function parseEgressIpPayload(payload) {
    if (typeof payload === "string") return normalizeEgressIp(payload);
    if (!payload || typeof payload !== "object") return "";
    return normalizeEgressIp(payload.ip || payload.address || payload.query || "");
  }
  function directConfig() { return { mode: "direct" }; }
  function challengerMatchesProfile(details, profile) {
    if (!details?.isProxy || !profile) return false;
    const host = text(details.challenger?.host, 255).replace(/^\[|\]$/g, "").toLowerCase();
    const expected = text(profile.host, 255).replace(/^\[|\]$/g, "").toLowerCase();
    const port = int(details.challenger?.port, null);
    return Boolean(host && expected && host === expected && port === int(profile.http_port, null));
  }
  function rotationMode(value) {
    const rotation = int(value, -1);
    if (rotation === -1) return { value: -1, code: "sticky", label: "Sticky session", description: "IP закреплён на сессию и автоматически на каждый запрос не меняется." };
    if (rotation === 0) return { value: 0, code: "every_request", label: "Каждый запрос", description: "Каждый новый HTTP-запрос получает новый IP из пула." };
    if (rotation >= 1 && rotation <= 60) return { value: rotation, code: "timed", label: `Каждые ${rotation} мин`, description: `IP сохраняется до ${rotation} минут, затем ротируется.` };
    return { value: rotation, code: "unknown", label: `rotation=${rotation}`, description: "Неизвестный режим ротации." };
  }
  const PROXY_MUTATION_BUSY_STATUSES = new Set([
    "STARTING_BRIDGE_EXACT_CAPTURE",
    "COMMAND_CAPTURED",
    "FORM_TEXT_CAPTURED_UNVALIDATED",
    "AVITO_TAB_ACTIVE",
    "WAITING_FOR_AVITO_PAGE_READY",
    "WAITING_FOR_UI_CLICK_RECONCILIATION",
    "REPORT_DELIVERY_IN_PROGRESS"
  ]);
  function canMutateProxy(state) {
    if (!state) return true;
    const status = String(state.status || "");
    if (!status || status === "IDLE" || status === "CANCELLED_BY_USER") return true;
    // A Finder run may stay logically open while it is waiting for the assistant/user,
    // displaying a report, or sitting in a blocked/recoverable state. Those states do
    // not own an in-flight Avito UI mutation, so a user-requested proxy profile switch
    // is safe and must not require cancelling the whole run.
    return !PROXY_MUTATION_BUSY_STATUSES.has(status);
  }

  return Object.freeze({
    STORAGE, PROVIDER, PROXY_TYPE, API_BASE, MAX_PROFILES, KEY_FILE_FORMAT, KEY_FILE_VERSION, TRAFFIC_POOL_HOST, TRAFFIC_HTTP_PORT, TRAFFIC_SOCKS_PORT, EGRESS_CHECK_HOSTS, EGRESS_CHECK_HOST, EGRESS_CHECK_ORIGIN,
    text, int, validPort, validProxyHost, normalizeChangeIpLink, safeProviderMessage, proxyMarketHttpError,
    normalizeProxyMarketRecord, normalizeProxyMarketList, proxyRows, safeProxyRowShape, proxyListTotal, profileSummary,
    forceChangeIpByLink, apiBalanceUrl, fetchProxyMarketBalance,
    apiListUrl, apiListBody, fetchProxyMarketPage,
    apiPackagesUrl, normalizeTrafficPackage, packageSummary, fetchTrafficPackages,
    apiCreateProxyUrl, apiCreateProxyBody, createProxyInPackage,
    makeKeyBundle, parseKeyBundle, normalizeBundleProfiles, makeManualTrafficProfile, isLegacyManualProfile, profileCredentialKey, dedupeProfileSet,
    selectedHttpEndpoint, buildAvitoOnlyPacConfig, buildProxyTransportCutPacConfig, egressCheckUrl, normalizeEgressIp, parseEgressIpPayload, directConfig, challengerMatchesProfile, rotationMode, PROXY_MUTATION_BUSY_STATUSES, canMutateProxy
  });
});
