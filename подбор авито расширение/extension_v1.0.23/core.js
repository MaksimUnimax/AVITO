/* Avito Finder v1.0.23 — assistant-directed visible-UI executor with recoverable pinned-chat context guard and verified proxy recovery integration. */
(function attachAvitoFinderCore(root) {
  "use strict";
  const STORAGE = Object.freeze({
    state: "avito_finder.state",
    logs: "avito_finder.logs",
    lastInspection: "avito_finder.last_inspection"
  });
  const CHATGPT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
  const AVITO_HOSTS = new Set(["www.avito.ru", "avito.ru"]);
  const MAX_LOGS = 250;
  const VALID_MODES = new Set(["INSPECT_FILTERS", "SEARCH", "DIAGNOSE_DOM", "AVITO_UI"]);
  // These are generic action verbs, not per-element features. Targets remain
  // visible public controls resolved locally by marker/label/placeholder.
  const UI_ACTION_TYPES = new Set([
    "CLICK", "TYPE", "COLLECT_MENU", "SELECT_OPTION", "WAIT", "WAIT_FOR", "SNAPSHOT",
    "COLLECT_LISTINGS", "COLLECT_LISTING_DETAILS", "COLLECT_EXPLICIT_LISTING_QUEUE",
    "RESUME_EXPLICIT_LISTING_QUEUE"
  ]);
  const UI_PLAN_MAX_STEPS = 12;
  const UI_PLAN_MAX_TYPED_TEXT = 160;
  const UI_PLAN_MAX_LISTINGS = 120;
  const EXPLICIT_QUEUE_MAX_ITEMS = 30;
  const EXPLICIT_QUEUE_DEFAULT_BATCH = 30;
  // UI timing profile controls only visible city/filter/search interactions.
  // Sequential card cadence is parsed separately as an explicit numeric checkpoint setting.
  const UI_TIMING_PROFILES = new Set(["CONTROL_VISIBLE", "COLLECTION_FAST"]);
  const SEQUENTIAL_CARD_GAP_MAX_MS = 2147483647;
  const DIAGNOSTIC_ACTIONS = new Set(["", "OPEN_LOCATION_DIALOG"]);
  const DIAGNOSTIC_SCOPES = new Set([
    "PAGE_MAIN_VISIBLE",
    "SEARCH_SURFACE_VISIBLE",
    "SEARCH_INPUT_ANCESTRY_VISIBLE",
    "SEARCH_INPUT_PARENT_VISIBLE",
    "FILTERS_VISIBLE",
    "DIALOG_VISIBLE",
    "LISTING_CARD_VISIBLE",
    "REVIEWS_VISIBLE"
  ]);
  const REQUIRED_COMMAND_LABELS = Object.freeze([
    "Цель", "Режим", "Категория", "Город", "Доставка", "Поисковый запрос",
    "Цена", "Обязательные условия", "Желательные условия", "Исключить",
    "Количество кандидатов", "Действие"
  ]);
  const CONVERSATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

  function safeUrl(value) { try { return new URL(String(value || "")); } catch (_) { return null; } }
  function isChatGPTUrl(value) {
    const u = safeUrl(value);
    return Boolean(u && u.protocol === "https:" && CHATGPT_HOSTS.has(u.hostname));
  }
  function isAvitoUrl(value) {
    const u = safeUrl(value);
    return Boolean(u && u.protocol === "https:" && AVITO_HOSTS.has(u.hostname));
  }
  function conversationIdentityFromUrl(value) {
    const u = safeUrl(value);
    if (!u || u.protocol !== "https:" || !CHATGPT_HOSTS.has(u.hostname)) return null;
    const match = u.pathname.match(/(?:^|\/)c\/([0-9a-f-]{36})(?:\/|$)/i);
    return { origin: u.origin, chat_path: u.pathname, conversation_id: match ? match[1].toLowerCase() : null };
  }
  function isConversationIdentity(value) {
    return Boolean(value && typeof value.origin === "string" && typeof value.chat_path === "string" &&
      typeof value.conversation_id === "string" && CONVERSATION_ID_RE.test(value.conversation_id));
  }
  function sameConversationIdentity(expected, actual) {
    return Boolean(isConversationIdentity(expected) && isConversationIdentity(actual) &&
      expected.origin === actual.origin &&
      expected.conversation_id === actual.conversation_id);
  }
  function samePinnedChatContext(expected, actual) {
    return Boolean(expected && actual && Number.isInteger(expected.tab_id) && Number.isInteger(expected.window_id) &&
      expected.tab_id === actual.tab_id && expected.window_id === actual.window_id &&
      sameConversationIdentity(expected, actual));
  }
  function normalizeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function fingerprint(value) {
    const text = normalizeText(value); let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return `${text.length}:${(h >>> 0).toString(16)}`;
  }
  function makeSearchId(now, random) {
    const stamp = new Date(now || Date.now()).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const entropy = Math.floor((random === undefined ? Math.random() : random) * 0xffffff).toString(36).padStart(4, "0").slice(-4);
    return `af-${stamp}-${entropy}`;
  }
  function parseLabeledSections(text) {
    const out = {}; let current = null;
    for (const raw of normalizeText(text).split("\n")) {
      const line = raw.trim();
      const m = line.match(/^([^:]{2,80}):\s*(.*)$/u);
      if (m) { current = m[1].trim(); out[current] = m[2].trim(); continue; }
      if (current && line) out[current] = `${out[current]}\n${line}`.trim();
    }
    return out;
  }
  function directiveValue(text, label) {
    const match = normalizeText(text).match(new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*([^\\n]+)`, "iu"));
    return match ? match[1].trim() : "";
  }
  function firstAvitoUrl(text) {
    const matches = normalizeText(text).match(/https:\/\/(?:www\.)?avito\.ru(?:\/[^\s)\]}>]*)?/iu);
    // A sentence-ending punctuation mark belongs to the instruction, not the URL.
    return matches ? matches[0].replace(/[.,;:!?]+$/u, "") : "";
  }
  function firstScope(text) {
    const raw = normalizeText(text);
    const upper = raw.toUpperCase();
    // A diagnostic area must be explicit or positively requested. Do not infer a
    // target from a prohibition such as “не открывай объявления”: that phrase is
    // a safety boundary, not a request to inspect a listing card.
    for (const scope of DIAGNOSTIC_SCOPES) if (upper.includes(scope)) return scope;
    const negative = /(?:^|[\s.,;:!?()])(?:не|нельзя|исключить|запрещено)(?=$|[\s.,;:!?()])/iu.exec(raw);
    const positive = negative ? raw.slice(0, negative.index) : raw;
    if (/(?:сними|обследуй|диагностируй|верни|покажи)[^\n]{0,90}(?:отзыв|reviews?)/iu.test(positive)) return "REVIEWS_VISIBLE";
    if (/(?:сними|обследуй|диагностируй|верни|покажи)[^\n]{0,90}(?:карточк|объявлен)/iu.test(positive)) return "LISTING_CARD_VISIBLE";
    if (/(?:сними|обследуй|диагностируй|верни|покажи)[^\n]{0,90}(?:диалог|модальн|попап)/iu.test(positive)) return "DIALOG_VISIBLE";
    if (/(?:сними|обследуй|диагностируй|верни|покажи)[^\n]{0,90}(?:поиск|search)/iu.test(positive)) return "SEARCH_SURFACE_VISIBLE";
    return "PAGE_MAIN_VISIBLE";
  }
  function firstInstructionLines(text, limit = 4) {
    return normalizeText(text).split("\n").map((line) => line.trim()).filter(Boolean).slice(0, limit);
  }
  function exactModeToken(value) {
    const token = String(value || "").trim().replace(/[.:;]+$/u, "").toUpperCase();
    return VALID_MODES.has(token) ? token : "";
  }
  function inferMode(text, fields) {
    const raw = normalizeText(text);
    const explicit = exactModeToken(String(fields["Режим"] || directiveValue(raw, "Режим") || ""));
    if (explicit) return { mode: explicit, source: "explicit_field" };

    // Commands are ordinary prose, but the action mode is an explicit local
    // instruction. It may be a bare first line or "Режим: ...". Never scan the
    // entire payload for SEARCH: selectors such as search-form/suggest/input are
    // data to inspect, not a request to run a search.
    for (const line of firstInstructionLines(raw)) {
      const direct = exactModeToken(line);
      if (direct) return { mode: direct, source: "first_instruction_line" };
      const barePrefix = line.match(/^(INSPECT_FILTERS|DIAGNOSE_DOM|SEARCH|AVITO_UI)(?:$|[\s.:;])/iu);
      if (barePrefix) return { mode: barePrefix[1].toUpperCase(), source: "first_instruction_prefix" };
      const labeled = line.match(/^режим\s*:\s*(INSPECT_FILTERS|SEARCH|DIAGNOSE_DOM|AVITO_UI)\s*$/iu);
      if (labeled) return { mode: labeled[1].toUpperCase(), source: "first_instruction_line" };
    }

    // Natural read-only diagnostics remain safe to infer. Search stays explicit:
    // without a literal command mode the Worker returns an error to the pinned
    // chat instead of guessing a mutating action.
    if (/\bdom\b|\bhtml\b|сним(?:ок|ка)|разметк|диагност|отзыв/i.test(raw)) return { mode: "DIAGNOSE_DOM", source: "safe_diagnostic_inference" };
    if (/фильтр|обследован|поверхност/i.test(raw)) return { mode: "INSPECT_FILTERS", source: "safe_diagnostic_inference" };
    // Ordinary UI plans can omit a rigid template, but they must have an
    // explicit action section. We do not infer mutating UI work from a casual
    // shopping request alone.
    if (/(?:^|\n)\s*(?:шаги|действия)\s*:/iu.test(raw) && /(?:нажми|выбери|открой|раскрой|введи|напиши|укажи|собери|дождись|подожди)/iu.test(raw)) return { mode: "AVITO_UI", source: "explicit_action_section" };
    return { mode: "", source: "unresolved" };
  }
  function parseCandidateLimit(text, fields) {
    const explicit = String(fields["Количество кандидатов"] || directiveValue(text, "Количество кандидатов") || "").trim();
    const fallback = normalizeText(text).match(/(?:кандидат(?:ов|ы)?|объявлен(?:ий|ия))\s*(?:до|не более|<=|:)?\s*(\d{1,3})/iu);
    const value = explicit || (fallback ? fallback[1] : "");
    return value ? Number.parseInt(value, 10) : null;
  }
  function requestsExistingAvitoContext(text) {
    const raw = normalizeText(text);
    return /(?:на|во)\s+(?:уже\s+)?(?:открыт\w*|текущ\w*|привязанн\w*|закрепл\w*)[^\n]{0,80}(?:авито|avito)|(?:уже\s+открыт\w*|текущ\w*|закрепл\w*)[^\n]{0,80}(?:вкладк\w*|страниц\w*)[^\n]{0,80}(?:авито|avito)/iu.test(raw);
  }
  function parseDiagnosticParentDepth(text, fields) {
    const raw = normalizeText(text);
    const explicit = String(fields["Глубина родителя"] || fields["Глубина"] || directiveValue(raw, "Глубина родителя") || directiveValue(raw, "Глубина") || "").trim();
    if (!explicit) return { value: null, source: "not_provided" };
    const parsed = Number.parseInt(explicit, 10);
    if (!Number.isInteger(parsed)) return { value: null, source: "invalid" };
    return { value: parsed, source: "explicit_text" };
  }
  function parseDiagnosticAction(text, fields) {
    const raw = normalizeText(text);
    const explicit = String(fields["Действие"] || directiveValue(raw, "Действие") || "").trim();
    const actionLine = explicit.split("\n")[0].trim();
    const normalized = actionLine.toUpperCase().replace(/[.:;]+$/u, "");
    if (DIAGNOSTIC_ACTIONS.has(normalized)) return { value: normalized, source: normalized ? "explicit_action_key" : "none" };
    // Ordinary prose remains acceptable, but only this one observed public UI
    // action is allowlisted. No selector or arbitrary script comes from chat.
    if (/(?:открой|открыть|раскрой)[^\n]{0,80}(?:диалог|окно|выбор)[^\n]{0,80}(?:город|локац|местополож)/iu.test(raw)) {
      return { value: "OPEN_LOCATION_DIALOG", source: "safe_prose_inference" };
    }
    return { value: "", source: explicit ? "unsupported" : "none" };
  }
  function parseDiagnosticDirective(text, fields) {
    const raw = normalizeText(text);
    const pageUrl = directiveValue(String(fields["Действие"] || ""), "Страница") || directiveValue(raw, "Страница") || firstAvitoUrl(raw);
    const explicitScope = directiveValue(String(fields["Действие"] || ""), "Область") || directiveValue(raw, "Область");
    const scope = (explicitScope || firstScope(raw)).toUpperCase();
    const parentDepth = parseDiagnosticParentDepth(raw, fields);
    const action = parseDiagnosticAction(raw, fields);
    const reuseExistingAvito = !pageUrl && requestsExistingAvitoContext(raw);
    const errors = [];
    if (!pageUrl && !reuseExistingAvito) errors.push("DIAGNOSTIC_PAGE_REQUIRED");
    else if (pageUrl && !isAvitoUrl(pageUrl)) errors.push("DIAGNOSTIC_PAGE_NOT_ALLOWED");
    if (!DIAGNOSTIC_SCOPES.has(scope)) errors.push("DIAGNOSTIC_SCOPE_NOT_ALLOWED");
    if (!DIAGNOSTIC_ACTIONS.has(action.value)) errors.push("DIAGNOSTIC_ACTION_NOT_ALLOWED");
    if (action.value === "OPEN_LOCATION_DIALOG" && scope !== "DIALOG_VISIBLE") errors.push("DIAGNOSTIC_ACTION_SCOPE_MISMATCH");
    if (scope === "SEARCH_INPUT_PARENT_VISIBLE") {
      if (!Number.isInteger(parentDepth.value) || parentDepth.value < 1 || parentDepth.value > 16) errors.push("DIAGNOSTIC_PARENT_DEPTH_REQUIRED");
    }
    return {
      valid: errors.length === 0,
      errors,
      page_url: pageUrl,
      reuse_existing_avito: reuseExistingAvito,
      page_source: pageUrl ? "explicit_url" : (reuseExistingAvito ? "explicit_existing_avito_context" : "missing"),
      scope,
      scope_source: explicitScope ? "explicit_text" : "local_inference_or_default",
      parent_depth: parentDepth.value,
      parent_depth_source: parentDepth.source,
      action: action.value,
      action_source: action.source
    };
  }
  function quotedValues(line) {
    const values = [];
    const re = /[«"]([^»"\n]{1,220})[»"]/gu;
    let match;
    while ((match = re.exec(String(line || "")))) values.push(match[1].trim());
    return values;
  }
  function markerValue(line) {
    const match = String(line || "").match(/data-marker\s*=\s*["']([^"']{1,180})["']/iu);
    return match ? match[1].trim() : "";
  }
  function targetFromText(value, preferred) {
    const text = String(value || "").trim();
    if (!text) return null;
    const marker = markerValue(text);
    if (marker) return { by: "marker", value: marker };
    return { by: preferred || "text", value: text.slice(0, 180) };
  }
  function genericActionLines(raw, fields) {
    const section = String(fields["Шаги"] || fields["Действия"] || directiveValue(raw, "Шаги") || directiveValue(raw, "Действия") || "").trim();
    const source = section || normalizeText(raw);
    return source.split("\n").map((line) => line.replace(/^\s*(?:\d+[.)]|[-•])\s*/u, "").trim()).filter(Boolean);
  }
  function planLineForbidden(line) {
    return /(?:написать|сообщени|чат\b|позвон|звонок|купить|оплат|заказ|корзин|оформить\s+достав|брон)/iu.test(String(line || ""));
  }
  function explicitPublicQueueUrls(raw, fields) {
    const normalized = normalizeText(raw);
    const heading = /(?:^|\n)\s*(?:Очередь|Ссылки очереди|Ссылки|Выбранные ссылки)\s*:/iu.exec(normalized);
    let block = "";
    if (heading) {
      const tail = normalized.slice(heading.index);
      const nextLabel = tail.slice(1).search(/\n\s*(?:Цель|Режим|Страница|Пауза между карточками|Темп|Шаги|Действия|Проверка|Исключить)\s*:/iu);
      block = nextLabel >= 0 ? tail.slice(0, nextLabel + 1) : tail;
    }
    const fallback = [fields["Очередь"], fields["Ссылки очереди"], fields["Ссылки"], fields["Выбранные ссылки"]].filter(Boolean).join("\n");
    const urls = []; const seen = new Set();
    const matches = String(block || fallback || "").match(/https:\/\/(?:www\.)?avito\.ru(?:\/[^\s)\]}>]*)?/giu) || [];
    for (const value of matches) {
      const url = safeUrl(value.replace(/[.,;:!?]+$/u, ""));
      if (!url || !isAvitoUrl(url.href)) continue;
      const canonical = `${url.origin}${url.pathname}`;
      if (!seen.has(canonical)) { seen.add(canonical); urls.push(canonical); }
      if (urls.length >= EXPLICIT_QUEUE_MAX_ITEMS) break;
    }
    return urls;
  }
  function parseGenericStep(line) {
    const clean = String(line || "").trim();
    if (!clean || /^(?:режим|страница|цель|шаги|действия|очередь|ссылки)\s*:/iu.test(clean)) return null;
    const quoted = quotedValues(clean);
    const marker = markerValue(clean);
    const wait = clean.match(/^(?:подожди|жди)\s+(\d{1,2})\s*(?:с|сек|секунд)/iu);
    if (wait) return { type: "WAIT", duration_ms: Math.min(Number(wait[1]) * 1000, 5000), source_line: clean };
    const waitFor = clean.match(/^(?:дождись|жди\s+появлен)/iu);
    if (waitFor && (quoted[0] || marker)) return { type: "WAIT_FOR", target: marker ? { by: "marker", value: marker } : targetFromText(quoted[0]), timeout_ms: 5000, source_line: clean };
    const typeMatch = clean.match(/^(?:введи|напиши|укажи)\s+/iu);
    if (typeMatch) {
      if (quoted.length >= 2) return { type: "TYPE", text: quoted[0].slice(0, UI_PLAN_MAX_TYPED_TEXT), target: targetFromText(quoted[1], "placeholder"), source_line: clean };
      if (marker && quoted.length >= 1) return { type: "TYPE", text: quoted[0].slice(0, UI_PLAN_MAX_TYPED_TEXT), target: { by: "marker", value: marker }, source_line: clean };
      return { type: "INVALID", error: "UI_PLAN_TYPE_TARGET_OR_TEXT_REQUIRED", source_line: clean };
    }
    const collectMenu = clean.match(/^(?:собери|верни|покажи|сними)\s+(?:видим(?:ое|ый)\s+)?(?:выпадающ(?:ее|ий)\s+)?(?:меню|список|подсказк)/iu);
    if (collectMenu) return { type: "COLLECT_MENU", source_line: clean };
    const collectQueue = clean.match(/^(?:собери|прочитай|верни|получи).*?(?:очереди|списка)/iu);
    if (collectQueue) {
      const batch = clean.match(/(?:пакет(?:ом)?|за\s+раз)\s*(\d{1,2})/iu);
      return { type: "COLLECT_EXPLICIT_LISTING_QUEUE", batch: Math.max(1, Math.min(Number(batch?.[1] || EXPLICIT_QUEUE_DEFAULT_BATCH), EXPLICIT_QUEUE_DEFAULT_BATCH)), source_line: clean };
    }
    const resumeQueue = clean.match(/^(?:продолжи|возобнови)\s+(?:сбор|чтение|обзор).*?(?:очереди|списка)/iu);
    if (resumeQueue) return { type: "RESUME_EXPLICIT_LISTING_QUEUE", source_line: clean };
    if (/^(?:сформируй|подготовь|отбери|выдай)\s+(?:очередь|список)/iu.test(clean)) return { type: "INVALID", error: "UI_PLAN_SELECTION_BELONGS_TO_ASSISTANT", source_line: clean };
    const collectDetails = clean.match(/^(?:собери|верни|покажи)\s+(?:публичн\w*\s+)?(?:паспорт|детал\w*|характеристик\w*|описани\w*)\s+(?:текущ\w*\s+)?(?:объявлен\w*|лота|карточк\w*)/iu);
    if (collectDetails) return { type: "COLLECT_LISTING_DETAILS", source_line: clean };
    const collect = clean.match(/^(?:собери|верни)\s+(?:первые\s+|до\s+)?(\d{1,3})?\s*(?:видим(?:ые|ых)\s+)?(?:объявлен|карточк|вариант)/iu);
    if (collect) return { type: "COLLECT_LISTINGS", limit: Math.max(1, Math.min(Number(collect[1] || 10), UI_PLAN_MAX_LISTINGS)), source_line: clean };
    if (/^(?:сними|верни|покажи)(?=\s|$|[.:;]).*(?:dom|html|сним|разметк)/iu.test(clean)) return { type: "SNAPSHOT", scope: firstScope(clean), source_line: clean };
    const selectOption = clean.match(/^(?:выбери|выберите)(?=\s|$|[.:;])/iu);
    if (selectOption && quoted[0] && /(?:выпадающ|списк|подсказк|вариант|город|категор|сортир|фильтр)/iu.test(clean)) {
      return { type: "SELECT_OPTION", text: quoted[0].slice(0, 180), source_line: clean };
    }
    const click = clean.match(/^(?:нажми|выбери|открой|раскрой|примени|сбрось)(?=\s|$|[.:;])/iu);
    if (click && (quoted[0] || marker)) return { type: "CLICK", target: marker ? { by: "marker", value: marker } : targetFromText(quoted[0]), source_line: clean };
    return null;
  }
  function parseSequentialCardGap(text, fields) {
    const raw = String(fields["Пауза между карточками"] || directiveValue(text, "Пауза между карточками") || "").trim();
    if (!raw) return { value: null, source: "preserve_checkpoint", error: null };
    const match = raw.match(/^(\d{1,10})\s*(?:мс|ms|миллисекунд(?:а|ы)?|миллисекунд)?\s*[.!;:]*$/iu);
    if (!match) return { value: null, source: "invalid", error: "UI_PLAN_CARD_GAP_INVALID" };
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value) || value < 0 || value > SEQUENTIAL_CARD_GAP_MAX_MS) return { value: null, source: "invalid", error: "UI_PLAN_CARD_GAP_OUT_OF_RANGE" };
    return { value, source: "explicit_field", error: null };
  }
  function parseUiActionPlan(text, fields) {
    const raw = normalizeText(text);
    const explicitQueueUrls = explicitPublicQueueUrls(raw, fields);
    // A URL in the Queue section identifies a collection target, not the page
    // that the run-owned visible Avito tab must navigate to. Navigation is only
    // requested by an explicit «Страница:» field or a standalone public URL.
    const explicitPageUrl = directiveValue(String(fields["Действия"] || fields["Шаги"] || ""), "Страница") || directiveValue(raw, "Страница");
    const standaloneUrl = explicitQueueUrls.length ? "" : firstAvitoUrl(raw);
    const pageUrl = explicitPageUrl || standaloneUrl;
    const reuseExistingAvito = !pageUrl && requestsExistingAvitoContext(raw);
    const timingProfileRaw = String(fields["Темп"] || directiveValue(raw, "Темп") || "").trim().toUpperCase().replace(/[.:;]+$/u, "");
    const timingProfile = timingProfileRaw || "CONTROL_VISIBLE";
    const timingProfileSource = timingProfileRaw ? "explicit_field" : "default_control_visible";
    const cardGap = parseSequentialCardGap(raw, fields);
    const parsed = [];
    const errors = [];
    if (!UI_TIMING_PROFILES.has(timingProfile)) errors.push("UI_PLAN_TIMING_PROFILE_NOT_ALLOWED");
    if (cardGap.error) errors.push(cardGap.error);
    for (const line of genericActionLines(raw, fields)) {
      const step = parseGenericStep(line);
      if (!step) continue;
      if (step.type === "INVALID") { errors.push(step.error); continue; }
      if (planLineForbidden(line)) { errors.push("UI_PLAN_FORBIDDEN_ACTION"); continue; }
      parsed.push(step);
    }
    for (const step of parsed) if (step.type === "COLLECT_EXPLICIT_LISTING_QUEUE") {
      step.selected_urls = explicitQueueUrls;
      if (!explicitQueueUrls.length) errors.push("UI_PLAN_EXPLICIT_PUBLIC_QUEUE_REQUIRED");
    }
    if (!pageUrl && !reuseExistingAvito) errors.push("UI_PLAN_PAGE_REQUIRED");
    else if (pageUrl && !isAvitoUrl(pageUrl)) errors.push("UI_PLAN_PAGE_NOT_ALLOWED");
    if (!parsed.length) errors.push("UI_PLAN_STEP_REQUIRED");
    if (parsed.length > UI_PLAN_MAX_STEPS) errors.push("UI_PLAN_TOO_MANY_STEPS");
    for (const step of parsed) if (!UI_ACTION_TYPES.has(step.type)) errors.push("UI_PLAN_ACTION_NOT_ALLOWED");
    const allowedPlan = parsed.every((step) => step.type !== "CLICK" || step.target?.value);
    if (!allowedPlan) errors.push("UI_PLAN_TARGET_REQUIRED");
    return {
      valid: errors.length === 0,
      errors,
      page_url: pageUrl || null,
      reuse_existing_avito: reuseExistingAvito,
      timing_profile: timingProfile,
      timing_profile_source: timingProfileSource,
      sequential_card_gap_ms: cardGap.value,
      sequential_card_gap_source: cardGap.source,
      steps: parsed,
      plan_fingerprint: fingerprint(JSON.stringify({ pageUrl: pageUrl || null, reuseExistingAvito, timingProfile, cardGap: cardGap.value, steps: parsed.map((step) => ({ type: step.type, target: step.target || null, text: step.text || null, limit: step.limit || null, batch: step.batch || null, urls: step.selected_urls || [] })) }))
    };
  }
  function parseCommandForm(text) {
    const raw = normalizeText(text);
    const fields = parseLabeledSections(raw);
    const detected = inferMode(raw, fields);
    const mode = detected.mode;
    const errors = [];
    if (!mode) errors.push("MODE_UNRESOLVED");
    const candidateCount = parseCandidateLimit(raw, fields);
    let candidateLimit = null;
    let candidateLimitSource = "not_used";
    if (mode === "SEARCH") {
      candidateLimit = Number.isInteger(candidateCount) ? candidateCount : 10;
      candidateLimitSource = Number.isInteger(candidateCount) ? "captured_text" : "default_10";
      if (candidateLimit < 1 || candidateLimit > 30) errors.push("SEARCH_CANDIDATE_LIMIT_OUT_OF_RANGE");
      const city = String(fields["Город"] || directiveValue(raw, "Город") || "").trim();
      if (!city) errors.push("CITY_REQUIRED_FOR_SEARCH");
    }
    let diagnostic = null;
    let ui_plan = null;
    if (mode === "DIAGNOSE_DOM") {
      diagnostic = parseDiagnosticDirective(raw, fields);
      errors.push(...diagnostic.errors);
    }
    if (mode === "AVITO_UI") {
      ui_plan = parseUiActionPlan(raw, fields);
      errors.push(...ui_plan.errors);
    }
    return { valid: errors.length === 0, errors, mode, mode_source: detected.source, candidate_count: candidateLimit, candidate_count_source: candidateLimitSource, fields, diagnostic, ui_plan, raw };
  }
  function makeState(overrides) {
    return Object.assign({
      version: 14, search_id: null, status: "IDLE", phase: "IDLE", started_at: null,
      updated_at: new Date().toISOString(), current_window_id: null, chatgpt_tab_id: null,
      chatgpt_window_id: null, chat_origin: null, chat_path: null, avito_tab_id: null,
      avito_target_bound_once: false, avito_target_binding_source: null,
      avito_navigation_expected: false, avito_navigation_from_url: null, avito_requested_url: null,
      avito_reload_expected: false, avito_reload_previous_time_origin: null, avito_ip_block_reload_count: 0,
      conversation_id: null, anchor_turn_id: null, assistant_turn_id: null, blocked_reason: null,
      chat_context_resume_status: null, chat_context_paused_at: null, chat_context_actual_path: null,
      user_started: false, inspection_only: true, report: null, command_mode: null,
      diagnostic_request: null, ui_action_plan: null, pending_ui_click: null, ui_click_reconcile_deadline_at: null, report_delivery_id: null, report_kind: null,
      // This state is deliberately per run. A new «Ищи» resets it and never
      // assumes an old Avito tab, URL or page.
      last_route_context: null, route_journal: [], last_context_report_fingerprint: null,
      optional_login_dialog_snapshot: null,
      sequential_review: null
    }, overrides || {});
  }
  function routeContextFingerprint(context) {
    if (!context || typeof context !== "object") return "";
    const url = safeUrl(context.url);
    return fingerprint(JSON.stringify({
      page_kind: context.page_kind || "",
      city: context.city || "",
      query: context.query || "",
      dialog_open: Boolean(context.dialog_open),
      local_first: context.local_first === true ? true : context.local_first === false ? false : null,
      login_popup: Boolean(context.login_popup),
      path: url ? `${url.pathname}${url.search}` : ""
    }));
  }
  function routeContextChanged(previous, current) {
    return Boolean(previous && current && routeContextFingerprint(previous) !== routeContextFingerprint(current));
  }
  function appendRouteContext(existing, context, kind) {
    const list = Array.isArray(existing) ? existing.slice(-11) : [];
    list.push({
      at: new Date().toISOString(),
      kind: String(kind || "observed"),
      page_kind: context?.page_kind || "unknown",
      city: context?.city || "",
      query: context?.query || "",
      local_first: context?.local_first === true ? true : context?.local_first === false ? false : null,
      url: context?.url || ""
    });
    return list;
  }
  function compactRouteJournal(journal) {
    const rows = Array.isArray(journal) ? journal.slice(-8) : [];
    if (!rows.length) return "нет подтверждённых шагов";
    return rows.map((row, index) => `${index + 1}. ${row.kind}; ${row.page_kind || "?"}; ${row.city || "город не виден"}; ${row.query || "запрос не виден"}`).join("\n");
  }
  function formatRouteContextReport(searchId, previous, current, journal, reason) {
    return [
      "Avito Finder: видимый контекст Avito изменился; действий на странице не выполнялось.",
      `Задача: ${searchId || "?"}`,
      `Причина: ${reason || "VISIBLE_CONTEXT_CHANGED"}.`,
      previous ? `Предыдущая точка: ${previous.page_kind || "?"}; ${previous.city || "город не виден"}; ${previous.query || "запрос не виден"}.` : "Предыдущая подтверждённая точка отсутствует.",
      "Текущая точка:",
      `- URL: ${current?.url || "не определён"}`,
      `- тип: ${current?.page_kind || "не определён"}`,
      `- город: ${current?.city || "не виден"}`,
      `- запрос: ${current?.query || "не виден"}`,
      `- диалог города: ${current?.dialog_open ? "открыт" : "не открыт"}`,
      `- «Сначала в выбранном городе»: ${current?.local_first === true ? "включён" : current?.local_first === false ? "выключен" : "не определено"}`,
      `- login-popup: ${current?.login_popup ? "виден" : "не виден"}`,
      "Подтверждённый маршрут текущего запуска:",
      compactRouteJournal(journal),
      "Следующий AVITO_UI-план должен начинаться от этой текущей видимой точки. Старые вкладка, URL и tabId не восстанавливаются."
    ].join("\n");
  }
  function formatOptionalLoginPopupObservedReport(searchId, previous, current, journal) {
    return [
      "Avito Finder: обнаружено обычное видимое окно авторизации Avito; действий после его появления не выполнялось.",
      "",
      `Задача: ${searchId || "?"}`,
      "Статус: OPTIONAL_LOGIN_POPUP_OBSERVED",
      "Этап: worker_preflight",
      "Причина: текущую публичную поверхность перекрывает обычный login-popup; CAPTCHA не обнаружена.",
      `Страница: ${current?.url || "не определена"}`,
      "Текущая точка:",
      `- тип: ${current?.page_kind || "не определён"}`,
      `- город: ${current?.city || "не виден"}`,
      `- запрос: ${current?.query || "не виден"}`,
      `- login-popup: ${current?.login_popup ? "виден" : "не виден"}`,
      previous ? `Предыдущая точка: ${previous.page_kind || "?"}; ${previous.city || "город не виден"}; ${previous.query || "запрос не виден"}.` : "Предыдущая подтверждённая точка отсутствует.",
      "Действия после появления overlay: не выполнялись.",
      "Следующий обязательный шаг: ассистент должен запросить DIAGNOSE_DOM с областью DIALOG_VISIBLE и получить сырой снимок текущей формы.",
      "Не закрывать окно автоматически; не вводить телефон, email, пароль, код; не использовать регистрацию, социальный вход или CAPTCHA-обход.",
      "Подтверждённый маршрут текущего запуска:",
      compactRouteJournal(journal)
    ].join("\n");
  }
  function appendLog(existing, type, fields) {
    return [...(Array.isArray(existing) ? existing : []), Object.assign({ at: new Date().toISOString(), type }, fields || {})].slice(-MAX_LOGS);
  }
  function describeControl(item, index) {
    return `${index + 1}. ${item.tag}${item.role ? ` role=${item.role}` : ""}${item.type ? ` type=${item.type}` : ""}${item.data_marker ? ` data-marker=${item.data_marker}` : ""}${item.placeholder ? ` placeholder=${item.placeholder}` : ""}${item.aria_label ? ` [${item.aria_label}]` : ""}${item.title ? ` title=${item.title}` : ""}${item.text ? ` — ${item.text}` : ""}${item.discovery ? ` {${item.discovery}}` : ""}`;
  }
  function formatInspectionReport(inspection) {
    const a = inspection?.avito || {};
    const filters = Array.isArray(a.filter_controls) ? a.filter_controls.map(describeControl).join("\n") : "";
    return [
      "Avito Finder: read-only обследование завершено", "",
      `Задача: ${inspection?.search_id || "?"}`,
      `Статус Avito: ${a.blocked_reason || "DOM доступен"}`,
      `Страница: ${a.url || "?"}`,
      `Корень фильтров: ${a.root_description || "не найден"}`, "",
      `Формы/поля: ${a.input_count ?? "?"}`,
      `Кнопки: ${a.button_count ?? "?"}`,
      `Ссылки-кандидаты: ${a.listing_link_count ?? "?"}`,
      "", "Видимые элементы фильтров:", filters || "не найдены; изменение не выполнялось",
      "Поиск, ввод, изменение фильтров, открытие объявлений и отправка сообщений не выполнялись."
    ].join("\n");
  }
  function formatDiagnosticReport(diagnostic) {
    const d = diagnostic?.avito || {};
    const controls = Array.isArray(d.controls) ? d.controls.map(describeControl).join("\n") : "";
    const filterControls = Array.isArray(d.filter_controls) ? d.filter_controls.map(describeControl).join("\n") : "";
    const candidates = Array.isArray(d.scope_candidates) ? d.scope_candidates.map((candidate, index) => {
      const features = candidate?.features || {};
      const labels = [
        features.hasInput ? "input" : "",
        features.hasCategory ? "category" : "",
        features.hasFind ? "find" : "",
        features.hasLocationMarker ? "location" : ""
      ].filter(Boolean).join(", ") || "нет совпавших признаков";
      const sampleControls = Array.isArray(candidate?.controls) ? candidate.controls.map((item) =>
        `${item.tag}${item.role ? `[role=${item.role}]` : ""}${item.type ? `[type=${item.type}]` : ""}${item.text ? ` — ${item.text}` : ""}`).join(" | ") : "";
      return `${index + 1}. depth=${candidate?.depth ?? "?"}; ${candidate?.description || "?"}; признаки: ${labels}; controls: ${sampleControls || "нет"}`;
    }).join("\n") : "";
    return [
      "Avito Finder: диагностический DOM-снимок", "",
      `Задача: ${diagnostic?.search_id || "?"}`,
      `Страница: ${d.url || "?"}`,
      `Область: ${d.scope || "?"}`,
      `Статус: ${d.blocked_reason || "DOM доступен"}`,
      `Корень: ${d.root_description || "не найден"}`,
      `Снимок: ${d.snapshot_fingerprint || "?"}`,
      `Ограничения: ${d.truncated ? "снимок ограничен по размеру" : "нет"}`,
      "", "Кандидаты области:", candidates || "нет данных",
      "", "DOM-дерево:", d.tree_text || "нет данных",
      "", "Видимые элементы управления:", controls || "нет данных",
      "", "Элементы фильтров:", filterControls || "нет данных",
      "", "Ограниченный HTML-снимок:", d.bounded_html || "нет данных",
      "", "Никакие поля, фильтры, поиск, объявления, сообщения продавцам и скрытые API не использовались."
    ].join("\n").slice(0, 24000);
  }
  function formatUiActionPlanReport(result) {
    const plan = result?.avito || {};
    const steps = Array.isArray(plan.steps) ? plan.steps.map((step) => {
      const detail = [step.target_description || "", step.blocked_reason || "", step.text || "", step.count !== undefined ? `count=${step.count}` : ""].filter(Boolean).join("; ");
      return `${step.index}. ${step.type || "?"}: ${step.status || "?"}${detail ? ` — ${detail}` : ""}`;
    }).join("\n") : "";
    const listings = Array.isArray(plan.listings) ? plan.listings.map((item, index) => `${index + 1}. ${item.title || "без названия"}${item.price ? ` — ${item.price}` : ""}${item.location ? ` — ${item.location}` : ""}${item.seller ? ` — ${item.seller}` : ""}${item.seller_rating ? `; рейтинг/отзывы: ${item.seller_rating}` : ""}${Array.isArray(item.seller_badges) && item.seller_badges.length ? `; признаки продавца: ${item.seller_badges.join(", ")}` : ""}${item.delivery ? `; доставка: ${item.delivery}` : ""}${item.card_bound ? " {card-bound}" : ""}${item.href ? ` — ${item.href}` : ""}`).join("\n") : "";
    const details = plan.listing_details || null;
    const renderPairs = (pairs) => Array.isArray(pairs) && pairs.length ? pairs.map((item) => `- ${item.heading || item.label || "?"}: ${item.text || item.value || "?"}`).join("\n") : "нет данных";
    const listingPassportSection = details ? [
      "", "Публичные данные текущего объявления:",
      `Статус: ${details.blocked_reason || "публичные видимые данные собраны"}`,
      `Заголовок: ${details.title || "нет данных"}`,
      `Цена: ${details.price || "нет данных"}`,
      `Местоположение: ${details.location || "нет данных"}`,
      `Продавец: ${details.seller || "нет данных"}`,
      `Рейтинг/отзывы: ${details.seller_rating || "нет данных"}`,
      `Бейджи продавца: ${(details.seller_badges || []).join("; ") || "нет данных"}`,
      `Доставка: ${(details.delivery || []).join("; ") || "нет данных"}`,
      `Фото: ${details.image_count === null || details.image_count === undefined ? "нет данных" : details.image_count}`,
      "", "Видимые тематические разделы:", renderPairs(details.sections),
      "", "Публичное описание:", details.description || "нет данных",
      "", "Пустые поля означают только отсутствие данных в текущей видимой области; extension не определяет обязательность полей."
    ] : [];
    const sequential = plan.sequential_review || null;
    const sequentialCollected = Array.isArray(sequential?.collected) ? sequential.collected : [];
    const sequentialSection = sequential ? [
      "", "Последовательный сбор по явно переданной очереди:",
      `Статус: ${sequential.status || sequential.blocked_reason || "завершён"}`,
      `Лотов в очереди: ${sequential.candidate_count ?? 0}`,
      `Публичных страниц прочитано: ${sequential.details_collected ?? 0}`,
      `Осталось: ${sequential.remaining ?? 0}`,
      `Размер текущего пакета: ${sequential.batch_size ?? 0}`,
      `Интервал между карточками: ${sequential.card_gap_ms ?? 0} мс`,
      "Открыто одновременно: 1",
      `Автоматически закрыто после чтения: ${sequential.cards_closed ?? 0}`,
      "Порядок: передан ассистентом; extension не сортирует, не оценивает и не выбирает лоты.",
      ...(sequential.captcha ? ["", `Пауза: требуется ручное прохождение CAPTCHA в вкладке «${sequential.captcha.title || "объявление"}». После решения сообщи «капча решена»; расширение продолжит тот же незавершённый проход.`] : []),
      "", "Собранные публичные данные в переданном порядке:",
      sequentialCollected.length ? sequentialCollected.slice(0, 30).map((item, index) => {
        const sections = Array.isArray(item.sections) && item.sections.length ? item.sections.map((entry) => `${entry.heading || "?"}: ${entry.text || "?"}`).join("; ") : "нет видимых тематических разделов";
        return `${index + 1}. ${item.title || "без названия"}${item.price ? `; видимая цена ${item.price}` : "; цена не найдена в видимой области"}${item.location ? `; ${item.location}` : ""}${item.seller ? `; продавец ${item.seller}` : ""}${item.seller_rating ? ` (${item.seller_rating})` : ""}${item.delivery ? `; доставка ${item.delivery}` : ""}${item.href ? ` — ${item.href}` : ""}\n   Видимые разделы: ${sections}\n   Описание: ${item.description || "нет видимого описания"}`;
      }).join("\n") : "нет собранных карточек"
    ] : [];
    const blockedCandidates = Array.isArray(plan.steps) ? plan.steps.filter((step) => Array.isArray(step.candidates) && step.candidates.length).map((step) => {
      const items = step.candidates.slice(0, 8).map((candidate) => `${candidate.description || "?"}${candidate.scope ? ` [${candidate.scope}]` : ""}${candidate.kind ? ` {${candidate.kind}}` : ""}`).join(" | ");
      return `Шаг ${step.index} ${step.type || "?"}: ${items}`;
    }).join("\n") : "";
    const menu = plan.menu || null;
    const menuOptions = Array.isArray(menu?.options) ? menu.options.map((item, index) =>
      `${index + 1}. ${item.label || "без текста"}${item.role ? ` [role=${item.role}]` : ""}${item.tag ? ` <${item.tag}>` : ""}${item.source ? ` {${item.source}}` : ""}`).join("\n") : "";
    const menuSection = menu ? [
      "", "Обнаруженное видимое меню:",
      `Меню: ${menu.menu_id || "?"}`,
      `Поле: ${menu.anchor_description || "?"}`,
      `Статус: ${menu.blocked_reason || "DOM-модель собрана"}`,
      `Вариантов: ${Array.isArray(menu.options) ? menu.options.length : 0}`,
      "Варианты:", menuOptions || "нет видимых вариантов",
      `Контракт: ${menu.contract_fingerprint || "?"}`
    ] : [];
    const snapshot = plan.snapshot || null;
    const controls = Array.isArray(snapshot?.controls) ? snapshot.controls.map((item, index) =>
      `${index + 1}. ${item.tag}${item.role ? ` role=${item.role}` : ""}${item.type ? ` type=${item.type}` : ""}${item.text ? ` — ${item.text}` : ""}${item.aria_label ? ` [${item.aria_label}]` : ""}`).join("\n") : "";
    const loginPopupEvents = Array.isArray(plan.login_popup_events) ? plan.login_popup_events : [];
    const loginPopupSection = loginPopupEvents.length ? [
      "", "Обычное окно авторизации Avito:",
      ...loginPopupEvents.map((event, index) => `${index + 1}. ${event.phase || "?"}: ${event.closed ? "безопасно закрыто" : "не закрыто"}${event.target_description ? ` — ${event.target_description}` : ""}${event.reason ? `; причина: ${event.reason}` : ""}`)
    ] : [];
    const snapshotSection = snapshot ? [
      "", "Диагностический снимок UI-плана:",
      `Область: ${snapshot.scope || "?"}`,
      `Статус: ${snapshot.blocked_reason || "DOM доступен"}`,
      `Корень: ${snapshot.root_description || "не найден"}`,
      `Снимок: ${snapshot.snapshot_fingerprint || "?"}`,
      `Ограничения: ${snapshot.truncated ? "снимок ограничен по размеру" : "нет"}`,
      "", "DOM-дерево:", snapshot.tree_text || "нет данных",
      "", "Видимые элементы управления:", controls || "нет данных",
      "", "Ограниченный HTML-снимок:", snapshot.bounded_html || "нет данных"
    ] : ["", "Диагностический снимок UI-плана: не запрашивался"];
    return [
      "Avito Finder: выполнен ограниченный UI-план", "",
      `Задача: ${result?.search_id || "?"}`,
      `Страница: ${plan.url || "?"}`,
      `Статус: ${plan.blocked_reason || (plan.ok === false ? "остановлен безопасно" : "выполнен")}`,
      `План: ${plan.plan_fingerprint || "?"}`,
      "", "Шаги:", steps || "нет данных",
      ...(blockedCandidates ? ["", "Диагностические кандидаты заблокированных шагов:", blockedCandidates] : []),
      "", "Карточки:", listings || "не собирались",
      ...sequentialSection,
      ...listingPassportSection,
      ...menuSection,
      ...loginPopupSection,
      ...snapshotSection,
      "", "Ограничения: применялись только видимые элементы Avito. Сообщения продавцам, звонки, сделки, оплата, скрытые API и произвольный JavaScript не использовались."
    ].join("\n").slice(0, 24000);
  }
  root.AvitoFinderCore = Object.freeze({
    STORAGE, REQUIRED_COMMAND_LABELS, DIAGNOSTIC_SCOPES, DIAGNOSTIC_ACTIONS, UI_ACTION_TYPES, isChatGPTUrl, isAvitoUrl,
    conversationIdentityFromUrl, isConversationIdentity, sameConversationIdentity,
    samePinnedChatContext, normalizeText, fingerprint, makeSearchId, parseCommandForm,
    makeState, appendLog, routeContextFingerprint, routeContextChanged, appendRouteContext, compactRouteJournal, formatRouteContextReport, formatOptionalLoginPopupObservedReport,
    formatInspectionReport, formatDiagnosticReport, formatUiActionPlanReport
  });
  if (typeof module !== "undefined" && module.exports) module.exports = root.AvitoFinderCore;
})(globalThis);
