/* Avito Finder v1.0.34 — versioned public-DOM adapter with rate-limit classification, direct-delivery proof and bounded cancellable reads. */
/* global chrome, AvitoFinderCore */
(function avitoContent() {
  "use strict";
  const ADAPTER_VERSION = "1.0.37";
  const previous = globalThis.__avitoFinderAvitoRuntime;
  if (previous?.version === ADAPTER_VERSION && !previous.disposed) return;
  previous?.dispose?.();
  const lifetime = { version: ADAPTER_VERSION, generation: 0, disposed: false, busy: false };
  globalThis.__avitoFinderAvitoRuntime = lifetime;
  const menuCaptures = new Set();
  function assertAlive(generation = lifetime.generation) {
    if (lifetime.disposed || generation !== lifetime.generation) throw new Error("AVITO_OPERATION_CANCELLED");
  }
  function cancelOperation() {
    lifetime.generation += 1;
    debuggerTypeTokens.clear(); debuggerClickTokens.clear();
    for (const capture of menuCaptures) stopVisibleMenuCapture(capture);
  }
  lifetime.dispose = () => {
    if (lifetime.disposed) return;
    cancelOperation(); lifetime.disposed = true;
    chrome.runtime.onMessage.removeListener(onAvitoMessage);
  };

  const Core = AvitoFinderCore;
  const MAX_TREE_NODES = 160;
  const MAX_TREE_DEPTH = 6;
  const MAX_CHILDREN = 14;
  const MAX_TEXT = 180;
  const MAX_HTML = 7600;
  const MAX_CONTROLS = 48;
  const MAX_PARENT_DEPTH = 16;
  const UI_PLAN_MAX_STEPS = 12;
  const UI_PLAN_PRE_ACTION_DELAY_MS = Number.isFinite(Number(globalThis.__AF_TEST_UI_DELAY_MS)) ? Number(globalThis.__AF_TEST_UI_DELAY_MS) : 1500;
  const UI_PLAN_POST_ACTION_DELAY_MS = Number.isFinite(Number(globalThis.__AF_TEST_UI_DELAY_MS)) ? Number(globalThis.__AF_TEST_UI_DELAY_MS) : 2000;
  const TIMING_PROFILE_CONTROL_VISIBLE = "CONTROL_VISIBLE";
  const TIMING_PROFILE_COLLECTION_FAST = "COLLECTION_FAST";
  const DEBUGGER_TYPE_TIMEOUT_MS = Number.isFinite(Number(globalThis.__AF_TEST_DEBUGGER_TYPE_TIMEOUT_MS)) ? Number(globalThis.__AF_TEST_DEBUGGER_TYPE_TIMEOUT_MS) : 10000;
  const UI_CLICK_DISPATCH_TIMEOUT_MS = Number.isFinite(Number(globalThis.__AF_TEST_CLICK_DISPATCH_TIMEOUT_MS)) ? Number(globalThis.__AF_TEST_CLICK_DISPATCH_TIMEOUT_MS) : 2200;
  const MENU_CAPTURE_MAX_MS = 5000;
  const MENU_CAPTURE_POLL_MS = 80;
  const MENU_MAX_OPTIONS = 12;
  const MENU_QUERY_MIN_CHARS = 2;
  // A clear/focus can surface a stale list and a temporary field message before
  // the page renders the response to the newly typed text. Keep one bounded,
  // generic observation window instead of treating that first message as final.
  const MENU_INPUT_ERROR_GRACE_MS = 1800;
  const MENU_INPUT_ERROR_QUIET_MS = 240;
  const debuggerTypeTokens = new Map();
  const debuggerClickTokens = new Map();
  const SAFE_ATTRIBUTES = new Set(["id", "class", "role", "aria-label", "aria-expanded", "aria-controls", "placeholder", "name", "type", "title", "data-marker", "href", "disabled", "checked", "label"]);

  function visible(element) {
    if (!(element instanceof Element)) return false;
    for (let node=element; node instanceof Element; node=node.parentElement) {
      const style=window.getComputedStyle(node);
      if (node.hidden || style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse' || style.opacity==='0') return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function disabledControl(element) {
    return !(element instanceof Element) || element.matches(':disabled') || Boolean(element.closest('[inert],[aria-disabled="true"]'));
  }
  function textOf(element, max) {
    return Core.normalizeText(element && (element.innerText || element.textContent || "")).slice(0, max || MAX_TEXT);
  }
  // Listing cards commonly expose relative href values. Normalize them against the
  // currently rendered Avito document before any public-URL validation.
  function safeUrl(value, base = location.href) {
    try {
      const url = new URL(String(value || ""), base);
      return Core.isAvitoUrl(url.href) ? url : null;
    } catch (_) { return null; }
  }
  function safeHref(element) {
    const url = safeUrl(element?.getAttribute?.("href") || "");
    return url ? `${url.pathname}${url.search}`.slice(0, 500) : "";
  }
  function navigationHrefForVisibleClick(element) {
    if (!(element instanceof HTMLAnchorElement)) return "";
    const href = safeHref(element);
    if (!href) return "";
    try {
      const next = new URL(href, location.href);
      const current = new URL(location.href);
      const nextPath = `${next.pathname}${next.search}`;
      const currentPath = `${current.pathname}${current.search}`;
      if (next.origin !== current.origin || nextPath === currentPath) return "";
      return nextPath.slice(0, 500);
    } catch (_) { return ""; }
  }
  function diagnosticText(element, max = MAX_TEXT) {
    if (!(element instanceof Element) || element.matches("input,textarea,select,[contenteditable='true']")) return "";
    const parts = []; let count = 0, chars = 0;
    function visit(node) {
      if (++count > 350 || chars > max * 3) return;
      if (node.nodeType === Node.TEXT_NODE) {const text=Core.normalizeText(node.nodeValue||"");parts.push(text);chars+=text.length;return;}
      if (!(node instanceof Element) || !visible(node) || node.matches("input,textarea,select,[contenteditable='true'],script,style")) return;
      for (const child of node.childNodes) visit(child);
    }
    visit(element);
    return publicText(parts.join(" "), max);
  }
  function compactNode(element) {
    return {
      tag: element.tagName.toLowerCase(),
      id: (element.id || "").slice(0, 120),
      class_name: (element.className && typeof element.className === "string" ? element.className : "").slice(0, 240),
      role: element.getAttribute("role") || "",
      type: element.getAttribute("type") || "",
      name: element.getAttribute("name") || "",
      aria_label: element.getAttribute("aria-label") || "",
      placeholder: element.getAttribute("placeholder") || "",
      title: element.getAttribute("title") || "",
      href: safeHref(element),
      data_marker: element.getAttribute("data-marker") || "",
      disabled: disabledControl(element),
      checked: Boolean(element.checked || element.getAttribute("aria-checked") === "true"),
      text: diagnosticText(element)
    };
  }
  function detectBlock() {
    const probe = Core.publicPageInterruptionProbe();
    if (probe.captcha) return "BLOCKED_LOGIN_OR_CAPTCHA";
    if (probe.rate_limit) return "AVITO_RATE_LIMIT";
    if (probe.ip_block) return "AVITO_IP_BLOCK";
    return null;
  }
  const OPTIONAL_LOGIN_TEXT_RE = /(?:^|\s)(?:вход|войти|войдите|авторизац|регистрац|sign\s*in|log\s*in)(?:$|\s)/iu;
  const OPTIONAL_LOGIN_CREDENTIAL_RE = /(?:телефон\s+или\s+почта|электронн\w*\s+почт|пароль|забыли\s+пароль|продолжить\s+через|нет\s+аккаунта)/iu;
  const OPTIONAL_LOGIN_CLOSE_RE = /(?:закрыть|close|dismiss|\u00d7|\u2715|\u2716|\u2717|^x$)/iu;

  function loginPopupRootCandidates() {
    const nodes = []; const seen = new Set();
    const add = (node) => {
      if (!(node instanceof Element) || seen.has(node) || !visible(node)) return;
      seen.add(node); nodes.push(node);
    };
    for (const node of Array.from(document.querySelectorAll("[role='dialog'],[aria-modal='true'],auth-popup-authdeferredtoasts,[data-marker*='auth'],[data-marker*='login']"))) add(node);
    for (const input of Array.from(document.querySelectorAll("input[type='password'],input[autocomplete='current-password'],input[autocomplete='new-password']")).filter(visible)) {
      add(input.closest("[role='dialog'],[aria-modal='true'],form,section,article,div"));
    }
    return nodes;
  }

  function optionalLoginPopup() {
    const candidates = [];
    for (const root of loginPopupRootCandidates()) {
      const text = textOf(root, 1200);
      if (!text || /captcha|капч/iu.test(text)) continue;
      const credentialNodes = Array.from(root.querySelectorAll("input[type='password'],input[autocomplete='current-password'],input[autocomplete='new-password']")).filter(visible);
      const hasCredentialSurface = credentialNodes.length > 0 || OPTIONAL_LOGIN_CREDENTIAL_RE.test(text);
      const hasLoginText = OPTIONAL_LOGIN_TEXT_RE.test(text);
      if (!hasLoginText || !hasCredentialSurface) continue;
      const bounds = root.getBoundingClientRect();
      const marker = `${root.getAttribute("data-marker") || ""} ${root.getAttribute("role") || ""}`;
      const score = (credentialNodes.length ? 60 : 30) + (root.getAttribute("role") === "dialog" ? 40 : 0) + (/auth|login/iu.test(marker) ? 15 : 0) - Math.min(24, Math.floor(text.length / 280));
      candidates.push({ root, text, score, bounds });
    }
    candidates.sort((left, right) => right.score - left.score || Math.abs((left.bounds?.width || 0) * (left.bounds?.height || 0)) - Math.abs((right.bounds?.width || 0) * (right.bounds?.height || 0)));
    return candidates[0] || null;
  }

  function firstVisible(selectors, root = document) {
    for (const selector of selectors) {
      const found = Array.from(root.querySelectorAll(selector)).find(visible);
      if (found) return { element: found, selector };
    }
    return null;
  }
  function closestMeaningful(element) {
    if (!(element instanceof Element)) return null;
    return element.closest("section,article,form,[role='main'],main,[role='dialog'],[data-marker],div") || element;
  }
  function textMatchRoot(keyword) {
    const candidates = Array.from(document.querySelectorAll("h1,h2,h3,h4,[role='heading'],button,a,div,span"));
    const match = candidates.find((node) => visible(node) && textOf(node, 120).toLowerCase().includes(keyword));
    return match ? closestMeaningful(match) : null;
  }
  function controlsInOrSelf(root, limit = MAX_CONTROLS) {
    const nodes = [];
    if (root?.matches?.("input,textarea,select,button,a,[role='button'],[role='combobox'],[role='checkbox'],[role='radio']") && visible(root)) nodes.push(root);
    for (const node of Array.from(root?.querySelectorAll?.("input,textarea,select,button,a,[role='button'],[role='combobox'],[role='checkbox'],[role='radio']") || [])) {
      if (visible(node)) nodes.push(node);
      if (nodes.length >= limit) break;
    }
    return nodes.slice(0, limit);
  }
  function shortControls(root, limit = 12) {
    return controlsInOrSelf(root, limit).map((node) => compactNode(node));
  }
  function searchSurfaceFeatures(root, input) {
    const controls = controlsInOrSelf(root, MAX_CONTROLS);
    const controlText = controls.map((node) => textOf(node, 140));
    const visibleText = textOf(root, 1600);
    const hasInput = root === input || root.contains(input);
    const hasCategory = controlText.some((value) => /все\s+категори/i.test(value)) || /все\s+категори/i.test(visibleText);
    const hasFind = controls.some((node) => /найти/i.test(textOf(node, 80))) || /(?:^|\n)\s*найти\s*(?:$|\n)/iu.test(visibleText);
    const hasLocationMarker = controls.some((node) => /(?:location|geo|region|city|город|насел)/iu.test(`${node.getAttribute("data-marker") || ""} ${node.getAttribute("name") || ""} ${node.getAttribute("aria-label") || ""} ${textOf(node, 80)}`));
    const clickableText = controlText.filter(Boolean).slice(0, 12);
    return { hasInput, hasCategory, hasFind, hasLocationMarker, clickableText, controlCount: controls.length };
  }
  function parentSearchCandidates(input) {
    const candidates = [];
    let node = input.parentElement;
    let depth = 1;
    while (node && depth <= MAX_PARENT_DEPTH && node !== document.body && node !== document.documentElement) {
      if (visible(node)) {
        const features = searchSurfaceFeatures(node, input);
        candidates.push({
          root: node,
          depth,
          features,
          controls: shortControls(node, 12),
          description: `${node.tagName.toLowerCase()} depth=${depth} class=${String(node.className || "").slice(0, 160)} marker=${node.getAttribute("data-marker") || ""}`
        });
      }
      node = node.parentElement;
      depth += 1;
    }
    return candidates;
  }
  function findSearchInput() {
    return firstVisible(["input[data-marker='search-form/suggest/input']", "[role='search'] input", "form input[placeholder]", "input[placeholder]", "input[type='search']"]);
  }
  function reportableCandidates(candidates) {
    return candidates.map((candidate) => ({ depth: candidate.depth, description: candidate.description, features: candidate.features, controls: candidate.controls }));
  }
  function resolveSearchSurface() {
    const hit = findSearchInput();
    if (!hit) return null;
    const candidates = parentSearchCandidates(hit.element);
    // The category control may be rendered beside, not inside, the form root.
    // A visible input plus an explicit Find action is the smallest stable surface.
    const exact = candidates.find((candidate) => candidate.features.hasInput && candidate.features.hasFind && candidate.features.hasCategory)
      || candidates.find((candidate) => candidate.features.hasInput && candidate.features.hasFind);
    if (!exact) {
      return { root: null, resolution: `${hit.selector}:parent_climb_unresolved`, candidates: reportableCandidates(candidates) };
    }
    const featureNames = ["input", exact.features.hasCategory ? "category" : "category-unresolved", "find", exact.features.hasLocationMarker ? "location-marker" : "location-unresolved"].join(",");
    return { root: exact.root, resolution: `${hit.selector}:parent_climb depth=${exact.depth} features=${featureNames}`, candidates: reportableCandidates(candidates) };
  }
  function resolveSearchInputAncestry() {
    const hit = findSearchInput();
    if (!hit) return null;
    const candidates = parentSearchCandidates(hit.element);
    return { root: null, resolution: `${hit.selector}:parent_chain`, candidates: reportableCandidates(candidates), informational: true };
  }
  function resolveSearchInputParent(request) {
    const hit = findSearchInput();
    if (!hit) return null;
    const candidates = parentSearchCandidates(hit.element);
    const depth = Number(request?.parent_depth);
    const target = candidates.find((candidate) => candidate.depth === depth);
    if (!target) return { root: null, resolution: `${hit.selector}:parent_depth_${Number.isFinite(depth) ? depth : "invalid"}_unresolved`, candidates: reportableCandidates(candidates) };
    return { root: target.root, resolution: `${hit.selector}:parent_depth=${target.depth}`, candidates: reportableCandidates(candidates) };
  }

  const FILTER_CONTROL_SELECTOR = "input,textarea,select,button,a,[role='button'],[role='combobox'],[role='checkbox'],[role='radio']";
  const FILTER_SIGNAL_RE = /(?:\bprice\b|цен|\bfilter\b|фильтр|достав|состояни|сортиров|продав|покупател|\bот\b|\bдо\b)/iu;

  function filterSignalText(element) {
    return [
      element.getAttribute("data-marker") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("placeholder") || "",
      element.getAttribute("title") || "",
      element.getAttribute("name") || "",
      element.getAttribute("class") || "",
      textOf(element, 260)
    ].join(" ");
  }
  function belongsToVisibleListing(element) {
    return Boolean(element.closest("[data-marker*='item'],[itemtype*='Product'],article[data-marker],article[itemtype]"));
  }
  function firstVisibleListingTop() {
    const listing = firstVisible(["[data-marker*='item']", "[itemtype*='Product']", "a[data-marker='title']"]);
    const rect = listing?.element?.getBoundingClientRect?.();
    return rect && rect.height > 0 ? rect.top : null;
  }
  function inlineFilterControls() {
    const input = findSearchInput()?.element || null;
    const searchBottom = input?.getBoundingClientRect?.()?.bottom || 0;
    const listingTop = firstVisibleListingTop();
    return Array.from(document.querySelectorAll(FILTER_CONTROL_SELECTOR)).filter((node) => {
      if (!visible(node) || belongsToVisibleListing(node)) return false;
      if (node.closest("[data-marker='header/navbar'],[data-marker='header-navigation'],header,nav")) return false;
      const rect = node.getBoundingClientRect();
      if (rect.bottom < searchBottom - 8) return false;
      if (listingTop !== null && rect.top > listingTop + 8) return false;
      return true;
    }).slice(0, 24);
  }
  function lowestSharedAncestor(nodes) {
    const first = nodes[0];
    let current = first instanceof Element ? first : null;
    while (current && current !== document.body && current !== document.documentElement) {
      if (nodes.every((node) => current.contains(node)) && visible(current)) return current;
      current = current.parentElement;
    }
    const main = firstVisible(["main", "[role='main']", "[data-marker='page-main']", "[data-marker='item-view']"]);
    return main?.element || (visible(document.body) ? document.body : null);
  }
  function filterSurfaceDetails() {
    const all = Array.from(document.querySelectorAll(FILTER_CONTROL_SELECTOR)).filter(visible);
    const byNode = new Map();
    for (const node of all) {
      if (!belongsToVisibleListing(node) && FILTER_SIGNAL_RE.test(filterSignalText(node))) byNode.set(node, "text_or_attribute");
    }
    for (const node of inlineFilterControls()) if (!byNode.has(node)) byNode.set(node, "inline_results_band");
    const nodes = Array.from(byNode.keys()).slice(0, 24);
    return {
      nodes,
      controls: nodes.map((node) => ({ ...compactNode(node), discovery: byNode.get(node) || "unknown" })),
      root: nodes.length ? lowestSharedAncestor(nodes) : null
    };
  }
  function resolveFiltersSurface() {
    const details = filterSurfaceDetails();
    const fallback = firstVisible(["main", "[role='main']", "[data-marker='page-main']", "[data-marker='item-view']"]);
    const root = details.root || fallback?.element || (visible(document.body) ? document.body : null);
    return root ? {
      root,
      resolution: details.nodes.length ? `visible_filter_controls=${details.nodes.length}` : "visible_filter_controls_unresolved",
      filter_controls: details.controls
    } : null;
  }
  function resolveScope(scope, request = {}) {
    if (scope === "PAGE_MAIN_VISIBLE") {
      const hit = firstVisible(["main", "[role='main']", "[data-marker='page-main']", "[data-marker='item-view']"]);
      if (hit) return { root: hit.element, resolution: hit.selector };
      return visible(document.body) ? { root: document.body, resolution: "body_visible_fallback" } : null;
    }
    if (scope === "SEARCH_SURFACE_VISIBLE") return resolveSearchSurface();
    if (scope === "SEARCH_INPUT_ANCESTRY_VISIBLE") return resolveSearchInputAncestry();
    if (scope === "SEARCH_INPUT_PARENT_VISIBLE") return resolveSearchInputParent(request);
    if (scope === "FILTERS_VISIBLE") return resolveFiltersSurface();
    if (scope === "DIALOG_VISIBLE") {
      const dialog = firstVisible(["[role='dialog'][aria-modal='true']", "[role='dialog']", "[aria-modal='true']"]);
      return dialog ? { root: dialog.element, resolution: dialog.selector } : null;
    }
    if (scope === "LISTING_CARD_VISIBLE") {
      const card = firstVisible(["a[href*='/item/']", "[data-marker*='item'] a"]);
      return card ? { root: closestMeaningful(card.element), resolution: `${card.selector}:closest_meaningful` } : null;
    }
    if (scope === "REVIEWS_VISIBLE") {
      const root = textMatchRoot("отзывы") || textMatchRoot("отзыв");
      return root ? { root, resolution: "visible_text:отзывы" } : null;
    }
    return null;
  }
  function nodeLabel(element) {
    const node = compactNode(element);
    const attrs = [
      node.id ? `#${node.id}` : "",
      node.role ? `[role=${node.role}]` : "",
      node.type ? `[type=${node.type}]` : "",
      node.name ? `[name=${node.name}]` : "",
      node.aria_label ? `[aria=${node.aria_label}]` : ""
    ].filter(Boolean).join("");
    return `${node.tag}${attrs}${node.text ? ` — ${node.text}` : ""}`.slice(0, 340);
  }
  function buildTree(root) {
    const lines = []; let count = 0; let truncated = false;
    function walk(node, depth) {
      if (!(node instanceof Element) || !visible(node)) return;
      if (count >= MAX_TREE_NODES || depth > MAX_TREE_DEPTH) { truncated = true; return; }
      count += 1; lines.push(`${"  ".repeat(depth)}- ${nodeLabel(node)}`);
      const children = Array.from(node.children).filter(visible);
      if (children.length > MAX_CHILDREN) truncated = true;
      for (const child of children.slice(0, MAX_CHILDREN)) walk(child, depth + 1);
    }
    walk(root, 0);
    return { text: lines.join("\n").slice(0, 7200), count, truncated };
  }
  function sanitizeClone(root) {
    let nodeCount = 0, truncated = false;
    const excluded = /^(?:SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|IFRAME|CANVAS|SVG|VIDEO|AUDIO)$/;
    function copy(source, depth) {
      if (!(source instanceof Element) || !visible(source) || excluded.test(source.tagName)) return null;
      if (++nodeCount > 500 || depth > 24) { truncated = true; return null; }
      const target = source.cloneNode(false);
      for (const attribute of Array.from(target.attributes || [])) {
        if (!SAFE_ATTRIBUTES.has(attribute.name.toLowerCase())) target.removeAttribute(attribute.name);
        else if (attribute.name.toLowerCase() === "href") {
          const href = safeHref(source);
          if (href) target.setAttribute("href", href); else target.removeAttribute("href");
        }
      }
      if (source.matches("input,textarea,select")) {
        target.removeAttribute("value"); target.removeAttribute("checked"); target.removeAttribute("selected");
        target.setAttribute("data-value-redacted", "1");
        // textarea text nodes and option labels can themselves contain user data.
        return target;
      }
      for (const child of Array.from(source.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const value = publicText(child.nodeValue || "", 220);
          if (value) target.appendChild(document.createTextNode(value));
        } else if (child instanceof Element) { const clean = copy(child, depth + 1); if (clean) target.appendChild(clean); }
      }
      return target;
    }
    const clone = copy(root, 0);
    let html = clone?.outerHTML || "";
    if (html.length > MAX_HTML) { html = `${html.slice(0, MAX_HTML)}\n<!-- truncated -->`; truncated = true; }
    return { html, truncated };
  }
  function controlsWithin(root) {
    // SVG controls are included only when they expose a visible stable marker/label.
    // They are reported for an assistant-directed explicit CLICK; no login-specific
    // selector or automatic action is inferred from them.
    return Array.from(root.querySelectorAll("input,textarea,select,button,a,[role='button'],[role='combobox'],[role='checkbox'],[role='radio'],svg[data-marker],svg[aria-label],svg[title]"))
      .filter(visible).slice(0, MAX_CONTROLS).map(compactNode);
  }
  function diagnose(request) {
    const blocked = detectBlock();
    const scope = String(request?.scope || "").toUpperCase();
    const pageUrl = String(request?.page_url || "");
    if (!Core.isAvitoUrl(location.href)) return { url: location.href, blocked_reason: "DIAGNOSTIC_TARGET_NOT_AVITO", scope };
    if (pageUrl && !Core.isAvitoUrl(pageUrl)) return { url: location.href, blocked_reason: "DIAGNOSTIC_REQUEST_URL_NOT_ALLOWED", scope };
    const resolved = resolveScope(scope, request);
    if (!resolved || !resolved.root) {
      const snapshot = {
        url: location.href, title: document.title, captured_at: new Date().toISOString(), scope,
        blocked_reason: blocked || (resolved?.informational ? null : "BLOCKED_SCOPE_UNRESOLVED"),
        root_description: resolved?.resolution || "область не найдена",
        scope_candidates: Array.isArray(resolved?.candidates) ? resolved.candidates : [],
        filter_controls: Array.isArray(resolved?.filter_controls) ? resolved.filter_controls : [],
        actions_performed: "none_read_only"
      };
      snapshot.snapshot_fingerprint = Core.fingerprint(JSON.stringify({ scope: snapshot.scope, root: snapshot.root_description, candidates: snapshot.scope_candidates }));
      return snapshot;
    }
    const tree = buildTree(resolved.root);
    const html = sanitizeClone(resolved.root);
    const snapshot = {
      url: location.href,
      title: document.title,
      captured_at: new Date().toISOString(),
      scope,
      requested_page_url: pageUrl || location.href,
      blocked_reason: blocked,
      root_description: `${resolved.root.tagName.toLowerCase()} via ${resolved.resolution}`,
      root_resolution: resolved.resolution,
      tree_text: tree.text,
      tree_node_count: tree.count,
      controls: controlsWithin(resolved.root),
      filter_controls: Array.isArray(resolved.filter_controls) ? resolved.filter_controls : [],
      bounded_html: html.html,
      truncated: Boolean(tree.truncated || html.truncated),
      actions_performed: "none_read_only"
    };
    snapshot.snapshot_fingerprint = Core.fingerprint(JSON.stringify({ scope: snapshot.scope, root: snapshot.root_description, tree: snapshot.tree_text, filter_controls: snapshot.filter_controls, html: snapshot.bounded_html }));
    return snapshot;
  }
  async function uiDelay(ms) {
    const generation = lifetime.generation, end = Date.now() + Math.max(0, Number(ms) || 0);
    do { assertAlive(generation); await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, end - Date.now())))); } while (Date.now() < end);
    assertAlive(generation);
  }
  function timingProfileForPlan(plan) {
    return String(plan?.timing_profile || TIMING_PROFILE_CONTROL_VISIBLE).toUpperCase() === TIMING_PROFILE_COLLECTION_FAST
      ? TIMING_PROFILE_COLLECTION_FAST
      : TIMING_PROFILE_CONTROL_VISIBLE;
  }
  function isCollectionStep(step) {
    const type = String(step?.type || "").toUpperCase();
    return type === "COLLECT_LISTINGS" || type === "COLLECT_LISTING_DETAILS";
  }
  function nextPlanStep(steps, offset) {
    for (let index = Number(offset) + 1; index < steps.length; index += 1) {
      const step = steps[index] || {};
      if (String(step.type || "").toUpperCase() !== "WAIT") return step;
    }
    return null;
  }
  function stepPreActionDelay(plan, steps, offset) {
    const current = steps[offset] || {};
    const next = nextPlanStep(steps, offset);
    // A listing-detail pass is the collection phase. Skip only the artificial
    // pause immediately before opening a card; page-readiness remains mandatory.
    if (timingProfileForPlan(plan) === TIMING_PROFILE_COLLECTION_FAST && String(current.type || "").toUpperCase() === "CLICK" && isCollectionStep(next)) return 0;
    return UI_PLAN_PRE_ACTION_DELAY_MS;
  }
  function stepPostActionDelay(plan, steps, offset) {
    const next = nextPlanStep(steps, offset);
    // Do not delay between a completed visible control and an immediate read-only
    // collector. This does not bypass DOM/menu/page readiness checks.
    if (timingProfileForPlan(plan) === TIMING_PROFILE_COLLECTION_FAST && isCollectionStep(next)) return 0;
    return UI_PLAN_POST_ACTION_DELAY_MS;
  }
  function normalizedMatch(value) { return Core.normalizeText(value).toLocaleLowerCase("ru-RU"); }
  function actionElements(kind) {
    const selector = kind === "TYPE"
      ? "input,textarea,[contenteditable='true']"
      // A marked/labelled SVG is eligible only after the assistant has explicitly
      // selected it from a current visible diagnostic. It is not a route-specific rule.
      : "button,a,[role='button'],[role='combobox'],label,svg[data-marker],svg[aria-label],svg[title]";
    return Array.from(document.querySelectorAll(selector)).filter(visible);
  }
  function actionCandidate(node) {
    return {
      element: node,
      description: `${node.tagName.toLowerCase()}${node.getAttribute("data-marker") ? ` data-marker=${node.getAttribute("data-marker")}` : ""}${node.getAttribute("placeholder") ? ` placeholder=${node.getAttribute("placeholder")}` : ""}${textOf(node, 120) ? ` text=${textOf(node, 120)}` : ""}`.slice(0, 360),
      text: textOf(node, 180),
      marker: node.getAttribute("data-marker") || "",
      placeholder: node.getAttribute("placeholder") || "",
      aria: node.getAttribute("aria-label") || "",
      title: node.getAttribute("title") || ""
    };
  }
  function selectionInputContext(dialog, remembered) {
    const rememberedElement = remembered?.element;
    if (editableControl(rememberedElement) && rememberedElement.isConnected && visible(rememberedElement) && dialog.contains(rememberedElement)) return rememberedElement;
    const active = document.activeElement;
    if (editableControl(active) && visible(active) && dialog.contains(active)) return active;
    const inputs = Array.from(dialog.querySelectorAll("input,textarea,[contenteditable='true']")).filter((node) => editableControl(node) && visible(node));
    return inputs.length === 1 ? inputs[0] : null;
  }
  function menuLabelKey(value) {
    return Core.normalizeText(value || "").toLocaleLowerCase("ru-RU")
      .replace(/[\p{P}\p{S}_]+/gu, " ").replace(/\s+/gu, " ").trim();
  }
  function rectData(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
    return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
  }
  function rectIntersectsViewport(rect) {
    return Boolean(rect && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight);
  }
  function visibleLeafText(element, limit = 260) {
    if (!(element instanceof Element)) return "";
    const values = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || !visible(parent)) continue;
      const value = Core.normalizeText(node.nodeValue || "");
      if (value) values.push(value);
      if (values.join(" ").length >= limit) break;
    }
    return Core.normalizeText(values.join(" ")).slice(0, limit);
  }
  function elementSignature(element) {
    if (!(element instanceof Element)) return "";
    return [element.tagName.toLowerCase(), element.getAttribute("role") || "", element.getAttribute("aria-label") || "", element.getAttribute("data-marker") || ""].join("|").slice(0, 300);
  }
  function targetForbidden(node) {
    const own = [
      textOf(node, 280), node.getAttribute("data-marker") || "", node.getAttribute("aria-label") || "", node.getAttribute("title") || "", safeHref(node)
    ].join(" ");
    const nearby = textOf(node.closest("[role='dialog'],form,article,section,div") || node, 450);
    return /(?:написать|сообщени|чат\b|продавц|позвон|звонок|телефон|phone|купить|оплат|заказ|корзин|оформить\s+достав|брон)/iu.test(`${own} ${nearby}`);
  }
  function pointerReachable(element) {
    if (!visible(element)) return false;
    const rect = element.getBoundingClientRect();
    const left=Math.max(0,rect.left), right=Math.min(innerWidth,rect.right);
    const top=Math.max(0,rect.top), bottom=Math.min(innerHeight,rect.bottom);
    if(right<=left || bottom<=top) return false;
    // A buried element in elementsFromPoint is not the target of the click.
    const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);
    return Boolean(hit && (hit===element || element.contains(hit)));
  }
  function menuDiscoverySelector() {
    return "button,a,label,[role],[tabindex]";
  }
  function isBroadPageContainer(element) {
    if (!(element instanceof Element)) return true;
    const tag = element.tagName.toLowerCase();
    if (["html", "body", "main", "header", "nav", "footer"].includes(tag)) return true;
    const rect = element.getBoundingClientRect();
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    return rect.width * rect.height > viewportArea * 0.70 && element.children.length > 8;
  }
  function candidateInMenuBand(element, input) {
    const rect = element?.getBoundingClientRect?.();
    const anchor = input?.getBoundingClientRect?.();
    if (!rectIntersectsViewport(rect) || !rectIntersectsViewport(anchor)) return false;
    const horizontalOverlap = Math.max(0, Math.min(rect.right, anchor.right) - Math.max(rect.left, anchor.left));
    const horizontalGap = Math.max(0, Math.max(anchor.left - rect.right, rect.left - anchor.right));
    const allowedHorizontalGap = Math.max(48, anchor.width * 0.42);
    const startsBelowAnchor = rect.top >= anchor.top - Math.min(12, anchor.height * 0.35);
    const maxDistance = Math.max(96, Math.min(460, window.innerHeight * 0.54));
    const closeBelowAnchor = rect.top <= anchor.bottom + maxDistance;
    const isRowSized = rect.height <= Math.max(180, window.innerHeight * 0.28) && rect.width <= Math.max(1100, window.innerWidth * 0.96);
    return isRowSized && startsBelowAnchor && closeBelowAnchor
      && (horizontalOverlap >= Math.min(24, anchor.width * 0.12) || horizontalGap <= allowedHorizontalGap);
  }
  function temporalElement(capture, element) {
    if (!capture || !(element instanceof Element)) return false;
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 7; depth += 1, current = current.parentElement) {
      if (capture.added.has(current) || capture.changed.has(current)) return true;
    }
    return false;
  }
  function recordTemporalNode(capture, node, kind) {
    const element = node instanceof Element ? node : node?.parentElement;
    if (!element || isBroadPageContainer(element)) return;
    capture.last_mutation_at = Date.now();
    const bucket = kind === "added" ? capture.added : capture.changed;
    if (bucket.size < 240) bucket.add(element);
    const descendants = Array.from(element.querySelectorAll?.(menuDiscoverySelector()) || []).slice(0, 48);
    for (const child of descendants) {
      if (!isBroadPageContainer(child) && bucket.size < 240) bucket.add(child);
    }
  }
  function startVisibleMenuCapture(input) {
    const startedAt = Date.now();
    const capture = { input, started_at: startedAt, last_mutation_at: startedAt, added: new Set(), changed: new Set(), observer: null, stopped: false };
    if (!(input instanceof Element)) return capture;
    menuCaptures.add(capture);
    try {
      capture.observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "attributes") recordTemporalNode(capture, record.target, "changed");
          for (const node of Array.from(record.addedNodes || [])) recordTemporalNode(capture, node, "added");
        }
      });
      capture.observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-expanded", "aria-hidden", "hidden", "style", "class", "role"]
      });
    } catch (_) {}
    return capture;
  }
  function stopVisibleMenuCapture(capture) {
    if (!capture || capture.stopped) return;
    capture.stopped = true; menuCaptures.delete(capture);
    try { capture.observer?.disconnect(); } catch (_) {}
  }
  function interactiveMenuTarget(node, input, capture) {
    let current = node instanceof Element ? node : null;
    for (let depth = 0; current && current !== document.body && depth < 7; depth += 1, current = current.parentElement) {
      if (isBroadPageContainer(current) || !visible(current) || !candidateInMenuBand(current, input) || !temporalElement(capture, current)) continue;
      const role = (current.getAttribute("role") || "").toLowerCase();
      const tag = current.tagName.toLowerCase();
      const cursor = window.getComputedStyle(current).cursor;
      const semantic = tag === "button" || tag === "a" || tag === "label" || ["option", "listitem", "menuitem", "checkbox", "radio", "button"].includes(role) || current.tabIndex >= 0 || cursor === "pointer";
      if (semantic && !disabledControl(current)) return current;
    }
    return null;
  }
  function fieldStateMessage(input) {
    if (!(input instanceof Element)) return "";
    const anchor = input.closest("[role='combobox']") || input.parentElement;
    const root = anchor?.parentElement;
    if (!root) return "";
    const value = Core.normalizeText(readEditableValue(input));
    const placeholder = Core.normalizeText(input.getAttribute("placeholder") || "");
    const messages = Array.from(root.children || [])
      .filter((node) => node !== anchor && visible(node))
      .map((node) => visibleLeafText(node, 180))
      .filter((text) => text && text !== value && text !== placeholder)
      .filter((text) => /(?:неизвест|ошибк|не найден|нет подходящ|некоррект|недоступ)/iu.test(text));
    return Core.normalizeText(messages[0] || "").slice(0, 180);
  }
  function dedupeMenuRows(rows) {
    const sorted = rows.slice().sort((left, right) => {
      const leftArea = (left.bounds?.width || 0) * (left.bounds?.height || 0);
      const rightArea = (right.bounds?.width || 0) * (right.bounds?.height || 0);
      return leftArea - rightArea || (left.bounds?.top || 0) - (right.bounds?.top || 0);
    });
    const kept = [];
    for (const row of sorted) {
      if (kept.some((other) => other.element === row.element || other.element.contains(row.element) || row.element.contains(other.element))) continue;
      kept.push(row);
    }
    return kept.sort((left, right) => (left.bounds?.top || 0) - (right.bounds?.top || 0) || (left.bounds?.left || 0) - (right.bounds?.left || 0));
  }
  function associatedMenuRoots(input) {
    if (!(input instanceof Element)) return [];
    const anchor=input.closest('[role="combobox"]') || input;
    const ids=new Set(`${input.getAttribute('aria-controls')||''} ${anchor.getAttribute('aria-controls')||''}`.trim().split(/\s+/u).filter(Boolean));
    return [...ids].slice(0,8).map(id=>document.getElementById(id))
      .filter(root=>root && visible(root) && root.matches('[role="listbox"],[role="menu"],[role="tree"],[role="grid"]'));
  }
  function rawMenuOptionCandidates(input, capture) {
    const seen = new Set();
    const rows = [];
    const associated=associatedMenuRoots(input);
    for (const node of Array.from(document.querySelectorAll(menuDiscoverySelector()))) {
      if (!(node instanceof Element) || !visible(node)) continue;
      // Stable aria-controls ownership survives a new command. Mutation timing
      // is only a fallback for custom widgets without that semantic relation.
      const linkedRoot=associated.find(root=>root.contains(node));
      const linked=linkedRoot && node.matches('[role="option"],[role="menuitem"],[role="treeitem"],[role="row"]') && !disabledControl(node);
      if (!linked && !candidateInMenuBand(node,input)) continue;
      const target = linked ? node : interactiveMenuTarget(node, input, capture);
      if (!target || seen.has(target) || targetForbidden(target) || !pointerReachable(target)) continue;
      const label = visibleLeafText(target, 260) || textOf(target, 260);
      const labelKey = menuLabelKey(label);
      if (!labelKey || labelKey.length < 2) continue;
      seen.add(target);
      rows.push({
        selection_kind: "temporal_visible_menu",
        element: target,
        label,
        label_key: labelKey,
        tag: target.tagName.toLowerCase(),
        role: (target.getAttribute("role") || "").toLowerCase(),
        source: linked ? "aria_controls_associated_visible_option" : "temporal_near_input_interactive_row",
        bounds: rectData(target),
        description: `${elementSignature(target)} text=${label}`.slice(0, 360)
      });
    }
    return dedupeMenuRows(rows).slice(0, MENU_MAX_OPTIONS);
  }
  function menuContainerFor(rows, input) {
    if (!rows.length) return null;
    const candidates = [];
    for (const row of rows) {
      let current = row.element.parentElement;
      for (let depth = 0; current && current !== document.body && depth < 6; depth += 1, current = current.parentElement) {
        if (isBroadPageContainer(current) || !visible(current) || !candidateInMenuBand(current, input)) continue;
        const count = rows.filter((item) => current.contains(item.element)).length;
        if (count >= 2) candidates.push({ element: current, count, depth, bounds: rectData(current) });
      }
    }
    candidates.sort((left, right) => right.count - left.count || left.depth - right.depth);
    return candidates[0]?.element || rows[0].element.parentElement || null;
  }
  function queryKey(value) {
    return menuLabelKey(value);
  }
  function queryRelatedToOption(labelKey, expectedQueryKey) {
    if (!expectedQueryKey || Array.from(expectedQueryKey).length < MENU_QUERY_MIN_CHARS) return true;
    return String(labelKey || "").includes(expectedQueryKey);
  }
  function menuPublicRow(item, expectedQueryKey) {
    return {
      label: item.label,
      tag: item.tag,
      role: item.role,
      source: item.source,
      description: item.description,
      bounds: item.bounds,
      query_related: queryRelatedToOption(item.label_key, expectedQueryKey)
    };
  }
  function modelVisibleMenu(input, capture, expectedQuery = "") {
    if (!(input instanceof Element) || !input.isConnected || !visible(input)) return { blocked_reason: "UI_MENU_INPUT_UNAVAILABLE", options: [], _targets: [] };
    const observedTargets = rawMenuOptionCandidates(input, capture);
    const expectedQueryKey = queryKey(expectedQuery);
    const targets = observedTargets.filter((item) => queryRelatedToOption(item.label_key, expectedQueryKey));
    const inputState = targets.length ? "" : fieldStateMessage(input);
    const container = menuContainerFor(observedTargets, input);
    const optionRows = observedTargets.map((item) => menuPublicRow(item, expectedQueryKey));
    const contract = {
      anchor: elementSignature(input),
      container: elementSignature(container),
      expected_query: expectedQueryKey,
      options: optionRows.map((item) => [menuLabelKey(item.label), item.tag, item.role, item.query_related])
    };
    const contractFingerprint = Core.fingerprint(JSON.stringify(contract));
    const blockedReason = targets.length ? null : (inputState ? "UI_MENU_INPUT_REJECTED" : (observedTargets.length ? "UI_MENU_QUERY_UNMATCHED" : "UI_MENU_NOT_OBSERVED"));
    return {
      menu_id: targets.length ? `af-menu-${contractFingerprint}` : "",
      contract_fingerprint: contractFingerprint,
      anchor_description: `${elementSignature(input)} placeholder=${input.getAttribute("placeholder") || ""}`.slice(0, 360),
      container_description: container ? elementSignature(container) : "",
      captured_at: new Date().toISOString(),
      expected_query: Core.normalizeText(expectedQuery).slice(0, 180),
      blocked_reason: blockedReason,
      input_state: inputState,
      options: optionRows,
      _targets: targets,
      _observed_targets: observedTargets,
      _input: input
    };
  }
  function inputStateIsSettled(capture) {
    const now = Date.now();
    const startedAt = Number(capture?.started_at) || now;
    const lastMutationAt = Number(capture?.last_mutation_at) || startedAt;
    return now - startedAt >= MENU_INPUT_ERROR_GRACE_MS && now - lastMutationAt >= MENU_INPUT_ERROR_QUIET_MS;
  }
  async function waitForVisibleMenu(context, timeoutMs = 3400) {
    const input = context?.element;
    const capture = context?.menu_capture || startVisibleMenuCapture(input);
    const expectedQuery = String(context?.expected_query || "");
    const deadline = Date.now() + Math.max(0, Math.min(Number(timeoutMs) || 0, MENU_CAPTURE_MAX_MS));
    let model = modelVisibleMenu(input, capture, expectedQuery);
    // A clear/focus may briefly show unrelated defaults and a transient field
    // message. The current query gets one bounded response window. A field
    // rejection becomes terminal only after that window is quiet; a matching
    // visible row always wins immediately.
    while (!model._targets.length && Date.now() < deadline) {
      if (model.input_state && inputStateIsSettled(capture)) break;
      await uiDelay(MENU_CAPTURE_POLL_MS);
      model = modelVisibleMenu(input, capture, expectedQuery);
    }
    context.menu_capture = capture;
    context.menu_model = model;
    return model;
  }
  function publicMenuModel(model) {
    if (!model || typeof model !== "object") return null;
    return {
      menu_id: model.menu_id || "",
      contract_fingerprint: model.contract_fingerprint || "",
      anchor_description: model.anchor_description || "",
      container_description: model.container_description || "",
      captured_at: model.captured_at || "",
      expected_query: model.expected_query || "",
      blocked_reason: model.blocked_reason || null,
      input_state: model.input_state || "",
      options: Array.isArray(model.options) ? model.options.map((item) => ({ label: item.label || "", tag: item.tag || "", role: item.role || "", source: item.source || "", description: item.description || "", bounds: item.bounds || null, query_related: item.query_related === true })) : []
    };
  }
  function adaptiveOptionCandidates(text, rememberedContext) {
    const wanted = menuLabelKey(text);
    const model = rememberedContext?.menu_model || modelVisibleMenu(rememberedContext?.element, rememberedContext?.menu_capture, rememberedContext?.expected_query || "");
    if (!wanted) return { ok: false, blocked_reason: "UI_OPTION_TEXT_EMPTY", candidates: [], menu: model };
    const candidates = Array.isArray(model?._targets) ? model._targets : [];
    const exact = candidates.filter((item) => item.label_key === wanted);
    const evidence = candidates.slice(0, MENU_MAX_OPTIONS).map((item) => ({ description: item.description, scope: "temporal_visible_menu", kind: item.selection_kind, label: item.label }));
    if (!exact.length) return { ok: false, blocked_reason: model?.blocked_reason || "UI_MENU_OPTION_NOT_VISIBLE", candidates: evidence, menu: model };
    if (exact.length !== 1) return { ok: false, blocked_reason: "UI_MENU_OPTION_AMBIGUOUS", candidates: evidence, menu: model };
    return { ok: true, target: exact[0], candidates: evidence, menu: model };
  }
  function dialogScopedOptionCandidates(text, rememberedContext) {
    const context = { ...(rememberedContext || {}) };
    if (!(context.element instanceof Element)) {
      const dialogs = Array.from(document.querySelectorAll("[role='dialog']")).filter(visible);
      if (dialogs.length === 1) {
        const candidates = Array.from(dialogs[0].querySelectorAll("input,textarea,[contenteditable='true']")).filter((node) => editableControl(node) && visible(node));
        context.element = candidates.length === 1 ? candidates[0] : null;
      }
    }
    const model = context.menu_model || modelVisibleMenu(context.element, context.menu_capture, context.expected_query || "");
    return adaptiveOptionCandidates(text, { ...context, menu_model: model });
  }
  function resolveVisibleActionTarget(step) {
    const target = step?.target || {};
    const wanted = normalizedMatch(target.value || "");
    if (!wanted) return { ok: false, blocked_reason: "UI_TARGET_EMPTY", candidates: [] };
    const candidates = [];
    for (const node of actionElements(step.type)) {
      const info = actionCandidate(node);
      let score = 0;
      if (target.by === "marker" && info.marker === target.value) score = 100;
      if (target.by === "placeholder" && normalizedMatch(info.placeholder) === wanted) score = 100;
      if (target.by === "text") {
        const values = [info.text, info.aria, info.title].map(normalizedMatch).filter(Boolean);
        if (values.some((value) => value === wanted)) score = 90;
        else if (values.some((value) => value.includes(wanted))) score = 25;
      }
      if (score) candidates.push({ ...info, score });
    }
    const max = candidates.reduce((value, item) => Math.max(value, item.score), 0);
    const winners = candidates.filter((item) => item.score === max);
    const evidence = candidates.slice(0, 8).map((item) => ({ description: item.description, score: item.score }));
    if (!winners.length) return { ok: false, blocked_reason: "UI_TARGET_NOT_FOUND", candidates: evidence };
    if (winners.length !== 1) return { ok: false, blocked_reason: "UI_TARGET_AMBIGUOUS", candidates: evidence };
    if (targetForbidden(winners[0].element)) return { ok: false, blocked_reason: "UI_TARGET_FORBIDDEN", candidates: evidence };
    if (disabledControl(winners[0].element)) return { ok: false, blocked_reason: "UI_TARGET_DISABLED", candidates: evidence };
    return { ok: true, target: winners[0], candidates: evidence };
  }
  function editableControl(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element?.getAttribute?.("contenteditable") === "true";
  }
  function readEditableValue(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return String(element.value || "");
    return String(element?.textContent || "");
  }
  function makeDebuggerTypeToken() {
    const bytes = new Uint8Array(12);
    try { crypto.getRandomValues(bytes); }
    catch (_) { for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256); }
    return `afdt-${Date.now().toString(36)}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  function typedValueMatchesVisibleControl(element, actualValue, expectedValue) {
    const actual = String(actualValue || "");
    const expected = String(expectedValue || "");
    if (actual === expected) return true;
    // Avito formats the visible price fields (for example, "10 000").
    // Accept only a digit-for-digit match for these two explicit public controls;
    // all other editable controls retain exact string confirmation.
    const marker = String(element?.getAttribute?.("data-marker") || "");
    if (marker === "price-from/input" || marker === "price-to/input") {
      const actualDigits = actual.replace(/\D/gu, "");
      const expectedDigits = expected.replace(/\D/gu, "");
      return Boolean(expectedDigits) && actualDigits === expectedDigits;
    }
    return false;
  }
  function debuggerTargetState(token, expectedValue) {
    const record = debuggerTypeTokens.get(String(token || ""));
    if (!record) return { ok: false, reason: "DEBUGGER_TARGET_TOKEN_UNKNOWN" };
    const element = record.element;
    const intact = Boolean(element?.isConnected && visible(element) && !disabledControl(element) && pointerReachable(element));
    const focused = Boolean(intact && document.activeElement === element);
    const actualValue = intact ? readEditableValue(element) : "";
    return {
      ok: true,
      token: record.token,
      intact,
      focused,
      expected_value_matches: typeof expectedValue === "string" ? typedValueMatchesVisibleControl(element, actualValue, expectedValue) : null,
      value_length: actualValue.length,
      target_description: record.description
    };
  }
  async function waitForTypedValueConfirmation(token, expectedValue, timeoutMs = 1200) {
    const deadline = Date.now() + Math.max(0, Math.min(Number(timeoutMs) || 0, 1200));
    let state = debuggerTargetState(token, expectedValue);
    while (state.ok && state.intact && state.focused && !state.expected_value_matches && Date.now() < deadline) {
      await uiDelay(80);
      state = debuggerTargetState(token, expectedValue);
    }
    return state;
  }
  function requestDebuggerType(request) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const error = chrome.runtime.lastError;
        if (error) resolve({ ok: false, error: `DEBUGGER_RUNTIME_MESSAGE_FAILED:${error.message}` });
        else resolve(result || { ok: false, error: "DEBUGGER_RUNTIME_EMPTY_RESPONSE" });
      };
      const timer = setTimeout(() => finish({ ok: false, error: "DEBUGGER_RUNTIME_TIMEOUT" }), DEBUGGER_TYPE_TIMEOUT_MS);
      try { chrome.runtime.sendMessage({ type: "AF_DEBUGGER_TYPE_VISIBLE_TARGET", request }, finish); }
      catch (error) { finish({ ok: false, error: `DEBUGGER_RUNTIME_THROW:${error?.message || String(error)}` }); }
    });
  }
  function makeDebuggerClickToken() {
    const bytes = new Uint8Array(12);
    try { crypto.getRandomValues(bytes); }
    catch (_) { for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256); }
    return `afdc-${Date.now().toString(36)}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  function debuggerClickTargetState(token) {
    const record = debuggerClickTokens.get(String(token || ""));
    if (!record) return { ok: false, reason: "DEBUGGER_CLICK_TOKEN_UNKNOWN" };
    const element = record.element;
    return {
      ok: true,
      token: record.token,
      intact: Boolean(element?.isConnected && visible(element) && !disabledControl(element)),
      pointer_reachable: Boolean(element?.isConnected && pointerReachable(element)),
      target_description: record.description
    };
  }
  function requestDebuggerClick(request) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const error = chrome.runtime.lastError;
        if (error) resolve({ ok: false, error: `DEBUGGER_RUNTIME_MESSAGE_FAILED:${error.message}` });
        else resolve(result || { ok: false, error: "DEBUGGER_RUNTIME_EMPTY_RESPONSE" });
      };
      const timer = setTimeout(() => finish({ ok: false, error: "DEBUGGER_RUNTIME_TIMEOUT" }), DEBUGGER_TYPE_TIMEOUT_MS);
      try { chrome.runtime.sendMessage({ type: "AF_DEBUGGER_CLICK_VISIBLE_TARGET", request }, finish); }
      catch (error) { finish({ ok: false, error: `DEBUGGER_RUNTIME_THROW:${error?.message || String(error)}` }); }
    });
  }
  async function clickVisibleTargetWithDebugger(element, intent = "CLICK", optionText = "") {
    if (!(element instanceof Element) || !visible(element) || disabledControl(element) || !pointerReachable(element)) return { ok: false, reason: "not_visible_or_actionable" };
    const bounds = element.getBoundingClientRect();
    if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.top) || bounds.width <= 0 || bounds.height <= 0) return { ok: false, reason: "invalid_bounds" };
    const token = makeDebuggerClickToken();
    const targetText = textOf(element, 180);
    const record = {
      token,
      element,
      description: `${element.tagName.toLowerCase()}${element.getAttribute("data-marker") ? ` data-marker=${element.getAttribute("data-marker")}` : ""} text=${targetText}`.slice(0, 360)
    };
    debuggerClickTokens.set(token, record);
    const expiry = setTimeout(() => debuggerClickTokens.delete(token), DEBUGGER_TYPE_TIMEOUT_MS + 1000);
    try {
      const result = await requestDebuggerClick({
        token,
        intent: String(intent || "CLICK").toUpperCase(),
        option_text: String(optionText || "").slice(0, 220),
        target_text: targetText.slice(0, 220),
        page_url: location.href,
        target: { tag: element.tagName.toLowerCase(), marker: element.getAttribute("data-marker") || "", role: element.getAttribute("role") || "" },
        bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
      });
      if (!result?.ok || !result?.data?.ok) return { ok: false, reason: "debugger_failed", detail: result?.error || result?.data?.error || "CDP_VISIBLE_CLICK_FAILED" };
      return {
        ok: true,
        strategy: String(result.data.strategy || "chrome_debugger_input_mouse_click_visible_target"),
        cdp_methods: Array.isArray(result.data.cdp_methods) ? result.data.cdp_methods.slice(0, 2) : []
      };
    } finally {
      clearTimeout(expiry);
      debuggerClickTokens.delete(token);
    }
  }
  async function clickVisibleOptionWithDebugger(element, optionText) {
    return clickVisibleTargetWithDebugger(element, "SELECT_OPTION", optionText);
  }
  async function setVisibleControlValue(element, value) {
    const nextValue = String(value || "");
    if (!editableControl(element)) return { ok: false, reason: "not_editable" };
    if (!visible(element) || disabledControl(element) || !pointerReachable(element)) return { ok: false, reason: "not_visible_or_actionable" };
    const bounds = element.getBoundingClientRect();
    if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.top) || bounds.width <= 0 || bounds.height <= 0) return { ok: false, reason: "invalid_bounds" };

    // Synthetic DOM events were live-proven insufficient for Avito's reactive city
    // control. This handoff does not run arbitrary JavaScript in the page. The service
    // worker is allowed to attach only to the active Avito tab and only to the two
    // CDP Input methods listed in its hardcoded whitelist. It first performs an actual
    // visible mouse focus, then the content script confirms that this exact resolved
    // control owns focus before any text command is sent.
    const token = makeDebuggerTypeToken();
    const record = {
      token,
      element,
      description: `${element.tagName.toLowerCase()}${element.getAttribute("data-marker") ? ` data-marker=${element.getAttribute("data-marker")}` : ""}${element.getAttribute("placeholder") ? ` placeholder=${element.getAttribute("placeholder")}` : ""}`.slice(0, 360)
    };
    debuggerTypeTokens.set(token, record);
    const expiry = setTimeout(() => debuggerTypeTokens.delete(token), DEBUGGER_TYPE_TIMEOUT_MS + 1000);
    try {
      const result = await requestDebuggerType({
        token,
        value: nextValue,
        page_url: location.href,
        target: {
          tag: element.tagName.toLowerCase(),
          marker: element.getAttribute("data-marker") || "",
          placeholder: element.getAttribute("placeholder") || "",
          type: element.getAttribute("type") || "",
          contenteditable: element.getAttribute("contenteditable") === "true"
        },
        bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
        previous_value_length: readEditableValue(element).length
      });
      if (!result?.ok || !result?.data?.ok) return { ok: false, reason: "debugger_failed", detail: result?.error || result?.data?.error || "CDP_INPUT_FAILED" };
      const state = await waitForTypedValueConfirmation(token, nextValue);
      if (!state.ok || !state.intact || !state.focused) return { ok: false, reason: "debugger_focus_lost", detail: state.reason || "CDP_INPUT_FOCUS_CONFIRMATION_FAILED" };
      if (!state.expected_value_matches) return { ok: false, reason: "debugger_value_mismatch", detail: "CDP_INPUT_VALUE_CONFIRMATION_FAILED" };
      return {
        ok: true,
        focused: true,
        strategy: String(result.data.strategy || "chrome_debugger_input_only"),
        cdp_methods: Array.isArray(result.data.cdp_methods) ? result.data.cdp_methods.slice(0, 3) : []
      };
    } finally {
      clearTimeout(expiry);
      debuggerTypeTokens.delete(token);
    }
  }
  function normalizedClickDispatchTarget(target) {
    return String(target?.description || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
  }
  function recordUiClickDispatch(plan, step, index, target) {
    const dispatch = {
      plan_fingerprint: String(plan?.plan_fingerprint || "").slice(0, 160),
      step_index: Number(index),
      step_type: "CLICK",
      target_description: normalizedClickDispatchTarget(target),
      // This is derived only from the resolved, visible anchor and is used solely
      // to validate a same-window child tab created by that click.
      expected_navigation_path: navigationHrefForVisibleClick(target?.element),
      page_url: location.href
    };
    return new Promise((resolve) => {
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: "UI_CLICK_DISPATCH_ACK_TIMEOUT" }), UI_CLICK_DISPATCH_TIMEOUT_MS);
      try {
        chrome.runtime.sendMessage({ type: "AF_UI_CLICK_DISPATCHED", dispatch }, (response) => {
          const runtimeError = chrome.runtime?.lastError?.message || "";
          if (runtimeError) { finish({ ok: false, reason: "UI_CLICK_DISPATCH_RECORD_UNAVAILABLE" }); return; }
          if (!response?.ok || !response?.data?.dispatch_id) { finish({ ok: false, reason: "UI_CLICK_DISPATCH_RECORD_UNAVAILABLE" }); return; }
          finish({ ok: true, dispatch_id: String(response.data.dispatch_id) });
        });
      } catch (_) {
        finish({ ok: false, reason: "UI_CLICK_DISPATCH_RECORD_UNAVAILABLE" });
      }
    });
  }
  function visibleTitleAnchors(root) {
    return Array.from(root.querySelectorAll("a[data-marker='item-title']")).filter((node) => visible(node) && Boolean(safeHref(node)));
  }
  function cardForListingTitle(titleAnchor) {
    let node = titleAnchor instanceof Element ? titleAnchor.parentElement : null;
    let fallback = null;
    while (node && node !== document.body && node !== document.documentElement) {
      if (visible(node)) {
        const titles = visibleTitleAnchors(node);
        if (titles.length === 1 && titles[0] === titleAnchor) {
          const body = textOf(node, 1400);
          const hasPrice = /(?:\d[\d\s]{1,12})\s*₽/u.test(body);
          const hasCardSignal = Boolean(node.querySelector("a[data-marker='item-photo-sliderLink'],a[data-marker='messenger-button/link'],button[data-marker*='item-phone'],[data-marker*='seller']"));
          if (!fallback && (hasPrice || hasCardSignal)) fallback = node;
          if (hasPrice && hasCardSignal) return node;
        }
      }
      node = node.parentElement;
    }
    return fallback;
  }
  function normalizedVisiblePrice(text) {
    const raw = Core.normalizeText(text || "");
    const matches = Array.from(raw.matchAll(/(?:^|[^\d])((?:\d{1,3}(?:[\s\u00a0]\d{3})+|\d{1,7})\s*(?:₽|руб(?:\.|лей|ля)?))/giu));
    for (const match of matches) {
      const normalized = String(match[1]).replace(/(?:руб(?:\.|лей|ля)?)/iu, "₽").replace(/\s+/g, " ").trim();
      const amount = Number(normalized.replace(/[^\d]/g, ""));
      // Product price comes from its visible price surface, not a PC-specific floor.
      if (Number.isFinite(amount) && amount >= 0 && amount <= 10000000 && !/^(?:доставк|рассрочк|плат[её]ж|от 1 \u20bd)/iu.test(raw)) return normalized;
    }
    return "";
  }
  function priceInListingCard(card) {
    const marked = Array.from(card.querySelectorAll("[data-marker*='price'],[itemprop='price']")).find((node) => visible(node) && normalizedVisiblePrice(textOf(node, 160)));
    if (marked) return normalizedVisiblePrice(textOf(marked, 160));
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const price = visible(node.parentElement) && !node.parentElement.closest("script,style,input,textarea,[data-marker*=delivery]") ? normalizedVisiblePrice(node.nodeValue || "") : "";
      if (price) return price;
      node = walker.nextNode();
    }
    return "";
  }
  function priceInPublicListingView() {
    // Prefer the product-price surface. Broad price selectors can include
    // shipping/payment text, so they are only consulted after item-view nodes.
    const selectors = ["[data-marker='item-view/item-price']", "[data-marker^='item-view/'][data-marker*='price']", "[itemprop='price']"];
    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        if (!visible(node)) continue;
        const price = normalizedVisiblePrice(textOf(node, 180));
        if (price) return price;
      }
    }
    const titleNode = Array.from(document.querySelectorAll("[data-marker='item-view/title-info'],h1[itemprop='name'],h1")).find(visible) || null;
    let scope = titleNode?.parentElement || document.body;
    for (let i = 0; scope && i < 3; i += 1, scope = scope.parentElement) {
      const price = normalizedVisiblePrice(textOf(scope, 1200));
      if (price) return price;
    }
    return "";
  }
  function sellerInListingCard(card) {
    const candidate = Array.from(card.querySelectorAll("a[href*='/user/'],a[data-marker*='seller']"))
      .find((node) => visible(node) && !/^(?:написать|показать телефон)$/iu.test(textOf(node, 180)));
    return candidate ? textOf(candidate, 180) : "";
  }
  function locationInListingCard(card) {
    const node = Array.from(card.querySelectorAll("[data-marker='item-address'],[data-marker='item-location'],[class*='geo-address']")).find(visible);
    if (node) return publicText(textOf(node, 260), 260);
    const lines = textOf(card, 1400).split(/\n+/u).map((value) => Core.normalizeText(value)).filter(Boolean);
    return lines.find((value) => value.length <= 180 && /^(?:[А-ЯЁ][А-ЯЁа-яё -]+(?:обл\.|область|край|р-н|район)|(?:Республика|г\.)\s+[А-ЯЁ])/u.test(value) && !/[!?]/u.test(value)) || "";
  }
  function sellerRatingInListingCard(card) {
    const text = textOf(card, 1400);
    const match = text.match(/(?:^|[^\d,.])([0-5](?:[,.]\d)?)\s*(?:·|•)?\s*((?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d{1,7}))\s*(отзыв(?:ов|а)?)/iu);
    return match ? `${match[1]} · ${match[2].replace(/[ \u00a0\u202f]/g,'')} ${match[3]}` : "";
  }
  function deliveryInListingCard(card) {
    const lines = textOf(card, 1400).split(/\n+/u).map((value) => Core.normalizeText(value)).filter(Boolean);
    return lines.find((value) => /(?:доставк|получен|дней|дня|завтра|сегодня)/iu.test(value)) || "";
  }
  function sellerBadgesInListingCard(card) {
    const lines = textOf(card, 1400).split(/\n+/u).map((value) => Core.normalizeText(value)).filter(Boolean);
    const out = []; const seen = new Set();
    for (const value of lines) {
      if (!/^(?:над[её]жный продавец|документы проверены|реквизиты проверены|я\s*помогаю|гарантия авито)$/iu.test(value)) continue;
      if (seen.has(value)) continue;
      seen.add(value); out.push(value);
      if (out.length >= 8) break;
    }
    return out;
  }
  function collectPublicListings(limit) {
    const records = []; const seen = new Set();
    const bounded = Number.isFinite(Number(limit));
    const max = bounded ? Math.max(1, Number(limit)) : Number.POSITIVE_INFINITY;
    const titleAnchors = visibleTitleAnchors(document);
    for (const titleAnchor of titleAnchors) {
      const href = safeHref(titleAnchor);
      const identity = canonicalListingHref(href);
      if (!href || seen.has(identity)) continue;
      const card = cardForListingTitle(titleAnchor);
      if (!card || !visible(card)) continue;
      const title = textOf(titleAnchor, 240);
      if (!title) continue;
      records.push({
        position: records.length + 1,
        listing_id: Core.extractListingId?.(canonicalListingHref(href)) || (canonicalListingHref(href).match(/_(\d+)$/)?.[1] || card.getAttribute("data-item-id") || null),
        public_url: canonicalListingHref(href),
        title,
        price: priceInListingCard(card),
        location: locationInListingCard(card),
        seller: sellerInListingCard(card),
        seller_rating: sellerRatingInListingCard(card),
        seller_badges: sellerBadgesInListingCard(card),
        delivery: deliveryInListingCard(card),
        card_text: publicText(textOf(card, 1400), 1400),
        truncated_fields: textOf(card,1401).length>1400 ? ["card_text"] : [],
        captured_at:new Date().toISOString(),
        href,
        card_bound: true
      });
      seen.add(identity);
      if (records.length >= max) break;
    }
    return records;
  }


  function canonicalListingHref(href) {
    const parsed = safeUrl(href, location.href);
    if (!parsed || !Core.isAvitoUrl(parsed.href)) return "";
    return `${parsed.origin}${parsed.pathname}`;
  }
  function loadedListingRecords(limit) {
    const records = []; const seen = new Set();
    const bounded = Number.isFinite(Number(limit));
    const max = bounded ? Math.max(1, Number(limit)) : Number.POSITIVE_INFINITY;
    for (const item of collectPublicListings(max)) {
      const key = canonicalListingHref(item.href);
      if (!key || seen.has(key)) continue;
      seen.add(key); records.push({ ...item, href: key });
      if (records.length >= max) break;
    }
    return records;
  }
  function nextResultsPage() {
    const current = safeUrl(location.href, location.href); if (!current) return null;
    const links = Array.from(document.querySelectorAll("a[href]")).filter(visible);
    for (const node of links) {
      const label = Core.normalizeText(`${textOf(node, 140)} ${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`);
      if (!/(?:следующ|далее|впер[её]д|next)/iu.test(label)) continue;
      const href = safeHref(node); const target = safeUrl(href, location.href);
      if (!target || target.origin !== current.origin || target.pathname !== current.pathname || target.href === current.href) continue;
      return { href: target.href, text: label.slice(0, 160), source: "visible_next_results_anchor" };
    }
    return null;
  }
  function waitForResultDomChange(previousCount, timeoutMs = 900) {
    return new Promise((resolve) => {
      let finished = false;
      const done = () => { if (finished) return; finished = true; observer.disconnect(); clearTimeout(timer); resolve(); };
      const observer = new MutationObserver(() => {
        const count = visibleTitleAnchors(document).length;
        if (count !== previousCount || document.documentElement.scrollHeight > previousCount) done();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const timer = setTimeout(done, Math.max(60, Math.min(Number(timeoutMs) || 900, 1100)));
    });
  }
  async function scanVisibleResultsPage(request = {}) {
    const scanAll = request?.all === true || String(request?.limit || "").toLowerCase() === "all";
    const requested = Number(request?.limit);
    const limit = scanAll ? Number.POSITIVE_INFINITY : Math.max(1, Math.min(Number.isFinite(requested) ? requested : 120, 160));
    const seen = new Map(); let stableBottomRounds = 0; let rounds = 0; let reachedEnd = false;
    const generation = lifetime.generation, deadline = Date.now() + Math.max(1000, Math.min(Number(request.timeout_ms) || 30000, 60000));
    // No result-count barrier. In full-inventory mode this loop ends only when
    // the public result stream reaches its actual visible end; it never opens a
    // listing or follows a hidden endpoint.
    while (seen.size < limit && rounds < 120 && Date.now() < deadline) {
      assertAlive(generation);
      const block = detectBlock();
      if (block) return { ok: false, blocked_reason: block, listings: Array.from(seen.values()), source: "visible_rendered_result_cards" };
      for (const record of loadedListingRecords(limit)) if (!seen.has(record.href)) seen.set(record.href, record);
      const beforeY = window.scrollY; const viewport = Math.max(260, window.innerHeight || 700);
      const maxY = Math.max(0, document.documentElement.scrollHeight - viewport);
      if (beforeY >= maxY - 4) {
        stableBottomRounds += 1;
        if (stableBottomRounds >= 2) { reachedEnd = true; break; }
      } else stableBottomRounds = 0;
      const beforeVisibleCount = visibleTitleAnchors(document).length;
      window.scrollBy({ top: Math.max(220, Math.floor(viewport * 0.88)), left: 0, behavior: "instant" });
      await uiDelay(16);
      await waitForResultDomChange(beforeVisibleCount, 700);
      rounds += 1;
      if (window.scrollY === beforeY && beforeY >= maxY - 4) stableBottomRounds += 1;
    }
    for (const record of loadedListingRecords(limit)) if (!seen.has(record.href)) seen.set(record.href, record);
    const next = nextResultsPage();
    return {
      ok: true,
      url: location.href,
      listings: Array.from(seen.values()).slice(0, Number.isFinite(limit) ? limit : undefined),
      next_page: next,
      has_next_page: Boolean(next),
      reached_end: reachedEnd,
      stopped_at_limit: Number.isFinite(limit) && seen.size >= limit,
      scroll_rounds: rounds,
      scan_incomplete: !reachedEnd && seen.size < limit,
      source: "visible_rendered_result_cards",
      actions_performed: "visible_scroll_and_public_dom_read_only"
    };
  }
  async function waitForPublicListingSurface(timeoutMs = 4200) {
    const generation = lifetime.generation;
    const initialBlock = detectBlock();
    if (initialBlock) return { ...collectPublicListingDetails(), blocked_reason: initialBlock };
    const deadline = Date.now() + Math.max(300, Math.min(Number(timeoutMs) || 4200, 6000));
    let details = collectPublicListingDetails();
    while (details.blocked_reason && Date.now() < deadline) {
      assertAlive(generation);
      const liveBlock = detectBlock();
      if (liveBlock) return { ...details, blocked_reason: liveBlock };
      await new Promise((resolve) => {
        let ended = false;
        const done = () => { if (ended) return; ended = true; observer.disconnect(); clearTimeout(timer); resolve(); };
        const observer = new MutationObserver(done);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        const timer = setTimeout(done, 180);
      });
      details = collectPublicListingDetails();
    }
    return details;
  }
  async function waitForPublicListings(limit, timeoutMs = 6500) {
    const generation = lifetime.generation;
    const max = Math.max(1, Math.min(Number(limit) || 20, 120));
    const deadline = Date.now() + Math.max(100, Math.min(Number(timeoutMs) || 6500, 8000));
    let records = [], previous = "", changedAt = Date.now();
    do {
      assertAlive(generation);
      const block = detectBlock();
      if (block) return { listings: records, blocked_reason: block };
      records = collectPublicListings(max);
      const signature = records.map(x => x.href).join("|");
      if (signature !== previous) { previous = signature; changedAt = Date.now(); }
      if (records.length >= max || (records.length && Date.now() - changedAt >= 600)) return { listings: records, blocked_reason: null };
      const empty = firstVisible(["[data-marker='search-results/empty']", "[data-marker='search-results/no-results']", "[data-marker='no-results']"]);
      if (!records.length && empty && /ничего не найдено|объявлений не найдено|нет объявлений/iu.test(textOf(empty.element, 500))) return { listings: [], blocked_reason: null, empty_results_confirmed: true };
      await uiDelay(100);
    } while (Date.now() < deadline);
    return { listings: records, blocked_reason: records.length ? null : "LISTINGS_PUBLIC_SURFACE_UNAVAILABLE" };
  }
  function publicText(value, limit = 1800) {
    return Core.normalizeText(String(value || "")).replace(/(?:\+?7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/gu, "[контакт скрыт]").slice(0, limit);
  }
  function firstVisibleText(selectors, limit = 400) {
    for (const selector of selectors) {
      const node = Array.from(document.querySelectorAll(selector)).find(visible);
      if (node) { const value = publicText(textOf(node, limit), limit); if (value) return value; }
    }
    return "";
  }
  function visibleLeafTexts(root, limit = 80) {
    if (!(root instanceof Element)) return [];
    const out = []; const seen = new Set();
    for (const node of Array.from(root.querySelectorAll("*"))) {
      if (!visible(node)) continue;
      const direct = Array.from(node.childNodes).filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => Core.normalizeText(child.nodeValue || "")).filter(Boolean).join(" ");
      const value = publicText(direct || (node.children.length === 0 ? textOf(node, 220) : ""), 220);
      if (!value || seen.has(value)) continue;
      seen.add(value); out.push(value); if (out.length >= limit) break;
    }
    return out;
  }
  function findVisibleHeading(label) {
    const wanted = Core.normalizeText(label).toLowerCase();
    return Array.from(document.querySelectorAll("h1,h2,h3,h4,div,p,span,strong")).find((node) => visible(node) && Core.normalizeText(textOf(node, 120)).toLowerCase() === wanted) || null;
  }
  function boundedSectionRoot(heading) {
    let node = heading instanceof Element ? heading.parentElement : null; let fallback = null;
    for (let depth = 0; node && node !== document.body && depth < 6; depth += 1, node = node.parentElement) {
      if (!visible(node)) continue;
      const value = publicText(textOf(node, 2200), 2200); if (!fallback && value) fallback = node;
      if (value.length >= 20 && value.length <= 1800) return node;
    }
    return fallback;
  }
  function sectionPairs(headingText, knownLabels) {
    const root = boundedSectionRoot(findVisibleHeading(headingText)); if (!root) return [];
    const leaves = visibleLeafTexts(root, 120);
    const labels = (knownLabels || []).map((value) => Core.normalizeText(value)).filter(Boolean);
    const normalized = new Set(labels.map((value) => value.toLowerCase())); const pairs = [];
    const add = (label, value) => {
      const cleanLabel = Core.normalizeText(label || ""); const cleanValue = Core.normalizeText(value || "");
      if (!cleanLabel || !cleanValue || normalized.has(cleanValue.toLowerCase()) || pairs.some((item) => item.label === cleanLabel)) return;
      pairs.push({ label: cleanLabel, value: cleanValue });
    };
    // Some Avito layouts render label and value as one visible text leaf.
    // Capture that public representation before the adjacent-leaf fallback.
    for (const leaf of leaves) {
      const normalizedLeaf = Core.normalizeText(leaf);
      for (const label of labels.slice().sort((a, b) => b.length - a.length)) {
        const re = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:[:—–-]\\s*)?(.+)$`, "iu");
        const match = normalizedLeaf.match(re);
        if (match?.[1]) add(label, match[1]);
      }
    }
    for (let index = 0; index < leaves.length - 1; index += 1) {
      const label = Core.normalizeText(leaves[index]); const next = Core.normalizeText(leaves[index + 1]);
      if (!normalized.has(label.toLowerCase()) || !next || normalized.has(next.toLowerCase())) continue;
      add(label, next);
    }
    return pairs.slice(0, 24);
  }
  function sellerBadges() {
    const root = Array.from(document.querySelectorAll("[data-marker='item-view/seller-info'],[data-marker='sellerInfo'],[data-marker*='seller-info']")).find(visible); if (!root) return [];
    return visibleLeafTexts(root, 36).filter((value) => !/^(?:написать|показать телефон|купить)$/iu.test(value)).filter((value) => /(?:над[её]жн|документ|провер|помога|отзыв|частн|магазин|компан|авито)/iu.test(value)).slice(0, 12);
  }
  function deliveryLabels() {
    const out = []; const seen = new Set();
    for (const node of Array.from(document.querySelectorAll("[data-marker*='delivery'],[data-marker*='safedeal']"))) { if (!visible(node)) continue; const value = publicText(textOf(node, 240), 240); if (!value || /^(?:купить|доставка)$/iu.test(value) || seen.has(value)) continue; seen.add(value); out.push(value); if (out.length >= 10) break; }
    return out;
  }
  function genericPublicListingSections() {
    const blockedHeading = /^(?:местоположение|доставка|продавец|продавце|отзывы|похожие|рекомендации|безопасность|оплата|контакты)$/iu;
    const seenHeading = new Set(); const sections = [];
    const headings = Array.from(document.querySelectorAll("h2,h3,h4,[role='heading'][aria-level]")).filter(visible);
    for (const node of headings) {
      const heading = publicText(textOf(node, 160), 160);
      const key = Core.normalizeText(heading).toLowerCase();
      if (!heading || heading.length > 140 || blockedHeading.test(heading) || seenHeading.has(key)) continue;
      const sectionRoot = boundedSectionRoot(node);
      const leaves = visibleLeafTexts(sectionRoot, 56).filter((value) => Core.normalizeText(value).toLowerCase() !== key);
      const text = publicText(leaves.slice(0, 28).join(" · "), 1800);
      if (!text) continue;
      seenHeading.add(key);
      sections.push({ heading, text });
      if (sections.length >= 12) break;
    }
    return sections;
  }
  function collectPublicListingDetails() {
    const block = detectBlock();
    if (block) return { source: "visible_public_listing_dom", sections: [], blocked_reason: block };
    const titleNode = Array.from(document.querySelectorAll("[data-marker='item-view/title-info'],h1[itemprop='name'],h1")).find(visible) || null;
    const title = titleNode ? publicText(textOf(titleNode, 360), 360) : "";
    const price = priceInPublicListingView() || firstVisibleText(["[data-marker='item-view/item-price']", "[itemprop='price']"], 120);
    const descriptionRaw = firstVisibleText(["[data-marker='item-view/item-description']"], 20001);
    const description = descriptionRaw.slice(0,20000);
    const truncatedFields = descriptionRaw.length>20000 ? ["description"] : [];
    const seller = firstVisibleText(["[data-marker='seller-info/name']", "[data-marker='seller-link/link']", "[data-marker='item-view/seller-info'] [title]"], 240);
    const sellerRating = firstVisibleText(["[data-marker='rating-caption/rating']", "[data-marker='sellerRate']"], 240);
    const visibleSections = genericPublicListingSections();
    const locationRoot = boundedSectionRoot(findVisibleHeading("Местоположение")); const locationText = visibleLeafTexts(locationRoot, 16).filter((value) => !/^местоположение$/iu.test(value))[0] || "";
    const imageCount = Array.from(document.querySelectorAll("[data-marker='image-preview/item'],[data-marker='image-frame/image']")).filter(visible).length || null;
    const hasItemViewTitle = Boolean(titleNode?.matches?.("[data-marker='item-view/title-info']"));
    const hasItemViewSurface = Array.from(document.querySelectorAll("[data-marker^='item-view/']")).some(visible);
    const hasListingSurface = Boolean(title && (hasItemViewTitle || (hasItemViewSurface && (price || description || seller || visibleSections.length)) || (price && description)));
    const statusTexts = Array.from(document.querySelectorAll("[data-marker*='status'],[data-marker*='closed'],h1"))
      .filter(visible).filter(node=>!node.closest("[data-marker='item-view/item-description'],[data-marker='item']"))
      .map(node=>textOf(node,400));
    const statusText=statusTexts.join('\n');
    const availability=/забронирован/iu.test(statusText)?'RESERVED':/объявление\s+(?:продано|продан)|товар продан/iu.test(statusText)?'SOLD':/снято с публикации|объявление удалено/iu.test(statusText)?'REMOVED':/объявление в архиве|архивировано/iu.test(statusText)?'ARCHIVED':'UNKNOWN';
    if (!hasListingSurface && availability!=='UNKNOWN') return {href:location.href,title,price:'',availability,direct_delivery:{confirmed:false,source:'visible_unavailable_status',reason:availability},sections:[],description:'',source:'visible_public_listing_dom',captured_at:new Date().toISOString(),blocked_reason:null};
    if (!hasListingSurface) {
      return {
        title: "", price: "", location: "", seller: "", seller_rating: "", seller_badges: [], delivery: [], image_count: null,
        sections: [], description: "", source: "visible_public_listing_dom", blocked_reason: "LISTING_PUBLIC_SURFACE_UNAVAILABLE"
      };
    }
    const directCandidates = Array.from(document.querySelectorAll("button,a,[role='button']")).filter(visible).map((element) => {
      const text = publicText(textOf(element, 240), 240);
      const exact = Core.normalizeText(text).toLowerCase() === "купить с доставкой";
      const disabled = disabledControl(element);
      const tag = String(element.tagName || "").toLowerCase();
      const role = element.getAttribute("role") || (tag === "button" ? "button" : (tag === "a" && Boolean(element.getAttribute("href")) && Boolean(safeHref(element)) ? "link" : ""));
      return { element, text, exact, disabled, tag, role };
    }).filter((item) => item.exact);
    const direct = directCandidates.find((item) => !item.disabled) || directCandidates[0] || null;
    const directEnabled = Boolean(direct && !direct.disabled && (direct.tag === "button" || direct.role === "link" || direct.role === "button"));
    const directDelivery = {
      confirmed: directEnabled,
      text: direct?.text || "", exact_text: direct?.text || "",
      element_tag: direct?.tag || null, role: direct?.role || null,
      enabled: directEnabled, visible: Boolean(direct),
      href: direct?.element.getAttribute("href") ? safeHref(direct.element) : "",
      marker: direct?.element.getAttribute("data-marker") || null,
      testid: direct?.element.getAttribute("data-testid") || null,
      aria_label: direct?.element.getAttribute("aria-label") || null,
      source: direct ? "visible_exact_interactive_purchase_control_not_clicked" : "no_visible_exact_interactive_purchase_control",
      reason: directEnabled ? "VISIBLE_ENABLED_EXACT_BUY_WITH_DELIVERY_CONTROL" : (direct ? "EXACT_CONTROL_DISABLED" : "EXACT_INTERACTIVE_CONTROL_NOT_FOUND")
    };
    return { title, price, location: locationText, seller, seller_rating: sellerRating, seller_badges: sellerBadges(), delivery: deliveryLabels(), direct_delivery: directDelivery, availability, captured_at:new Date().toISOString(), truncated_fields:truncatedFields, section_text_limit:1800, image_count: imageCount, sections: visibleSections, description, source: "visible_public_listing_dom", blocked_reason: null };
  }
  async function executeUiActionPlan(plan) {
    const generation = lifetime.generation;
    assertAlive(generation);
    const result = { ok: true, url: location.href, plan_fingerprint: String(plan?.plan_fingerprint || ""), timing_profile: timingProfileForPlan(plan), steps: [], listings: [], listing_details: null, navigation_handoff: null, login_popup_events: [], blocked_reason: null };
    if (!Core.isPublicAvitoUrl(location.href)) return { ...result, ok: false, blocked_reason: "UI_TARGET_NOT_PUBLIC_AVITO" };
    if (!Array.isArray(plan?.steps) || !plan.steps.length || plan.steps.length>UI_PLAN_MAX_STEPS) return {...result,ok:false,blocked_reason:"UI_PLAN_INVALID_STEP_COUNT"};
    const steps = plan.steps;
    const stepIndexOffset = Math.max(0, Math.floor(Number(plan?.step_index_offset || 0)));
    let latestTypeContext = null;
    if (!steps.length) return { ...result, ok: false, blocked_reason: "UI_PLAN_STEP_REQUIRED" };
    for (let offset = 0; offset < steps.length; offset += 1) {
      assertAlive(generation);
      const step = steps[offset] || {}; const index = offset + 1 + stepIndexOffset;
      if (detectBlock()) { result.ok = false; result.blocked_reason = detectBlock(); result.steps.push({ index, type: step.type || "?", status: "blocked", blocked_reason: result.blocked_reason }); break; }
      if (step.type === "WAIT") {
        await uiDelay(Math.min(Number(step.duration_ms || 0), 5000)); result.steps.push({ index, type: "WAIT", status: "completed", duration_ms: Math.min(Number(step.duration_ms || 0), 5000) }); continue;
      }
      if (step.type === "WAIT_FOR") {
        const deadline = Date.now() + Math.min(Number(step.timeout_ms || 5000), 5000); let resolved = resolveVisibleActionTarget({ ...step, type: "CLICK" });
        while (!resolved.ok && Date.now() < deadline) { await uiDelay(100); resolved = resolveVisibleActionTarget({ ...step, type: "CLICK" }); }
        if (!resolved.ok) { result.ok = false; result.blocked_reason = resolved.blocked_reason; result.steps.push({ index, type: "WAIT_FOR", status: "blocked", blocked_reason: resolved.blocked_reason, candidates: resolved.candidates }); break; }
        result.steps.push({ index, type: "WAIT_FOR", status: "completed", target_description: resolved.target.description }); continue;
      }
      if (step.type === "SNAPSHOT") {
        const snapshot = diagnose({ scope: step.scope || "PAGE_MAIN_VISIBLE" }); result.snapshot = snapshot; result.steps.push({ index, type: "SNAPSHOT", status: snapshot.blocked_reason ? "blocked" : "completed", blocked_reason: snapshot.blocked_reason || null, snapshot_fingerprint: snapshot.snapshot_fingerprint || null }); if (snapshot.blocked_reason) { result.ok = false; result.blocked_reason = snapshot.blocked_reason; break; } continue;
      }
      if (step.type === "COLLECT_LISTINGS") {
        const collected = await waitForPublicListings(step.limit || 20, plan.collection_timeout_ms);
        assertAlive(generation); result.listings = collected.listings;
        result.empty_results_confirmed = collected.empty_results_confirmed === true;
        result.steps.push({ index, type: "COLLECT_LISTINGS", status: collected.blocked_reason ? "blocked" : "completed", count: collected.listings.length, blocked_reason: collected.blocked_reason || null });
        if (collected.blocked_reason) { result.ok = false; result.blocked_reason = collected.blocked_reason; break; }
        continue;
      }
      if (step.type === "COLLECT_LISTING_DETAILS") {
        const listingDetails = await waitForPublicListingSurface(plan.collection_timeout_ms); assertAlive(generation); result.listing_details = listingDetails;
        if (listingDetails.blocked_reason) { result.ok = false; result.blocked_reason = listingDetails.blocked_reason; result.steps.push({ index, type: "COLLECT_LISTING_DETAILS", status: "blocked", blocked_reason: listingDetails.blocked_reason }); break; }
        result.steps.push({ index, type: "COLLECT_LISTING_DETAILS", status: "completed", count: 1 }); continue;
      }
      if (step.type === "COLLECT_MENU") {
        const context = latestTypeContext || { element: document.activeElement instanceof Element ? document.activeElement : null, expected_query: "", menu_capture: null };
        const menu = await waitForVisibleMenu(context, 3400);
        result.menu = publicMenuModel(menu);
        if (menu.blocked_reason) { result.ok = false; result.blocked_reason = menu.blocked_reason; result.steps.push({ index, type: "COLLECT_MENU", status: "blocked", blocked_reason: menu.blocked_reason }); break; }
        result.steps.push({ index, type: "COLLECT_MENU", status: "completed", count: menu.options.length, menu_id: menu.menu_id }); continue;
      }
      if (!["CLICK", "TYPE", "SELECT_OPTION"].includes(step.type)) { result.ok = false; result.blocked_reason = "UI_PLAN_ACTION_NOT_ALLOWED"; result.steps.push({ index, type: step.type || "?", status: "blocked", blocked_reason: result.blocked_reason }); break; }
      if (step.type === "SELECT_OPTION" && latestTypeContext) await waitForVisibleMenu(latestTypeContext, 3400);
      const resolved = step.type === "SELECT_OPTION" ? dialogScopedOptionCandidates(step.text, latestTypeContext) : resolveVisibleActionTarget(step);
      if (!resolved.ok) { result.ok = false; result.blocked_reason = resolved.blocked_reason; if (resolved.menu) result.menu = publicMenuModel(resolved.menu); result.steps.push({ index, type: step.type, status: "blocked", blocked_reason: resolved.blocked_reason, candidates: resolved.candidates }); break; }
      await uiDelay(stepPreActionDelay(plan, steps, offset));
      assertAlive(generation);
      resolved.target.element.scrollIntoView({ block: "center", inline: "nearest" });
      let applied = false;
      let typeResult = null;
      let selectResult = null;
      let clickResult = null;
      let clickDispatch = null;
      if (step.type === "CLICK") {
        clickDispatch = await recordUiClickDispatch(plan, step, index, resolved.target);
        if (!clickDispatch.ok) {
          result.ok = false;
          result.blocked_reason = clickDispatch.reason || "UI_CLICK_DISPATCH_RECORD_UNAVAILABLE";
          result.steps.push({ index, type: step.type, status: "blocked", blocked_reason: result.blocked_reason, target_description: resolved.target.description });
          break;
        }
        assertAlive(generation);
        clickResult = await clickVisibleTargetWithDebugger(resolved.target.element, "CLICK");
        applied = Boolean(clickResult?.ok);
      }
      if (step.type === "SELECT_OPTION") {
        selectResult = await clickVisibleOptionWithDebugger(resolved.target.element, String(step.text || ""));
        applied = Boolean(selectResult?.ok);
      }
      if (step.type === "TYPE") {
        const menuCapture = startVisibleMenuCapture(resolved.target.element);
        typeResult = await setVisibleControlValue(resolved.target.element, String(step.text || ""));
        applied = Boolean(typeResult?.ok);
        if (applied) latestTypeContext = { element: resolved.target.element, captured_at: Date.now(), expected_query: String(step.text || ""), menu_capture: menuCapture, menu_model: null };
        else stopVisibleMenuCapture(menuCapture);
      }
      if (!applied) {
        result.ok = false;
        result.blocked_reason = step.type === "TYPE" ? (typeResult?.reason === "focus_failed" ? "UI_TARGET_FOCUS_FAILED" : "UI_DEBUGGER_TYPE_FAILED") : (step.type === "SELECT_OPTION" ? "UI_DEBUGGER_OPTION_CLICK_FAILED" : "UI_DEBUGGER_CLICK_FAILED");
        const failure = step.type === "TYPE" ? typeResult : (step.type === "SELECT_OPTION" ? selectResult : clickResult);
        const failureDetail = String(failure?.detail || failure?.reason || "").replace(/[^A-Z0-9_:.-]/giu, "_").slice(0, 220);
        result.steps.push({ index, type: step.type, status: "blocked", blocked_reason: result.blocked_reason, target_description: resolved.target.description, text: failureDetail ? `diagnostic=${failureDetail}` : "", failure_detail: failureDetail || null });
        break;
      }
      const navigationHref = step.type === "CLICK" ? navigationHrefForVisibleClick(resolved.target.element) : "";
      if (navigationHref) {
        result.steps.push({ index, type: "CLICK", status: "dispatched_pending_navigation", target_description: resolved.target.description, text: clickDispatch?.dispatch_id ? `dispatch_id=${clickDispatch.dispatch_id}` : "", click_strategy: clickResult?.strategy || "", dispatch_id: clickDispatch?.dispatch_id || null, expected_navigation_path: navigationHref });
        result.navigation_handoff = { type: "VISIBLE_ANCHOR_NAVIGATION", step_index: index, dispatch_id: clickDispatch?.dispatch_id || null, page_url_before: location.href, expected_navigation_path: navigationHref, target_description: resolved.target.description };
        return result;
      }
      const nextType = String(steps[offset + 1] && steps[offset + 1].type || "").toUpperCase();
      const followupMenuStep = step.type === "TYPE" && (nextType === "COLLECT_MENU" || nextType === "SELECT_OPTION");
      await uiDelay(followupMenuStep ? Math.min(120, UI_PLAN_POST_ACTION_DELAY_MS) : stepPostActionDelay(plan, steps, offset));
      if (step.type === "SELECT_OPTION" && resolved.menu) result.menu = publicMenuModel(resolved.menu);
      result.steps.push({ index, type: step.type, status: "completed", target_description: resolved.target.description, text: step.type === "TYPE" ? "введено" : (step.type === "SELECT_OPTION" ? String(step.text || "") : (clickDispatch?.dispatch_id ? `dispatch_id=${clickDispatch.dispatch_id}` : "")), input_strategy: step.type === "TYPE" ? typeResult.strategy : "", selection_strategy: step.type === "SELECT_OPTION" ? selectResult.strategy : "", click_strategy: step.type === "CLICK" ? clickResult.strategy : "", dispatch_id: clickDispatch?.dispatch_id || null });
    }
    if (latestTypeContext?.menu_capture) stopVisibleMenuCapture(latestTypeContext.menu_capture);
    return result;
  }
  function performDiagnosticAction(request) {
    const action = String(request?.action || "").toUpperCase();
    if (!Core.isAvitoUrl(location.href)) return { ok: false, action, blocked_reason: "DIAGNOSTIC_TARGET_NOT_AVITO" };
    const block=detectBlock();if (block) return {ok:false,action,blocked_reason:block};
    if (action !== "OPEN_LOCATION_DIALOG") return { ok: false, action, blocked_reason: "DIAGNOSTIC_ACTION_NOT_ALLOWED" };
    const target = firstVisible(["[data-marker='search-form/change-location'] a[role='button']", "a[data-marker='search-form/change-location'][role='button']"]);
    if (!target) return { ok: false, action, blocked_reason: "DIAGNOSTIC_ACTION_TARGET_MISSING" };
    if (disabledControl(target.element) || !pointerReachable(target.element)) return {ok:false,action,blocked_reason:"DIAGNOSTIC_ACTION_TARGET_DISABLED_OR_OBSCURED"};
    const before = target.element.getAttribute("aria-expanded") || "";
    target.element.click();
    return {
      ok: true,
      action,
      target_description: `${target.element.tagName.toLowerCase()} via ${target.selector}`,
      target_text: textOf(target.element, 160),
      aria_expanded_before: before,
      actions_performed: "OPEN_LOCATION_DIALOG"
    };
  }
  function routeControlText(element) {
    if (!(element instanceof Element)) return "";
    return textOf(element, 180) || Core.normalizeText(element.getAttribute("title") || element.getAttribute("aria-label") || "").slice(0, 180);
  }
  function routeDialog() {
    return firstVisible([
      "[data-marker='popup-location']",
      "[data-marker^='popup-location/'] [role='dialog']",
      "[role='dialog'][data-marker*='location']"
    ]);
  }
  function routeCity() {
    const direct = firstVisible([
      "[data-marker='search-form/change-location']",
      "[data-marker='popup-location/region']",
      "[data-marker*='location'][role='button']"
    ]);
    if (direct) return routeControlText(direct.element);
    const candidates = Array.from(document.querySelectorAll("a[role='button'][title],button[title]")).filter(visible);
    const named = candidates.find((node) => {
      const text = routeControlText(node);
      return text && text.length <= 90 && /[А-ЯЁа-яё]/u.test(text) && !/каталог|бизнес|карьер|помощ|избран|корзин|вход|размест/i.test(text);
    });
    return named ? routeControlText(named) : "";
  }
  async function readSequentialPublicListing(request = {}) {
    const loginEvents = [];
    const observedLogin = optionalLoginPopup();
    if (observedLogin) {
      loginEvents.push({ phase: "sequential_before_read", status: "observed", closed: false, reason: "OPTIONAL_LOGIN_POPUP_OBSERVED" });
      return { ok: true, details: { blocked_reason: "OPTIONAL_LOGIN_POPUP_OBSERVED", source: "visible_public_listing_dom" }, login_popup_events: loginEvents };
    }
    const initialBlock = detectBlock();
    if (initialBlock) return { ok: true, details: { blocked_reason: initialBlock, source: "visible_public_listing_dom" }, login_popup_events: loginEvents };
    const details = await waitForPublicListingSurface(request.timeout_ms || 6500);
    if (optionalLoginPopup()) {
      loginEvents.push({ phase: "sequential_after_read", status: "observed", closed: false, reason: "OPTIONAL_LOGIN_POPUP_OBSERVED" });
      details.blocked_reason = "OPTIONAL_LOGIN_POPUP_OBSERVED";
    }
    return { ok: true, details, login_popup_events: loginEvents };
  }

  function routeLocalFirst() {
    const controls = Array.from(document.querySelectorAll("input[type='checkbox'],[role='checkbox'],button[role='checkbox']")).filter(visible);
    const item = controls.find((node) => /сначала\s+в\s+выбранном\s+городе/iu.test(textOf(node.parentElement || node, 220)));
    if (!item) return null;
    if (item instanceof HTMLInputElement) return Boolean(item.checked);
    const aria = item.getAttribute("aria-checked");
    return aria === "true" ? true : aria === "false" ? false : null;
  }
  function routeLoginPopup() {
    return Boolean(optionalLoginPopup());
  }
  function routeContext() {
    const dialog = routeDialog();
    const block = detectBlock();
    const searchInput = findSearchInput();
    const listingLinks = Array.from(document.querySelectorAll("a[data-marker='item-title']")).filter(visible);
    const hasListingTitle = Boolean(firstVisible(["h1"]));
    const pageKind = block === "AVITO_IP_BLOCK" ? "ip_block"
      : (block === "AVITO_RATE_LIMIT" ? "rate_limit"
        : (block === "BLOCKED_LOGIN_OR_CAPTCHA" ? "captcha"
          : (dialog ? "location_dialog" : listingLinks.length ? "search_results" : (hasListingTitle && !searchInput ? "listing" : (searchInput ? "main_or_search" : "other")))));
    const controls = controlsInOrSelf(document.body, 18).map((node) => actionCandidate(node).description);
    return {
      url: location.href,
      title: document.title,
      captured_at: new Date().toISOString(),
      page_kind: pageKind,
      city: routeCity(),
      query: searchInput ? String(searchInput.element.value || "").trim().slice(0, 160) : "",
      dialog_open: Boolean(dialog),
      local_first: routeLocalFirst(),
      login_popup: routeLoginPopup(),
      visible_controls: controls.slice(0, 12),
      actions_performed: "none_read_only"
    };
  }
  function inspect() {
    const inputs = Array.from(document.querySelectorAll("input,textarea,[contenteditable='true'],[role='combobox']")).filter(visible);
    const buttons = Array.from(document.querySelectorAll("button,[role='button']")).filter(visible);
    const links = Array.from(document.querySelectorAll("a[href*='/item/'],a[data-marker*='item']")).filter(visible);
    const snapshot = diagnose({ scope: "FILTERS_VISIBLE" });
    return { ...snapshot, input_count: inputs.length, button_count: buttons.length, listing_link_count: links.length, actions_performed: "none_read_only" };
  }
  if (globalThis.__AF_TEST_EXPORTS) {
    globalThis.__AF_TEST_EXPORTS.optionSelection = { dialogScopedOptionCandidates, adaptiveOptionCandidates, startVisibleMenuCapture, waitForVisibleMenu, modelVisibleMenu, publicMenuModel, menuLabelKey, pointerReachable, candidateInMenuBand, fieldStateMessage, queryKey, queryRelatedToOption, inputStateIsSettled };
    globalThis.__AF_TEST_EXPORTS.uiPlan = { executeUiActionPlan, recordUiClickDispatch, collectPublicListings, collectPublicListingDetails, canonicalListingHref, scanVisibleResultsPage, readSequentialPublicListing, waitForPublicListingSurface, routeContext, typedValueMatchesVisibleControl, waitForTypedValueConfirmation };
    globalThis.__AF_TEST_EXPORTS.dom = { resolveScope, sanitizeClone, diagnose, waitForPublicListings, cancelOperation, lifetime };
    globalThis.__AF_TEST_EXPORTS.optionalLogin = { optionalLoginPopup, routeLoginPopup };
  }
  async function runContentTask(task) {
    if (lifetime.busy) throw new Error("AVITO_CONTENT_OPERATION_BUSY");
    lifetime.busy = true;
    try { return await task(); } finally {
      lifetime.busy = false;
      for (const capture of menuCaptures) stopVisibleMenuCapture(capture);
    }
  }
  function onAvitoMessage(message, _sender, sendResponse) {
    try {
      if (message?.type === "AF_AVITO_PING") { sendResponse({ ok: true, version: ADAPTER_VERSION, busy: lifetime.busy }); return; }
      if (message?.type === "AF_CANCEL_AVITO_OPERATION") { cancelOperation(); sendResponse({ ok: true, cancelled: true }); return; }
      assertAlive();
      if (!Core.isPublicAvitoUrl(location.href)) { sendResponse({ok:false,error:'PUBLIC_AVITO_PAGE_REQUIRED'}); return; }
      if (message?.type === "AF_INSPECT_AVITO_DOM") { sendResponse({ ok: true, snapshot: inspect() }); return; }
      if (message?.type === "AF_GET_ROUTE_CONTEXT") { sendResponse({ ok: true, context: routeContext() }); return; }
      if (message?.type === "AF_PERFORM_DIAGNOSTIC_ACTION") { sendResponse({ ok: true, result: performDiagnosticAction(message.request || {}) }); return; }
      if (message?.type === "AF_DIAGNOSE_AVITO_DOM") { sendResponse({ ok: true, snapshot: diagnose(message.request || {}) }); return; }
      if (message?.type === "AF_CONFIRM_DEBUGGER_TYPE_TARGET_FOCUSED") { sendResponse({ ok: true, data: debuggerTargetState(message.token) }); return; }
      if (message?.type === "AF_CONFIRM_DEBUGGER_TYPE_VALUE") { sendResponse({ ok: true, data: debuggerTargetState(message.token, String(message.expected_value || "")) }); return; }
      if (message?.type === "AF_CONFIRM_DEBUGGER_CLICK_TARGET_VISIBLE" || message?.type === "AF_CONFIRM_DEBUGGER_OPTION_TARGET_VISIBLE") { sendResponse({ ok: true, data: debuggerClickTargetState(message.token) }); return; }
      if (message?.type === "AF_EXECUTE_AVITO_UI_PLAN") { runContentTask(() => executeUiActionPlan(message.plan || {})).then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error?.message || "AVITO_UI_PLAN_FAILED" })); return true; }
      if (message?.type === "AF_SEQUENTIAL_READ_PUBLIC_LISTING") { runContentTask(() => readSequentialPublicListing(message.request || {})).then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error?.message || "SEQUENTIAL_LISTING_READ_FAILED" })); return true; }
      sendResponse({ ok: false, error: "UNKNOWN_MESSAGE" });
    } catch (error) { sendResponse({ ok: false, error: error?.message || "AVITO_DIAGNOSTIC_FAILED" }); }
  }
  chrome.runtime.onMessage.addListener(onAvitoMessage);
})();
