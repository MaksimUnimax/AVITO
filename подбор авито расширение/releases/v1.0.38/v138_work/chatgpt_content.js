/* Avito Finder — complete isolated transplant of the Business Bridge v1.8.34.5 ChatGPT capture adapter. */
/* global chrome, AvitoFinderCore */
(() => {
  "use strict";

  const Core = AvitoFinderCore;

  // Content scripts are disposable DOM adapters. After extension reload/update,
  // Chrome can leave an old isolated-world instance alive but with an invalid
  // runtime context. A version guard that simply returns would then prevent a
  // fresh adapter from being injected into the same tab. New injection must
  // supersede, dispose and replace the previous adapter instead.
  const CONTENT_SCRIPT_VERSION = "0.6.18";
  const CONTENT_SCRIPT_PROTOCOL = "avito_finder_bridge_exact_capture_v1";
  const CONTENT_RUNTIME_KEY = "__AVITO_FINDER_BRIDGE_EXACT_CAPTURE_RUNTIME__";
  const CONTENT_RUNTIME_ID = `${CONTENT_SCRIPT_VERSION}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const priorRuntime = globalThis[CONTENT_RUNTIME_KEY];
  if (priorRuntime && typeof priorRuntime.dispose === "function") {
    try { priorRuntime.dispose("superseded_by_fresh_content_adapter"); } catch (_) {}
  }
  // Avito Finder owns only its own disposable runtime key.
  const contentRuntime = { id: CONTENT_RUNTIME_ID, disposed: false, dispose: null };
  globalThis[CONTENT_RUNTIME_KEY] = contentRuntime;

  const overlayId = "avito-finder-capture-status-overlay";
  const pickerOverlayId = "avito-finder-capture-send-picker-overlay";
  const PICKER_TEST_TEXT = "AVITO_FINDER_BUTTON_TEST — это тест, сообщение не будет отправлено.";
  const SEND_BUTTON_RENDER_WAIT_MS = 2000;
  const SEND_BUTTON_DISCOVERY_TIMEOUT_MS = 6000;
  const SEND_BUTTON_DISCOVERY_POLL_MS = 100;
  const PROMPT_STABILITY_MS = Number(globalThis.__AF_TEST_PROMPT_STABILITY_MS ?? 2000);
  // Copy/control readiness is not sufficient evidence that the Writing Block body
  // has stopped streaming. ChatGPT can expose the toolbar while the block text is
  // still growing. Require multiple identical local body samples before handing a
  // command to the Worker. Invalid-looking payloads get a longer settle window
  // because a truncated command commonly parses as UI_PLAN_STEP_REQUIRED.
  const PROMPT_PAYLOAD_SAMPLE_MS = Number(globalThis.__AF_TEST_PROMPT_PAYLOAD_SAMPLE_MS ?? 600);
  const PROMPT_PAYLOAD_STABILITY_MS = Number(globalThis.__AF_TEST_PROMPT_PAYLOAD_STABILITY_MS ?? 1800);
  const PROMPT_INVALID_PAYLOAD_STABILITY_MS = Number(globalThis.__AF_TEST_PROMPT_INVALID_PAYLOAD_STABILITY_MS ?? 4000);
  const PROMPT_PAYLOAD_MIN_SAMPLES = Number(globalThis.__AF_TEST_PROMPT_PAYLOAD_MIN_SAMPLES ?? 3);
  const PROMPT_ACTIVE_RECHECK_MS = 750;
  const PROMPT_MUTATION_DEBOUNCE_MS = 250;
  const MANUAL_PROFILE_KIND = "manual_selected_button_v142";

  let promptPollTimer = null;
  let promptStabilityTimer = null;
  // Every ordinary prompt-wait generation is fenced. An earlier asynchronous
  // Copy response is never allowed to stop or replace a newer same-chat wait.
  let promptPollGeneration = 0;
  let sendButtonProfile = null;
  let pickerState = null;
  let suppressNextClick = false;
  let currentAnchorTurnId = null;
  // The anchor currently owned by a live prompt-poll generation. This is
  // distinct from a newly delivered report anchor: delivery may discover that
  // anchor before the Worker explicitly installs the next poll.
  let promptPollBoundAnchorTurnId = null;
  // Set only by the Copy-recovery branch. It pins polling to the already
  // observed assistant writing block so later operator messages cannot replace
  // that form while the operator resumes the same paused Copy attempt.
  let currentExpectedAssistantTurnId = null;
  let candidateFirstSeen = null;
  let promptFastTimer = null;
  let promptObserver = null;
  let promptMutationTimer = null;
  let promptTickInFlight = false;
  let lastDiagnosticSignature = "";
  let lastDiagnosticAt = 0;
  let pageStateTimer = null;
  let pageStateSyncInFlight = false;
  let lastPromptActivitySignature = "";
  let lastPromptActivityAt = 0;

  let reportSendGeneration = 0;
  const localReportDeliveries = new Map();
  let plainDeliveryInFlight = null;
  function assertReportSendGeneration(generation) {
    if (!contentRuntimeIsCurrent() || generation !== reportSendGeneration) throw bridgeError("Отправка отменена до нового клика.", "REPORT_SEND_CANCELLED");
  }
  let activeRunId = null;
  let activeConversationId = null;
  // Avito Finder additionally pins this transplanted Bridge adapter to the exact
  // tab conversation chosen at Start. It never searches for another ChatGPT tab.
  let activeConversationRef = null;
  // Test-only identity override used by the packaged Chromium regression fixture.
  // Production code never initializes this value.
  let fixtureConversationIdentityOverride = null;
  const confirmedLocalWritingBlockCopyButtons = new WeakSet();

  function contentRuntimeIsCurrent() {
    return contentRuntime.disposed !== true && globalThis[CONTENT_RUNTIME_KEY] === contentRuntime;
  }

  function disposeContentRuntime(reason = "disposed") {
    if (contentRuntime.disposed === true) return;
    contentRuntime.disposed = true;
    reportSendGeneration += 1;
    contentRuntime.dispose_reason = reason;
    try { stopPromptPolling(); } catch (_) {}
    try {
      routeObserver?.disconnect();
      if (pageStateTimer) clearInterval(pageStateTimer);
      pageStateTimer = null;
    } catch (_) {}
    try {
      if (globalThis[CONTENT_RUNTIME_KEY] === contentRuntime) delete globalThis[CONTENT_RUNTIME_KEY];
    } catch (_) {}
  }
  contentRuntime.dispose = disposeContentRuntime;

  function isExtensionContextInvalidated(error) {
    return /Extension context invalidated/i.test(String(error?.message || error || ""));
  }

  function conversationIdentity() {
    if (fixtureConversationIdentityOverride) return { ...fixtureConversationIdentityOverride };
    const match = location.pathname.match(/(?:^|\/)c\/([0-9a-f-]{36})(?:\/|$)/i);
    return {
      origin: location.origin,
      chat_path: location.pathname,
      conversation_id: match ? match[1].toLowerCase() : null
    };
  }

  function sameActiveConversation(expectedConversationId) {
    const identity = conversationIdentity();
    return Boolean(expectedConversationId && identity.conversation_id && identity.conversation_id === expectedConversationId);
  }

  function sameConversationReference(expected) {
    const actual = conversationIdentity();
    return Boolean(expected && actual.origin === expected.origin && actual.conversation_id && actual.conversation_id === expected.conversation_id);
  }

  function assertExpectedConversation(expected, phase) {
    if (!sameConversationReference(expected)) {
      throw bridgeError("Открытый ChatGPT-контекст изменился. Avito Finder не действует в другом диалоге и ждёт возврата в закреплённый чат.", `CONVERSATION_CONTEXT_CHANGED_${phase}`);
    }
  }

  async function reportConversationContextBlocked(phase, expected) {
    await request("AF_CAPTURE_CONTEXT_BLOCKED", {
      search_id: activeRunId,
      reason: `CONVERSATION_CONTEXT_CHANGED_${phase}`,
      expected_identity: expected || activeConversationRef || null,
      actual_identity: conversationIdentity()
    });
  }

  async function waitForConversationIdentity(timeoutMs = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const identity = conversationIdentity();
      if (identity.conversation_id) return identity;
      await sleep(250);
    }
    return conversationIdentity();
  }

  const AF_REQUEST_TYPE_MAP = Object.freeze({
    GET_SEND_BUTTON_PROFILE_PRIVATE: "AF_CAPTURE_GET_SEND_PROFILE",
    RECORD_DIAGNOSTIC: "AF_CAPTURE_DIAGNOSTIC",
    AUTOMATION_PROMPT_ACTIVITY: "AF_CAPTURE_ACTIVITY",
    AUTOMATION_PROMPT_CANDIDATE: "AF_CAPTURE_FULL_TEXT",
    AUTOMATION_PROMPT_FORM_ERROR: "AF_CAPTURE_FORM_ERROR",
    AF_CAPTURE_CONTEXT_BLOCKED: "AF_CAPTURE_CONTEXT_BLOCKED",
    AF_CAPTURE_REPORT_SEND_INTENT: "AF_CAPTURE_REPORT_SEND_INTENT",
    AF_CAPTURE_START_SEND_INTENT: "AF_CAPTURE_START_SEND_INTENT",
    AF_CAPTURE_RECOVER_CONTINUOUS: "AF_CAPTURE_RECOVER_CONTINUOUS"
  });

  const RUNTIME_REQUEST_TIMEOUT_MS = 8000;
  const ACTIVITY_REQUEST_TIMEOUT_MS = 1200;

  function request(type, payload = {}, timeoutMs = RUNTIME_REQUEST_TIMEOUT_MS) {
    return new Promise((resolve) => {
      if (!contentRuntimeIsCurrent()) {
        resolve({ ok: false, code: "CONTENT_ADAPTER_SUPERSEDED", error: "Content adapter is superseded." });
        return;
      }
      const mappedType = AF_REQUEST_TYPE_MAP[type];
      if(!mappedType){resolve({ok:false,code:'UNSUPPORTED_INTERNAL_REQUEST',error:'Unsupported local protocol message'});return;}
      let settled = false;
      const safeTimeout = Math.max(250, Number(timeoutMs) || RUNTIME_REQUEST_TIMEOUT_MS);
      let timeoutId = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve(value);
      };
      timeoutId = setTimeout(() => {
        finish({
          ok: false,
          code: "RUNTIME_MESSAGE_TIMEOUT",
          error: `Chrome runtime message timed out: ${mappedType}`
        });
      }, safeTimeout);
      try {
        chrome.runtime.sendMessage({ type: mappedType, ...payload }, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            const message = String(lastError.message || "Chrome runtime message failed.");
            if (isExtensionContextInvalidated(message)) disposeContentRuntime("extension_context_invalidated");
            finish({ ok: false, code: isExtensionContextInvalidated(message) ? "EXTENSION_CONTEXT_INVALIDATED" : "RUNTIME_MESSAGE_FAILED", error: message });
            return;
          }
          finish(response || { ok: false, error: "No response." });
        });
      } catch (error) {
        if (isExtensionContextInvalidated(error)) disposeContentRuntime("extension_context_invalidated");
        finish({ ok: false, code: isExtensionContextInvalidated(error) ? "EXTENSION_CONTEXT_INVALIDATED" : "RUNTIME_MESSAGE_THROW", error: String(error?.message || error || "Chrome runtime message failed.") });
      }
    });
  }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function createCloseButton(onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Закрыть уведомление");
    button.textContent = "×";
    button.style.cssText = [
      "flex:none", "width:24px", "height:24px", "margin:-2px -3px -2px 8px",
      "border:0", "border-radius:6px", "background:transparent", "color:inherit",
      "font:700 22px/20px system-ui,sans-serif", "cursor:pointer"
    ].join(";");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function ensureOverlay() {
    let el = document.getElementById(overlayId);
    if (el) return el;
    el = document.createElement("div");
    el.id = overlayId;
    el.setAttribute("role", "status");
    el.style.cssText = [
      "position:fixed", "top:18px", "right:18px", "z-index:2147483646",
      "display:none", "max-width:460px", "padding:10px 10px 10px 12px",
      "border-radius:10px", "font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif",
      "color:#fff", "background:#1f2937", "box-shadow:0 8px 24px rgba(0,0,0,.28)",
      "align-items:flex-start"
    ].join(";");
    const message = document.createElement("div");
    message.className = "bridge-status-message";
    message.style.cssText = "min-width:0; flex:1;";
    el.append(message, createCloseButton(() => { el.style.display = "none"; }));
    document.documentElement.appendChild(el);
    return el;
  }

  function showStatus(text, tone = "neutral") {
    const colors = { neutral: "#1f2937", active: "#1d4ed8", success: "#166534", warning: "#92400e", error: "#991b1b" };
    const el = ensureOverlay();
    const message = el.querySelector(".bridge-status-message");
    if (message) message.textContent = text;
    el.style.background = colors[tone] || colors.neutral;
    el.style.display = "flex";
  }

  function ensurePickerOverlay() {
    let el = document.getElementById(pickerOverlayId);
    if (el) return el;
    el = document.createElement("div");
    el.id = pickerOverlayId;
    el.style.cssText = [
      "position:fixed", "top:74px", "right:18px", "z-index:2147483646",
      "display:none", "max-width:470px", "padding:10px 10px 10px 12px",
      "border-radius:10px", "font:600 13px/1.38 system-ui,sans-serif",
      "color:#fff", "background:#7c2d12", "box-shadow:0 10px 30px rgba(0,0,0,.35)",
      "align-items:flex-start"
    ].join(";");
    const message = document.createElement("div");
    message.className = "bridge-picker-message";
    message.style.cssText = "min-width:0; flex:1;";
    el.append(message, createCloseButton(() => { el.style.display = "none"; }));
    document.documentElement.appendChild(el);
    return el;
  }

  function showPickerOverlay() {
    const el = ensurePickerOverlay();
    const message = el.querySelector(".bridge-picker-message");
    if (message) {
      message.textContent =
        "Тестовый текст уже вставлен. Кликни ровно ту кнопку, которую extension потом всегда будет нажимать. Этот клик не отправит сообщение. Esc — отмена.";
    }
    el.style.display = "flex";
  }

  function hidePickerOverlay() {
    const el = document.getElementById(pickerOverlayId);
    if (el) el.style.display = "none";
  }

  function isVisible(node) {
    if (!(node instanceof HTMLElement)) return false;
    const rect=node.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return false;
    for(let current=node;current instanceof HTMLElement;current=current.parentElement) {
      const style=getComputedStyle(current);
      if(current.hidden||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;
    }
    return true;
  }
  function closestInteractive(node) {
    if (!(node instanceof Element)) return null;
    return node.closest('button, [role="button"], input[type="submit"]');
  }

  function asEnabledButton(node) {
    const button = node instanceof HTMLElement ? node : closestInteractive(node);
    if (!(button instanceof HTMLElement)) return null;
    if (button.matches(':disabled')) return null;
    for(let current=button;current instanceof HTMLElement;current=current.parentElement)
      if(current.hasAttribute('inert') || current.getAttribute('aria-disabled') === 'true')return null;
    return isVisible(button) ? button : null;
  }

  function safeText(node) {
    return String(node?.innerText || node?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
  }

  const BRIDGE_STAGE_ATTR = "data-avito-finder-staged-report";
  const BRIDGE_STAGE_RUN_ATTR = "data-avito-finder-staged-run-id";
  const BRIDGE_STAGE_DELIVERY_ATTR = "data-avito-finder-staged-delivery-id";
  const BRIDGE_STAGE_TEXT_ATTR = "data-avito-finder-staged-text-fingerprint";
  const BRIDGE_STAGE_REPORT_ATTR = "data-avito-finder-staged-report-fingerprint";

  // v1.0.26: paired public-DOM codec. Textarea.value and a rich editor's
  // textContent are NOT the same transport: <p>/<div>/<br> carry newlines.
  // Do not use innerText here: its layout/hidden-node rules vary with rendering.
  const COMPOSER_BLOCK_TAGS = new Set(["P", "DIV", "PRE", "BLOCKQUOTE", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6"]);
  const composerInputGuards = new WeakMap();
  function normalizedComposerPayload(value) {
    // Only transport-equivalent encodings; never collapse spaces/newlines or
    // discard ZWJ/Unicode characters to manufacture a successful comparison.
    return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  }
  function readEditorNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return "";
    if (node.nodeName === "BR") {
      return node.classList?.contains("ProseMirror-trailingBreak") ? "" : "\n";
    }
    const children = Array.from(node.childNodes || []);
    // A single <br> is an editor's empty-block placeholder, not a report line.
    if (COMPOSER_BLOCK_TAGS.has(node.nodeName) && children.length === 1 && children[0].nodeName === "BR") return "";
    let text = "", seen = false, previousBlock = false;
    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) continue;
      const block = COMPOSER_BLOCK_TAGS.has(child.nodeName);
      if (seen && (block || previousBlock)) text += "\n";
      text += readEditorNode(child);
      seen = true;
      previousBlock = block;
    }
    return text;
  }
  function getComposerText(composer) {
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) return composer.value;
    return readEditorNode(composer);
  }
  function beginComposerInputGuard(composer) {
    const previous = composerInputGuards.get(composer);
    if (previous) previous.dispose();
    const guard = { user_input_observed: false, input_type: "", dispose: null };
    const onInput = event => {
      if (!contentRuntimeIsCurrent() || !event.isTrusted) return;
      guard.user_input_observed = true;
      guard.input_type = String(event.inputType || event.type || "");
    };
    const events = ["beforeinput", "input", "paste", "cut", "drop", "compositionstart"];
    for (const name of events) composer.addEventListener(name, onInput, true);
    guard.dispose = () => { for (const name of events) composer.removeEventListener(name, onInput, true); };
    composerInputGuards.set(composer, guard);
    return guard;
  }
  function composerReadbackDetails(composer, expected, phase) {
    const actual = getComposerText(composer);
    const normalize = normalizedComposerPayload;
    const a = normalize(actual), e = normalize(expected);
    let mismatch = 0;
    while (mismatch < a.length && mismatch < e.length && a[mismatch] === e[mismatch]) mismatch++;
    return {
      event_source: phase,
      content_script_version: CONTENT_SCRIPT_VERSION,
      composer_codec: composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement ? "value" : "block_dom_v1",
      expected_text_length: e.length, readback_text_length: a.length,
      expected_line_count: e.split("\n").length, readback_line_count: a.split("\n").length,
      expected_text_fingerprint: localTextFingerprint(e), readback_text_fingerprint: localTextFingerprint(a),
      raw_dom_text_length: String(composer.textContent || "").length,
      first_mismatch_index: a === e ? -1 : mismatch,
      user_input_observed: composerInputGuards.get(composer)?.user_input_observed === true,
      paragraph_count: composer.querySelectorAll("p,div").length,
      break_count: composer.querySelectorAll("br").length
    };
  }
  function assertComposerReportReadback(composer, expected, phase) {
    const details = composerReadbackDetails(composer, expected, phase);
    if (details.user_input_observed) {
      recordDiagnostic("REPORT_USER_INPUT_DURING_STAGE", { ...details, rejection_reason: "trusted_input_observed" });
      throw bridgeError("Во время подготовки обнаружен ввод в поле. Текст сохранён; автоматическая отправка отменена.", "REPORT_STAGED_TEXT_CHANGED");
    }
    if (!composerTextMatchesReport(getComposerText(composer), expected)) {
      recordDiagnostic("REPORT_TEXT_READBACK_MISMATCH", { ...details, rejection_reason: "payload_roundtrip_mismatch" });
      throw bridgeError("Содержимое редактора не совпало с исходным отчётом после вставки. Это не доказательство пользовательской правки. Исходный отчёт сохранён; отправка остановлена.", "REPORT_TEXT_ROUNDTRIP_MISMATCH");
    }
    recordDiagnostic("REPORT_TEXT_READBACK_CONFIRMED", details);
  }

  function canonicalComposerText(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
  }

  function localTextFingerprint(value) {
    const text = canonicalComposerText(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${(hash >>> 0).toString(16)}`;
  }

  function composerTextMatchesReport(actualText, expectedText) {
    return normalizedComposerPayload(actualText) === normalizedComposerPayload(expectedText);
  }

  function readComposerBridgeStage(composer) {
    if (!(composer instanceof HTMLElement) || composer.getAttribute(BRIDGE_STAGE_ATTR) !== "1") return null;
    return {
      run_id: composer.getAttribute(BRIDGE_STAGE_RUN_ATTR) || "",
      delivery_id: composer.getAttribute(BRIDGE_STAGE_DELIVERY_ATTR) || "",
      text_fingerprint: composer.getAttribute(BRIDGE_STAGE_TEXT_ATTR) || "",
      report_fingerprint: composer.getAttribute(BRIDGE_STAGE_REPORT_ATTR) || ""
    };
  }

  function markComposerBridgeStage(composer, stageIdentity, text) {
    if (!(composer instanceof HTMLElement)) return;
    composer.setAttribute(BRIDGE_STAGE_ATTR, "1");
    composer.setAttribute(BRIDGE_STAGE_RUN_ATTR, stageIdentity?.run_id || "");
    composer.setAttribute(BRIDGE_STAGE_DELIVERY_ATTR, stageIdentity?.delivery_id || "");
    composer.setAttribute(BRIDGE_STAGE_TEXT_ATTR, localTextFingerprint(text));
    composer.setAttribute(BRIDGE_STAGE_REPORT_ATTR, stageIdentity?.report_fingerprint || "");
    recordDiagnostic("REPORT_TEXT_STAGE_OWNERSHIP_MARKED", {
      event_source: "report_text_stage",
      run_id: stageIdentity?.run_id || "",
      delivery_id: stageIdentity?.delivery_id || ""
    });
  }

  function clearComposerBridgeStage(composer) {
    if (!(composer instanceof HTMLElement)) return;
    composer.removeAttribute(BRIDGE_STAGE_ATTR);
    composer.removeAttribute(BRIDGE_STAGE_RUN_ATTR);
    composer.removeAttribute(BRIDGE_STAGE_DELIVERY_ATTR);
    composer.removeAttribute(BRIDGE_STAGE_TEXT_ATTR);
    composer.removeAttribute(BRIDGE_STAGE_REPORT_ATTR);
  }

  function setComposerText(composer, text) {
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composer), "value");
      const setter = descriptor?.set;
      if (!setter) throw new Error("ChatGPT composer value setter unavailable.");
      setter.call(composer, text);
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text
      }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    // Insert valid rich-editor blocks, not raw newlines in one root text node.
    // createTextNode keeps seller text/URLs literal, never executable HTML.
    const fragment = document.createDocumentFragment();
    for (const line of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
      const paragraph = document.createElement("p");
      if (line) paragraph.appendChild(document.createTextNode(line));
      else paragraph.appendChild(document.createElement("br"));
      fragment.appendChild(paragraph);
    }
    composer.replaceChildren(fragment);
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text
    }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isInsideAssistantOrWritingBlock(node) {
    if (!(node instanceof Element)) return false;
    return Boolean(node.closest(
      'section[data-turn="assistant"], [data-message-author-role="assistant"], [data-writing-block], [data-writing-block-id], #code-block-viewer'
    ));
  }

  function isComposerForm(form) {
    return form instanceof HTMLFormElement &&
      form.isConnected &&
      isVisible(form) &&
      !isInsideAssistantOrWritingBlock(form);
  }

  function isChatComposerNode(node) {
    if (!(node instanceof HTMLElement) || !node.isConnected || !isVisible(node)) return false;
    if (node.getAttribute("contenteditable") === "false" || node.hasAttribute("readonly") || node.hasAttribute("disabled")) return false;
    if (isInsideAssistantOrWritingBlock(node)) return false;
    return isComposerForm(node.closest("form"));
  }

  function composerCandidateScore(node) {
    const form = node.closest("form");
    const rect = node.getBoundingClientRect();
    const formRect = form?.getBoundingClientRect?.() || rect;
    let score = 0;
    if (node.id === "prompt-textarea") score += 2000;
    if ((node.getAttribute("data-testid") || "").toLowerCase().includes("prompt")) score += 500;
    if (form?.querySelector('button[data-testid*="send"], button[aria-label*="send" i], button[aria-label*="отправ" i]')) score += 200;
    if (form?.querySelector('input[type="file"]')) score += 100;
    if (formRect.bottom >= window.innerHeight * 0.55) score += 80;
    if (rect.bottom >= window.innerHeight * 0.55) score += 40;
    score += Math.max(0, Math.min(40, Math.round(rect.bottom / Math.max(1, window.innerHeight) * 40)));
    return score;
  }

  function composerContextFromNode(node) {
    if (!isChatComposerNode(node)) return null;
    const form = node.closest("form");
    if (!isComposerForm(form)) return null;
    return { composer: node, form };
  }

  function isComposerContextValid(context) {
    return Boolean(context && context.composer && context.form &&
      context.form.contains(context.composer) &&
      composerContextFromNode(context.composer));
  }

  function closestConversationMessage(form) {
    if (!(form instanceof Element)) return null;
    return form.closest(
      'article, section[data-turn], [data-message-author-role], [data-testid*="conversation-turn" i], [data-testid*="message" i]'
    );
  }

  function hasWritingBlockEditorSignature(container) {
    if (!(container instanceof Element)) return false;
    if (container.matches('[data-writing-block], [data-writing-block-id], #code-block-viewer')) return true;
    if (container.querySelector('[data-writing-block], [data-writing-block-id], #code-block-viewer, [data-testid="writing-block-header-magic-edit-button"]')) return true;
    return [...container.querySelectorAll('button, [role="button"]')].some((node) =>
      /редактировать|edit/.test(buttonToken(buttonSnapshot(node)))
    );
  }

  function isEmbeddedAssistantEditor(form) {
    if (!(form instanceof HTMLFormElement)) return false;
    if (isInsideAssistantOrWritingBlock(form)) return true;
    const message = closestConversationMessage(form);
    if (!message) return false;
    const role = String(message.getAttribute('data-message-author-role') || message.getAttribute('data-turn') || '').toLowerCase();
    if (role === 'assistant') return true;
    // A chat composer is never a child of a conversation message. Treat any
    // editor nested in a message as embedded, even when ChatGPT changes its
    // private attributes and the assistant role cannot be read.
    return hasWritingBlockEditorSignature(message) || Boolean(message.closest('article, section[data-turn], [data-testid*="conversation-turn" i]'));
  }

  function primaryComposerAnchor(node, form) {
    if (!(node instanceof HTMLElement) || !(form instanceof HTMLFormElement)) return '';
    const id = String(node.id || '').toLowerCase();
    const testId = String(node.getAttribute('data-testid') || '').toLowerCase();
    if (id === 'prompt-textarea' || testId === 'prompt-textarea' || testId.includes('prompt-textarea')) return 'prompt-textarea';
    const shell = form.closest('#composer-background, [data-testid*="composer" i], [data-testid*="prompt" i]');
    if (shell && !isEmbeddedAssistantEditor(form)) return 'composer-shell';
    return '';
  }

  function isPrimaryComposerContextValid(context) {
    if (!isComposerContextValid(context)) return false;
    if (isEmbeddedAssistantEditor(context.form)) return false;
    return Boolean(primaryComposerAnchor(context.composer, context.form));
  }

  function composerContextDiagnostic(context, eventSource) {
    const form = context?.form;
    return {
      event_source: eventSource,
      composer_scope: isPrimaryComposerContextValid(context) ? 'primary_chat_composer' : 'rejected_nonprimary',
      composer_anchor: form ? primaryComposerAnchor(context.composer, form) : '',
      embedded_editor_detected: form ? isEmbeddedAssistantEditor(form) : false,
      form_path: form ? pathKey(structuralPath(form)) : ''
    };
  }

  function visibleEmbeddedAssistantEditors() {
    return [...document.querySelectorAll('form')].filter((form) =>
      form instanceof HTMLFormElement && isVisible(form) && isEmbeddedAssistantEditor(form)
    );
  }

  function findPrimaryComposerContext() {
    // Automation may use only the persistent page-level ChatGPT composer.
    // Generic textarea/contenteditable fallbacks are intentionally forbidden:
    // an assistant writing block can expose an identical nested editor.
    const selectors = [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'textarea[id*="prompt" i]',
      'textarea[data-testid*="prompt" i]',
      '[contenteditable="true"][id*="prompt" i]',
      '[contenteditable="true"][data-testid*="prompt" i]'
    ];
    const seen = new Set();
    const candidates = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (seen.has(node)) continue;
        seen.add(node);
        const context = composerContextFromNode(node);
        if (!isPrimaryComposerContextValid(context)) continue;
        candidates.push({ context, score: composerCandidateScore(node) });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.context || null;
  }

  function findComposerContext() {
    return findPrimaryComposerContext();
  }

  function findComposer() {
    return findPrimaryComposerContext()?.composer || null;
  }

  function elementNthOfType(element) {
    let nth = 1;
    let sibling = element;
    while ((sibling = sibling.previousElementSibling)) {
      if (sibling.tagName === element.tagName) nth += 1;
    }
    return nth;
  }

  function structuralPath(element) {
    const path = [];
    let current = element;
    for (let depth = 0; current && depth < 12; depth += 1) {
      path.unshift({
        tag: current.tagName.toLowerCase(),
        nth: elementNthOfType(current)
      });
      if (current.tagName === "FORM" || current.tagName === "MAIN") break;
      current = current.parentElement;
    }
    return path;
  }

  function pathKey(path) {
    return (path || []).map((part) => `${part.tag}:${part.nth}`).join("/");
  }

  function elementIdentity(button) {
    return {
      tag: button.tagName.toLowerCase(),
      id: button.id || "",
      data_testid: button.getAttribute("data-testid") || "",
      aria_label: button.getAttribute("aria-label") || "",
      title: button.getAttribute("title") || "",
      type: button.getAttribute("type") || "",
      name: button.getAttribute("name") || "",
      text_hint: safeText(button),
      structural_path_key: pathKey(structuralPath(button))
    };
  }

  function makeSendButtonProfile(button) {
    const form = button.closest("form");
    return {
      version: 7,
      kind: MANUAL_PROFILE_KIND,
      captured_at: new Date().toISOString(),
      ...elementIdentity(button),
      form: form ? {
        data_testid: form.getAttribute("data-testid") || "",
        aria_label: form.getAttribute("aria-label") || "",
        id: form.id || "",
        role: form.getAttribute("role") || "",
        structural_path_key: pathKey(structuralPath(form))
      } : null
    };
  }

  function scoreManualProfile(button, profile) {
    if (!profile || profile.kind !== MANUAL_PROFILE_KIND || !isVisible(button)) return -Infinity;
    const identity = elementIdentity(button);
    let score = 0;

    if (profile.id && profile.id === identity.id) score += 100;
    if (profile.data_testid && profile.data_testid === identity.data_testid) score += 100;
    if (profile.aria_label && profile.aria_label === identity.aria_label) score += 60;
    if (profile.title && profile.title === identity.title) score += 40;
    if (profile.name && profile.name === identity.name) score += 25;
    if (profile.type && profile.type === identity.type) score += 20;
    if (profile.text_hint && profile.text_hint === identity.text_hint) score += 20;
    if (profile.tag === identity.tag) score += 5;
    if (profile.structural_path_key && profile.structural_path_key === identity.structural_path_key) score += 90;

    const form = button.closest("form");
    if (profile.form && form) {
      if (profile.form.id && profile.form.id === form.id) score += 25;
      if (profile.form.data_testid && profile.form.data_testid === (form.getAttribute("data-testid") || "")) score += 25;
      if (profile.form.aria_label && profile.form.aria_label === (form.getAttribute("aria-label") || "")) score += 15;
      if (profile.form.structural_path_key && profile.form.structural_path_key === pathKey(structuralPath(form))) score += 30;
    }
    return score;
  }

  function findSelectedManualButton(profile, composerContext = null) {
    if (!profile || profile.kind !== MANUAL_PROFILE_KIND) return null;
    const requiredForm = composerContext?.form || null;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))
      .map((node) => asEnabledButton(node))
      .filter(Boolean)
      .filter((button) => !requiredForm || button.closest("form") === requiredForm)
      .map((button) => ({ button, score: scoreManualProfile(button, profile) }))
      .filter((entry) => Number.isFinite(entry.score) && entry.score >= 25)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.button || null;
  }

  function primaryComposerSendButtonScore(button, composerContext) {
    if (!isPrimaryComposerContextValid(composerContext)) return -Infinity;
    if (!(button instanceof HTMLElement) || button.closest("form") !== composerContext.form) return -Infinity;
    if (isInsideAssistantOrWritingBlock(button) || isEmbeddedAssistantEditor(composerContext.form)) return -Infinity;

    const testId = String(button.getAttribute("data-testid") || "").toLowerCase();
    const aria = String(button.getAttribute("aria-label") || "").toLowerCase();
    const title = String(button.getAttribute("title") || "").toLowerCase();
    const name = String(button.getAttribute("name") || "").toLowerCase();
    const type = String(button.getAttribute("type") || "").toLowerCase();
    const text = safeText(button).toLowerCase();
    const token = `${testId} ${aria} ${title} ${name} ${type} ${text}`;
    let score = 0;

    if (testId === "send-button") score += 1000;
    if (testId.includes("send")) score += 700;
    if (/\b(send|submit)\b|отправ/.test(token)) score += 450;
    if (button.matches('button[type="submit"], input[type="submit"]')) score += 250;
    if (button.closest('[data-testid*="composer" i], #composer-background')) score += 120;
    if (/mic|voice|audio|dictat|голос|микрофон|stop|cancel|отмен/.test(token)) score -= 1200;
    return score;
  }

  function findPrimaryComposerSendButton(composerContext) {
    if (!isPrimaryComposerContextValid(composerContext)) return null;
    const candidates = Array.from(composerContext.form.querySelectorAll('button, [role="button"], input[type="submit"]'))
      .map((node) => asEnabledButton(node))
      .filter(Boolean)
      .map((button) => ({ button, score: primaryComposerSendButtonScore(button, composerContext) }))
      .filter((entry) => Number.isFinite(entry.score) && entry.score >= 250)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.button || null;
  }

  async function waitForPrimaryComposerSendButton(composerContext, timeoutMs = SEND_BUTTON_DISCOVERY_TIMEOUT_MS) {
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    const waitGeneration = reportSendGeneration;
    const expectedIdentity = activeConversationRef ? { ...activeConversationRef } : null;
    let attempts = 0;
    recordDiagnostic("REPORT_SEND_BUTTON_DISCOVERY_STARTED", {
      ...composerContextDiagnostic(composerContext, "report_delivery"),
      timeout_ms: Math.max(0, Number(timeoutMs) || 0)
    });
    while (Date.now() <= deadline) {
      attempts += 1;
      assertReportSendGeneration(waitGeneration);
      if (expectedIdentity) assertExpectedConversation(expectedIdentity, "DURING_SEND_BUTTON_DISCOVERY");
      if (!isPrimaryComposerContextValid(composerContext)) return null;
      const resolution = resolvePrimaryComposerSendButton(composerContext);
      if (resolution?.button) {
        recordDiagnostic("REPORT_SEND_BUTTON_DISCOVERY_RESOLVED", {
          ...composerContextDiagnostic(composerContext, "report_delivery"),
          event_source: resolution.source,
          attempts
        });
        return resolution;
      }
      if (Date.now() >= deadline) break;
      await sleep(Math.min(SEND_BUTTON_DISCOVERY_POLL_MS, Math.max(1, deadline - Date.now())));
    }
    recordDiagnostic("REPORT_SEND_BUTTON_DISCOVERY_TIMEOUT", {
      ...composerContextDiagnostic(composerContext, "report_delivery"),
      attempts,
      rejection_reason: "no_safe_send_button_before_bounded_deadline"
    });
    return null;
  }

  function resolvePrimaryComposerSendButton(composerContext) {
    // The user-selected manual profile is authoritative. ChatGPT's current
    // Send control can be icon-only and have no stable semantic label; applying
    // a second automatic "looks like Send" score after the exact user choice
    // turns a valid selected control into an indefinite wait.
    //
    // With a manual profile configured there is deliberately no automatic
    // fallback: only the button the user selected inside this primary composer
    // may be clicked. If it is absent or disabled, delivery waits safely.
    if (sendButtonProfile?.kind === MANUAL_PROFILE_KIND) {
      const selected = findSelectedManualButton(sendButtonProfile, composerContext);
      if (selected) return { button: selected, source: "manual_profile_exact_selection" };
      recordDiagnostic("REPORT_SEND_BUTTON_MANUAL_PROFILE_NOT_FOUND", {
        ...composerContextDiagnostic(composerContext, "report_delivery"),
        rejection_reason: "manual_profile_not_present_in_primary_composer"
      });
      return null;
    }

    // Profiles created before manual selection is configured retain the
    // conservative automatic path. This branch never runs when a manual
    // profile exists.
    const automatic = findPrimaryComposerSendButton(composerContext);
    if (automatic) return { button: automatic, source: "primary_composer_auto" };
    return null;
  }

  async function stageReportTextAndResolveSend(messageText, stageIdentity = null) {
    await loadSendButtonProfile();
    const composerContext = findPrimaryComposerContext();
    if (!isPrimaryComposerContextValid(composerContext)) {
      recordDiagnostic("REPORT_COMPOSER_REJECTED_NONPRIMARY", {
        ...composerContextDiagnostic(composerContext, "report_text_stage"),
        rejection_reason: "report_delivery_requires_primary_composer"
      });
      throw bridgeError("Не найдено подтверждённое нижнее поле ChatGPT для подготовки отчёта.", "PRIMARY_COMPOSER_MISSING");
    }

    const composer = composerContext.composer;
    const originalText = getComposerText(composer);
    const existingStage = readComposerBridgeStage(composer);
    const textMatchesCurrentReport = composerTextMatchesReport(originalText, messageText);
    const existingStageTextMatchesDom = Boolean(existingStage?.text_fingerprint) &&
      existingStage.text_fingerprint === localTextFingerprint(originalText);
    const existingStageMatchesCurrentReport = Boolean(existingStage && existingStageTextMatchesDom && textMatchesCurrentReport &&
      existingStage.run_id === (stageIdentity?.run_id || "") &&
      (!stageIdentity?.report_fingerprint || existingStage.report_fingerprint === stageIdentity.report_fingerprint));

    if (originalText && !textMatchesCurrentReport && !existingStageMatchesCurrentReport) {
      const rejectionReason = existingStage
        ? "primary_composer_contains_other_staged_bridge_report"
        : "primary_composer_contains_unverified_existing_text";
      recordDiagnostic(existingStage ? "REPORT_TEXT_STAGE_REJECTED_FOREIGN_BRIDGE_REPORT" : "REPORT_TEXT_STAGE_REJECTED_COMPOSER_OCCUPIED", {
        ...composerContextDiagnostic(composerContext, "report_text_stage"),
        rejection_reason: rejectionReason,
        staged_run_id: existingStage?.run_id || "",
        staged_delivery_id: existingStage?.delivery_id || ""
      });
      throw bridgeError(
        existingStage
          ? "В нижнем поле уже находится другой неподтверждённый отчёт Bridge. Он не будет заменён или отправлен вместо текущего отчёта."
          : "В нижнем поле уже находится нераспознанный неотправленный текст. Отчёт не перезаписывает его.",
        "PRIMARY_COMPOSER_OCCUPIED"
      );
    }

    const alreadyStaged = Boolean(originalText) && textMatchesCurrentReport;
    beginComposerInputGuard(composer);
    if (!alreadyStaged) {
      setComposerText(composer, messageText);
      await sleep(SEND_BUTTON_RENDER_WAIT_MS);
      recordDiagnostic("REPORT_TEXT_STAGED", {
        ...composerContextDiagnostic(composerContext, "report_text_stage"),
        event_source: "report_text_before_send_discovery"
      });
    } else {
      recordDiagnostic("REPORT_TEXT_STAGE_REUSED_CURRENT_BRIDGE_REPORT", {
        ...composerContextDiagnostic(composerContext, "report_text_stage"),
        event_source: existingStageMatchesCurrentReport ? "owned_bridge_stage" : "exact_report_text_match"
      });
    }
    assertComposerReportReadback(composer, messageText, "report_stage_readback");
    markComposerBridgeStage(composer, stageIdentity, messageText);

    if (!isPrimaryComposerContextValid(composerContext)) {
      throw bridgeError("Нижняя форма ChatGPT изменилась после подготовки отчёта.", "PRIMARY_COMPOSER_SCOPE_LOST");
    }
    const sendResolution = await waitForPrimaryComposerSendButton(composerContext);
    if (!sendResolution?.button) {
      // The report text intentionally remains in the verified primary composer.
      // ChatGPT creates its Send control only after text insertion, so clearing
      // it here would recreate the impossible pre-send wait cycle.
      recordDiagnostic("REPORT_SEND_BUTTON_MISSING", {
        ...composerContextDiagnostic(composerContext, "report_text_stage"),
        event_source: "post_report_text_stage",
        rejection_reason: "no_safe_send_button_after_report_text_stage"
      });
      throw bridgeError("Отчёт подготовлен в нижней форме ChatGPT, но безопасная Send-кнопка ещё не найдена. Текст сохранён; ожидаю DOM-событие Send.", "PRIMARY_COMPOSER_SEND_BUTTON_MISSING");
    }
    recordDiagnostic("REPORT_SEND_READY_AFTER_TEXT_STAGE", {
      ...composerContextDiagnostic(composerContext, "report_text_stage"),
      event_source: sendResolution.source
    });
    return {
      composer_context: composerContext,
      original_text: originalText,
      report_text_staged: true,
      stage_identity: stageIdentity || null
    };
  }

  async function loadSendButtonProfile() {
    const response = await request("GET_SEND_BUTTON_PROFILE_PRIVATE");
    sendButtonProfile = response.ok && response.data?.kind === MANUAL_PROFILE_KIND ? response.data : null;
    return sendButtonProfile;
  }

  function turnSections() {
    return Array.from(document.querySelectorAll('section[data-turn][data-turn-id], article[data-turn][data-turn-id]'));
  }

  function userTurnIds() {
    return new Set(
      turnSections()
        .filter((section) => section.getAttribute("data-turn") === "user")
        .map((section) => section.getAttribute("data-turn-id"))
        .filter(Boolean)
    );
  }

  function assistantTurnIds() {
    return new Set(
      turnSections()
        .filter((section) => section.getAttribute("data-turn") === "assistant")
        .map((section) => section.getAttribute("data-turn-id"))
        .filter(Boolean)
    );
  }

  function latestUserTurnId() {
    const users = turnSections().filter((section) => section.getAttribute("data-turn") === "user");
    return users.length ? (users[users.length - 1].getAttribute("data-turn-id") || null) : null;
  }

  // ChatGPT's visible message shell is not a public DOM API and may render a
  // user bubble before/without the legacy section[data-turn][data-turn-id]
  // attributes. Start acknowledgement therefore cannot depend on those private
  // attributes alone. This inventory is read-only and uses the same visible
  // public message body that the user sees. It deliberately does NOT replace
  // the strict anchored-turn machinery used after a stable turn id exists.
  function visibleUserMessageInventory() {
    const roots = [...document.querySelectorAll('[data-message-author-role="user"], [data-testid="user-message"]')];
    const out = [];
    const seenContainers = new Set();
    for (const root of roots) {
      if (!(root instanceof Element) || root.closest('form, [contenteditable="true"], [data-message-author-role="assistant"]')) continue;
      const container = root.closest('section[data-turn], article[data-turn], article, [data-testid*="conversation-turn" i], [data-testid*="message" i]') || root;
      if (seenContainers.has(container)) continue;
      seenContainers.add(container);
      if (!container.isConnected || publicMessageNodeHidden(container)) continue;
      let text = '';
      if (container.matches('section[data-turn], article[data-turn]')) text = sectionUserText(container);
      if (!text) text = readPublicMessageNode(root).trim();
      if (!text) continue;
      out.push({
        element: container,
        turn_id: container.getAttribute?.('data-turn-id') || '',
        text,
        canonical_text: canonicalComposerText(text),
        source: container.getAttribute?.('data-turn-id') ? 'stable_turn' : 'visible_role_fallback'
      });
    }
    return out;
  }

  function visibleUserMessageBaseline(outgoingText) {
    const canonical = canonicalComposerText(outgoingText || '');
    const inventory = visibleUserMessageInventory();
    return {
      total_count: inventory.length,
      exact_count: canonical ? inventory.filter(item => item.canonical_text === canonical).length : 0
    };
  }

  // v1.0.27: a sent message is a UI projection, not the composer buffer.
  // Read only its public rendered body, not expand/collapse/copy controls.
  // Collapsed (display:none) bodies are NOT scraped: the acknowledgement loop
  // may expand one exact local presentation control, then reads the visible body.
  const USER_BODY_SELECTOR = '[data-message-content], [data-testid="user-message"], .whitespace-pre-wrap';
  const USER_MESSAGE_CONTROL_SELECTOR = 'button, [role="button"], input, textarea, select, svg, script, style, nav, [role="toolbar"], [data-testid="user-message-actions"]';
  function publicMessageNodeHidden(node) {
    if (!(node instanceof Element)) return false;
    if (node.matches(USER_MESSAGE_CONTROL_SELECTOR) || node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" || node.classList.contains("sr-only")) return true;
    const style = getComputedStyle(node);
    return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0";
  }
  function readPublicMessageNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (!(node instanceof Element) || publicMessageNodeHidden(node)) return "";
    if (node.tagName === "BR") return "\n";
    let result = "", previousBlock = false;
    for (const child of node.childNodes) {
      const value = readPublicMessageNode(child);
      if (!value) continue;
      const block = COMPOSER_BLOCK_TAGS.has(child.nodeName);
      if (result && (block || previousBlock)) result += "\n";
      result += value;
      previousBlock = block;
    }
    return result;
  }
  function userBodyReadings(section) {
    const roles = [...section.querySelectorAll('[data-message-author-role="user"]')];
    const roots = [...section.querySelectorAll(USER_BODY_SELECTOR), ...roles];
    if (!roles.length) roots.push(section);
    const out = [], used = new Set();
    for (const root of roots) {
      if (root.closest('[data-message-author-role="assistant"]')) continue;
      let hidden = false;
      for (let node = root; node && node !== section.parentElement; node = node.parentElement) {
        if (publicMessageNodeHidden(node)) { hidden = true; break; }
      }
      if (hidden) continue;
      const text = readPublicMessageNode(root).trim();
      if (text && !used.has(text)) {
        used.add(text);
        out.push({ text, source: root.matches(USER_BODY_SELECTOR) ? "message_body" : "user_role_without_controls" });
      }
    }
    return out;
  }
  function sectionUserText(section) {
    return userBodyReadings(section).sort((a,b) => b.text.length-a.text.length)[0]?.text || "";
  }
  function expandPendingUserMessage(candidate, attempts, sendGeneration, expectedIdentity) {
    const section = candidate.section;
    if (!section?.isConnected || attempts.has(candidate.turn_id)) return false;
    const buttons = [...section.querySelectorAll('button, [role="button"]')].filter(button => {
      if (!asEnabledButton(button) || button.getAttribute("aria-expanded") === "true" || button.closest("form")) return false;
      // Presentation controls can share the pre-wrap wrapper with the body.
      // Exclude quoted code, links, editors and assistant surfaces, not that
      // layout wrapper. Exact label, pending user turn and local target remain
      // mandatory; full report equality is still required after expansion.
      if (button.closest('pre, code, a, [contenteditable="true"], [data-message-author-role="assistant"]')) return false;
      const label = String(button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g," ").trim().toLowerCase();
      if (!/^(?:развернуть(?:\s*свернуть)?|показать полностью|показать больше|expand(?:\s*collapse)?|show more|read more)$/.test(label)) return false;
      const controls = button.getAttribute("aria-controls");
      if (controls) {
        const target = document.getElementById(controls);
        if (!target || !section.contains(target)) return false;
      }
      return true;
    });
    if (buttons.length !== 1) return false;
    assertReportSendGeneration(sendGeneration);
    if (expectedIdentity) assertExpectedConversation(expectedIdentity, "BEFORE_MESSAGE_EXPAND");
    attempts.add(candidate.turn_id);
    buttons[0].click();
    recordDiagnostic("REPORT_MESSAGE_BODY_EXPAND_REQUESTED", { candidate_turn_id: candidate.turn_id, event_source: "user_message_local_presentation_only" });
    return true;
  }

  function legacyWritingBlockElement(section) {
    // Ordinary markdown/code blocks in current ChatGPT can use #code-block-viewer
    // and expose a local Copy button. They are not Avito Finder command forms.
    // Accept only explicit legacy Writing Block roots here; current Writing Blocks
    // are handled by currentWritingBlockBinding() via their Edit + Copy toolbar.
    return section?.querySelector?.('[data-writing-block], [data-writing-block-id]') || null;
  }

  function isCurrentWritingBlockEditButton(button) {
    const snapshot = buttonSnapshot(button);
    return snapshot.testid === "writing-block-header-magic-edit-button" ||
      /(?:^|\s)(?:редактировать|edit)(?:\s|$)/u.test(buttonToken(snapshot));
  }

  function isCurrentWritingBlockLocalCopyButton(button) {
    const snapshot = buttonSnapshot(button);
    // Never accept ChatGPT's generic assistant-turn action as the local
    // writing-block Copy control.
    if (snapshot.testid === "copy-turn-action-button" ||
        /копировать\s+ответ|copy\s+response/u.test(buttonToken(snapshot))) {
      return false;
    }
    return snapshot.aria === "Копировать" ||
      /(?:^|\s)(?:копировать|copy)(?:\s|$)/u.test(buttonToken(snapshot));
  }

  function cleanLocalWritingBlockText(root) {
    if (!(root instanceof Element)) return "";
    const clone = root.cloneNode(true);
    // Do not remove [aria-live]. Current ChatGPT may place the writing-block
    // body inside that element after completion. Remove controls only.
    clone.querySelectorAll("button, [role=button], svg, script, style").forEach((node) => node.remove());
    return String(clone.innerText || clone.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/^\s+|\s+$/g, "");
  }

  function currentWritingBlockBinding(section) {
    if (!(section instanceof Element)) return null;
    const buttons = Array.from(section.querySelectorAll("button"));
    const edits = buttons.filter(isCurrentWritingBlockEditButton);
    const copies = buttons.filter(isCurrentWritingBlockLocalCopyButton);

    for (const editButton of edits) {
      for (const copyButton of copies) {
        let root = copyButton.parentElement;
        while (root && root !== section) {
          if (root.contains(editButton) && root.contains(copyButton)) {
            const body = cleanLocalWritingBlockText(root);
            if (body.length > 0) {
              return {
                root,
                edit_button: editButton,
                copy_button: copyButton,
                source: "current_local_toolbar"
              };
            }
          }
          root = root.parentElement;
        }
      }
    }
    return null;
  }

  function resolveWritingBlockBinding(section) {
    const legacyRoot = legacyWritingBlockElement(section);
    if (legacyRoot instanceof Element) {
      const localCopy = Array.from(legacyRoot.querySelectorAll("button"))
        .find(isCurrentWritingBlockLocalCopyButton) || null;
      return {
        root: legacyRoot,
        edit_button: null,
        copy_button: localCopy,
        source: "legacy_explicit_root"
      };
    }
    return currentWritingBlockBinding(section);
  }

  function writingBlockElement(section) {
    return resolveWritingBlockBinding(section)?.root || null;
  }

  function sectionWritingBlockText(section, binding = null) {
    const resolved = binding || resolveWritingBlockBinding(section);
    if (!resolved?.root) return "";
    if (resolved.source === "current_local_toolbar") {
      return cleanLocalWritingBlockText(resolved.root);
    }
    // Preserve the proven legacy payload adapter verbatim for old explicit
    // writing-block roots.
    return (resolved.root.innerText || resolved.root.textContent || "")
      .replace(/^Редактировать\s*/u, "")
      .replace(/\s*Копировать(?:\s+ответ)?\s*$/u, "")
      .replace(/\s*Развернуть\s*$/u, "");
  }

  function writingBlockStructuralId(section) {
    const binding = resolveWritingBlockBinding(section);
    const block = binding?.root;
    if (!block) return "";
    return block.getAttribute("data-writing-block-id") ||
      block.getAttribute("data-writing-block") ||
      block.id ||
      binding?.source ||
      section.getAttribute("data-turn-id") ||
      "writing-block";
  }

  function writingBlockStructuralSignature(anchorTurnId, assistant, blockId, copy) {
    const controls = (copy?.buttons || []).map((button) => [
      button.tag || "", button.testid || "", button.aria || "", button.title || "", button.svg || "", button.enabled === true ? "1" : "0"
    ].join(":"));
    return [
      anchorTurnId || "",
      assistant?.getAttribute("data-turn-id") || "",
      blockId || "",
      copy?.writing_block === true ? "writing-block" : "no-writing-block",
      copy?.ready === true ? "copy-ready" : "copy-pending",
      copy?.mode || "",
      controls.join("|")
    ].join("||");
  }

  function buttonSnapshot(button) {
    const svgUse = button.querySelector("svg use");
    return {
      tag: button.tagName.toLowerCase(),
      testid: button.getAttribute("data-testid") || "",
      aria: button.getAttribute("aria-label") || "",
      title: button.getAttribute("title") || "",
      text: safeText(button),
      svg: svgUse?.getAttribute("href") || svgUse?.getAttribute("xlink:href") || "",
      enabled: !(button instanceof HTMLButtonElement && button.disabled) &&
        button.getAttribute("aria-disabled") !== "true"
    };
  }

  function buttonToken(snapshot) {
    return [snapshot.testid, snapshot.aria, snapshot.title, snapshot.text]
      .join(" ")
      .toLowerCase();
  }

  function detectCopyReadiness(section) {
    const buttons = Array.from(section?.querySelectorAll?.("button") || [])
      .map((button) => ({ button, snapshot: buttonSnapshot(button) }));
    const binding = resolveWritingBlockBinding(section);
    const localCopySnapshot = binding?.copy_button ? buttonSnapshot(binding.copy_button) : null;

    if (binding?.source === "current_local_toolbar" && localCopySnapshot) {
      return {
        ready: localCopySnapshot.enabled === true,
        mode: localCopySnapshot.enabled ? "current_writing_block_local_copy" : "current_writing_block_copy_disabled",
        writing_block: true,
        buttons: buttons.map((entry) => entry.snapshot)
      };
    }

    const allSemanticCopy = buttons.find((entry) => {
      const token = buttonToken(entry.snapshot);
      return entry.snapshot.testid === "copy-turn-action-button" ||
        token.includes("copy") ||
        token.includes("копир");
    });
    const allSpriteCopy = buttons.find((entry) => String(entry.snapshot.svg).includes("#ce3544"));
    const writingBlock = Boolean(binding?.root);

    if ((allSemanticCopy && !allSemanticCopy.snapshot.enabled) ||
        (allSpriteCopy && !allSpriteCopy.snapshot.enabled)) {
      return {
        ready: false,
        mode: "copy_control_disabled",
        writing_block: writingBlock,
        buttons: buttons.map((entry) => entry.snapshot)
      };
    }

    if (allSemanticCopy && allSemanticCopy.snapshot.enabled) {
      return {
        ready: true,
        mode: "semantic_copy_button",
        writing_block: writingBlock,
        buttons: buttons.map((entry) => entry.snapshot)
      };
    }

    if (allSpriteCopy && allSpriteCopy.snapshot.enabled) {
      return {
        ready: true,
        mode: "copy_svg_sprite",
        writing_block: writingBlock,
        buttons: buttons.map((entry) => entry.snapshot)
      };
    }

    return {
      ready: false,
      mode: buttons.length ? "copy_control_not_ready" : "no_controls_yet",
      writing_block: writingBlock,
      buttons: buttons.map((entry) => entry.snapshot)
    };
  }

  function confirmLocalWritingBlockCopyAndExtract(section) {
    const binding = resolveWritingBlockBinding(section);
    const text = sectionWritingBlockText(section, binding);
    const bytes = text ? new TextEncoder().encode(text).byteLength : 0;
    if (!text) {
      return { ok: false, error: "WRITING_BLOCK_LOCAL_BODY_UNAVAILABLE", text: "", bytes: 0 };
    }
    // The local Copy click verifies that the selected toolbar belongs to the
    // same local writing block. It never reads the system clipboard.
    if (binding?.source === "current_local_toolbar" && binding.copy_button instanceof HTMLElement) {
      const snapshot = buttonSnapshot(binding.copy_button);
      if (snapshot.enabled !== true) {
        return { ok: false, error: "WRITING_BLOCK_COPY_CONTROL_UNAVAILABLE", text: "", bytes: 0 };
      }
      try {
        if (!confirmedLocalWritingBlockCopyButtons.has(binding.copy_button)) {
          binding.copy_button.click();
          confirmedLocalWritingBlockCopyButtons.add(binding.copy_button);
        }
      } catch (error) {
        return { ok: false, error: `WRITING_BLOCK_COPY_CLICK_FAILED:${String(error?.message || error || "unknown")}`, text: "", bytes: 0 };
      }
    }
    return { ok: true, text, bytes, source: binding?.source || "legacy_explicit_root" };
  }

    function diagnosticDetails(code, candidate) {
    return {
      code,
      run_id: candidate?.run_id || activeRunId || "",
      conversation_id: candidate?.conversation_id || activeConversationId || "",
      chat_path: candidate?.chat_path || conversationIdentity().chat_path,
      anchor_turn_id: candidate?.anchor_turn_id || "",
      assistant_turn_id: candidate?.assistant_turn_id || "",
      expected_assistant_turn_id: candidate?.expected_assistant_turn_id || "",
      next_user_turn_id: candidate?.next_user_turn_id || "",
      manual_turn_index_after_anchor: Number.isInteger(candidate?.manual_turn_index_after_anchor) ? candidate.manual_turn_index_after_anchor : null,
      intervening_user_turn_count: Number.isInteger(candidate?.intervening_user_turn_count) ? candidate.intervening_user_turn_count : null,
      trace_id: candidate?.trace_id || "",
      anchor_mode: candidate?.anchor_mode || "",
      anchor_policy: candidate?.anchor_policy || "",
      anchor_selection: candidate?.anchor_selection || "",
      baseline_user_turn_count: Number.isInteger(candidate?.baseline_user_turn_count) ? candidate.baseline_user_turn_count : null,
      candidate_count: Number.isInteger(candidate?.candidate_count) ? candidate.candidate_count : null,
      candidate_turn_id: candidate?.candidate_turn_id || "",
      candidate_text_fingerprint: candidate?.candidate_text_fingerprint || "",
      candidate_text_length: Number.isInteger(candidate?.candidate_text_length) ? candidate.candidate_text_length : null,
      candidate_position: Number.isInteger(candidate?.candidate_position) ? candidate.candidate_position : null,
      copy_ready: candidate?.copy_ready === true,
      copy_mode: candidate?.copy_mode || "",
      writing_block: candidate?.writing_block === true,
      prompt_source: candidate?.prompt_source || "",
      copy_gate_confirmed: candidate?.copy_gate_confirmed === true,
      assistant_finality_confirmed: candidate?.assistant_finality_confirmed === true,
      rejection_reason: candidate?.rejection_reason || "",
      expected_status: candidate?.expected_status || "",
      actual_status: candidate?.actual_status || "",
      expected_owner_tab_id: Number.isInteger(candidate?.expected_owner_tab_id) ? candidate.expected_owner_tab_id : null,
      actual_sender_tab_id: Number.isInteger(candidate?.actual_sender_tab_id) ? candidate.actual_sender_tab_id : null,
      expected_chat_origin: candidate?.expected_chat_origin || "",
      actual_chat_origin: candidate?.actual_chat_origin || "",
      expected_conversation_id: candidate?.expected_conversation_id || "",
      actual_conversation_id: candidate?.actual_conversation_id || "",
      expected_anchor_turn_id: candidate?.expected_anchor_turn_id || "",
      actual_anchor_turn_id: candidate?.actual_anchor_turn_id || "",
      expected_chat_path: candidate?.expected_chat_path || "",
      actual_chat_path: candidate?.actual_chat_path || "",
      mismatch_fields: candidate?.mismatch_fields || "",
      tab_matches: candidate?.tab_matches === true,
      origin_matches: candidate?.origin_matches === true,
      conversation_matches: candidate?.conversation_matches === true,
      anchor_matches: candidate?.anchor_matches === true,
      paused: candidate?.paused === true,
      copy_ready: candidate?.copy_ready === true,
      copy_mode: candidate?.copy_mode || "",
      copy_gate_confirmed: candidate?.copy_gate_confirmed === true,
      assistant_finality_confirmed: candidate?.assistant_finality_confirmed === true,
      prompt_source: candidate?.prompt_source || "",
      writing_block: candidate?.writing_block === true,
      prompt_form_reason: candidate?.prompt_form_reason || "",
      writing_block_id: candidate?.writing_block_id || "",
      structural_signature: candidate?.structural_signature || "",
      button_count: Array.isArray(candidate?.button_snapshot) ? candidate.button_snapshot.length : 0,
      transition: candidate?.transition || "",
      delivery_id: candidate?.delivery_id || "",
      delivery_phase: candidate?.delivery_phase || "",
      event_source: candidate?.event_source || "",
      payload_extracted: candidate?.payload_extracted === true,
      payload_bytes: Number.isInteger(candidate?.payload_bytes) ? candidate.payload_bytes : 0,
      payload_extraction_error: candidate?.payload_extraction_error || "",
      response_kind: candidate?.response_kind || "",
      report_text_present: candidate?.report_text_present === true,
      report_fingerprint_present: candidate?.report_fingerprint_present === true,
      attachment_upload_required: candidate?.attachment_upload_required === true,
      composer_scope: candidate?.composer_scope || "",
      composer_anchor: candidate?.composer_anchor || "",
      embedded_editor_detected: candidate?.embedded_editor_detected === true,
      form_path: candidate?.form_path || "",

      content_script_version: candidate?.content_script_version ?? null,
      composer_codec: candidate?.composer_codec ?? null,
      expected_text_length: candidate?.expected_text_length ?? null,
      readback_text_length: candidate?.readback_text_length ?? null,
      expected_line_count: candidate?.expected_line_count ?? null,
      readback_line_count: candidate?.readback_line_count ?? null,
      expected_text_fingerprint: candidate?.expected_text_fingerprint ?? null,
      readback_text_fingerprint: candidate?.readback_text_fingerprint ?? null,
      raw_dom_text_length: candidate?.raw_dom_text_length ?? null,
      first_mismatch_index: candidate?.first_mismatch_index ?? null,
      user_input_observed: candidate?.user_input_observed ?? null,
      paragraph_count: candidate?.paragraph_count ?? null,
      break_count: candidate?.break_count ?? null,
      buttons: candidate?.button_snapshot || []
    };
  }

  function recordDiagnostic(code, candidate) {
    // No prompt body, report body, or token is recorded.
    // Avoid flooding the journal every 750 ms with identical streaming state.
    const signature = [
      code,
      candidate?.anchor_turn_id || "",
      candidate?.assistant_turn_id || "",
      candidate?.copy_mode || "",
      candidate?.copy_ready === true ? "ready" : "not_ready",
      candidate?.assistant_finality_confirmed === true ? "final" : "not_final",
      candidate?.structural_signature || "",
      candidate?.trace_id || "",
      candidate?.anchor_mode || "",
      candidate?.candidate_turn_id || "",
      candidate?.anchor_selection || "",
      candidate?.expected_assistant_turn_id || "",
      candidate?.next_user_turn_id || "",
      candidate?.manual_turn_index_after_anchor || "",
      candidate?.intervening_user_turn_count || "",
      candidate?.rejection_reason || ""
    ].join("|");
    const now = Date.now();
    if (signature === lastDiagnosticSignature && now - lastDiagnosticAt < 10000) return;
    lastDiagnosticSignature = signature;
    lastDiagnosticAt = now;
    request("RECORD_DIAGNOSTIC", { details: diagnosticDetails(code, candidate) });
  }

  function normalizedAnchorNeedle(outgoingText) {
    return String(outgoingText || "").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function anchorPolicyForMode(anchorMode) {
    return anchorMode === "document_delivery" ? "prefer_text_then_latest_new_user" : "full_text_only";
  }

  function newUserTurnCandidates(beforeIds) {
    return turnSections()
      .filter((section) =>
        section.getAttribute("data-turn") === "user" &&
        section.getAttribute("data-turn-id") &&
        !beforeIds.has(section.getAttribute("data-turn-id"))
      )
      .map((section, index) => {
        const readings = userBodyReadings(section);
        const text = readings.slice().sort((a,b) => b.text.length-a.text.length)[0]?.text || "";
        return {
          section, readings,
          turn_id: section.getAttribute("data-turn-id"),
          text,
          text_fingerprint: localTextFingerprint(text),
          text_length: canonicalComposerText(text).length,
          position: index + 1
        };
      });
  }

  function inspectNewUserAnchor(beforeIds, outgoingText, anchorMode = "plain_delivery") {
    const candidates = newUserTurnCandidates(beforeIds);
    const anchorText = value => String(value || "").replace(/\s+/g, " ").trim();
    const needle = anchorText(outgoingText);
    const matching = needle
      ? candidates.filter(candidate => candidate.readings.some(reading => anchorText(reading.text) === needle))
      : [];
    const exactMatch = matching.length === 1 ? matching[0] : null;
    const selected = exactMatch || (anchorMode === "document_delivery" ? candidates[candidates.length - 1] || null : null);
    const selection = exactMatch
      ? "text_match"
      : selected
        ? "latest_new_user_fallback"
        : matching.length > 1
          ? "multiple_exact_messages_ambiguous"
          : candidates.length
          ? "strict_text_required"
          : "no_new_user_turn";
    return {
      anchor_turn_id: selected?.turn_id || null,
      selected,
      candidates,
      anchor_mode: anchorMode,
      anchor_policy: anchorPolicyForMode(anchorMode),
      anchor_selection: selection,
      baseline_user_turn_count: beforeIds.size,
      candidate_count: candidates.length
    };
  }

  function findNewUserAnchor(beforeIds, outgoingText, anchorMode = "plain_delivery") {
    return inspectNewUserAnchor(beforeIds, outgoingText, anchorMode).anchor_turn_id;
  }

  function recordAnchorCandidateDiagnostics(scan, traceId, seenCandidateIds) {
    for (const candidate of scan.candidates) {
      const signature = `${candidate.turn_id}:${candidate.text_fingerprint}:${scan.anchor_turn_id || ""}`;
      if (seenCandidateIds.has(signature)) continue;
      seenCandidateIds.add(signature);
      const details = {
        trace_id: traceId,
        anchor_mode: scan.anchor_mode,
        anchor_policy: scan.anchor_policy,
        anchor_selection: candidate.turn_id === scan.anchor_turn_id ? scan.anchor_selection : "rejected",
        baseline_user_turn_count: scan.baseline_user_turn_count,
        candidate_count: scan.candidate_count,
        candidate_turn_id: candidate.turn_id,
        candidate_text_fingerprint: candidate.text_fingerprint,
        candidate_text_length: candidate.text_length,
        candidate_position: candidate.position
      };
      recordDiagnostic("REPORT_USER_TURN_CANDIDATE_SEEN", details);
      if (candidate.turn_id === scan.anchor_turn_id) {
        recordDiagnostic("REPORT_USER_TURN_CANDIDATE_ACCEPTED", details);
      } else {
        recordDiagnostic("REPORT_USER_TURN_CANDIDATE_REJECTED", {
          ...details,
          rejection_reason: !candidate.text_length ? "message_body_not_readable" : scan.anchor_selection === "multiple_exact_messages_ambiguous" ? "multiple_exact_messages_ambiguous" : "message_body_does_not_match_full_report"
        });
      }
    }
  }

  async function stageAutomationStartMessage(messageText) {
    const composerContext = findPrimaryComposerContext();
    if (!isPrimaryComposerContextValid(composerContext)) {
      recordDiagnostic("START_COMPOSER_REJECTED_NONPRIMARY", {
        ...composerContextDiagnostic(composerContext, "automation_start_send"),
        rejection_reason: "start_requires_primary_composer"
      });
      throw bridgeError("Не найдено подтверждённое нижнее поле ChatGPT для отправки «поехали».", "START_PRIMARY_COMPOSER_MISSING");
    }
    const currentText = getComposerText(composerContext.composer);
    beginComposerInputGuard(composerContext.composer);
    if (currentText && !composerTextMatchesReport(currentText, messageText)) {
      throw bridgeError("Нижнее поле ChatGPT содержит другой неотправленный текст; «Начать» не будет его перезаписывать.", "START_PRIMARY_COMPOSER_OCCUPIED");
    }
    if (!composerTextMatchesReport(currentText, messageText)) {
      setComposerText(composerContext.composer, messageText);
      await sleep(SEND_BUTTON_RENDER_WAIT_MS);
    }
    if (!isPrimaryComposerContextValid(composerContext)) {
      recordDiagnostic("START_COMPOSER_REJECTED_NONPRIMARY", {
        ...composerContextDiagnostic(composerContext, "automation_start_send"),
        rejection_reason: "composer_lost_primary_scope_after_start_stage"
      });
      throw bridgeError("Нижняя форма ChatGPT изменилась до отправки «поехали».", "START_PRIMARY_COMPOSER_SCOPE_LOST");
    }
    assertComposerReportReadback(composerContext.composer, messageText, "start_stage_readback");
    recordDiagnostic("START_MESSAGE_STAGED", {
      ...composerContextDiagnostic(composerContext, "automation_start_send")
    });
    return composerContext;
  }

  async function waitForNewUserAnchor(beforeIds, outgoingText, options = {}) {
    const anchorMode = options.anchor_mode || "plain_delivery";
    const timeoutMs = Number.isFinite(options.timeout_ms) ? options.timeout_ms : 20000;
    const traceId = options.trace_id || `${activeRunId || "no-run"}:${options.delivery_id || "no-delivery"}:${anchorMode}`;
    const deadline = Date.now() + timeoutMs;
    const seenCandidateIds = new Set();
    const expanded = options.expanded_candidates || new Set();
    const sendGeneration = reportSendGeneration;
    const expectedIdentity = activeConversationRef ? { ...activeConversationRef } : null;
    recordDiagnostic("REPORT_ANCHOR_BASELINE_CAPTURED", {
      trace_id: traceId,
      anchor_mode: anchorMode,
      anchor_policy: anchorPolicyForMode(anchorMode),
      baseline_user_turn_count: beforeIds.size,
      event_source: options.event_source || "anchor_wait"
    });
    let lastScan = inspectNewUserAnchor(beforeIds, outgoingText, anchorMode);
    while (Date.now() < deadline) {
      assertReportSendGeneration(sendGeneration);
      if (expectedIdentity) assertExpectedConversation(expectedIdentity, "DURING_REPORT_ACK");
      lastScan = inspectNewUserAnchor(beforeIds, outgoingText, anchorMode);
      recordAnchorCandidateDiagnostics(lastScan, traceId, seenCandidateIds);
      if (lastScan.anchor_turn_id) return lastScan.anchor_turn_id;
      // One presentation-only expansion per candidate, at most three candidates.
      // Never make another Send click or accept a placeholder by position.
      for (const candidate of lastScan.candidates.slice(-3)) {
        if (expanded.size < 3) expandPendingUserMessage(candidate, expanded, sendGeneration, expectedIdentity);
      }
      await sleep(100);
    }
    recordDiagnostic("REPORT_ANCHOR_TIMEOUT_SUMMARY", {
      trace_id: traceId,
      anchor_mode: anchorMode,
      anchor_policy: lastScan.anchor_policy,
      anchor_selection: lastScan.anchor_selection,
      baseline_user_turn_count: lastScan.baseline_user_turn_count,
      candidate_count: lastScan.candidate_count,
      event_source: options.event_source || "anchor_wait",
      rejection_reason: lastScan.candidate_count ? "no_candidate_accepted_before_timeout" : "no_new_user_turn_before_timeout"
    });
    return null;
  }

  function inspectStartReceipt(receipt, outgoingText) {
    const baselineUsers = new Set(Array.isArray(receipt?.baseline_user_turn_ids) ? receipt.baseline_user_turn_ids.filter(Boolean) : []);
    const baselineAssistants = new Set(Array.isArray(receipt?.baseline_assistant_turn_ids) ? receipt.baseline_assistant_turn_ids.filter(Boolean) : []);
    const previousAnchorTurnId = String(receipt?.previous_anchor_turn_id || "");
    const expectedCanonical = canonicalComposerText(outgoingText || "");
    const baselineVisibleCount = Number.isInteger(receipt?.baseline_visible_user_count) ? receipt.baseline_visible_user_count : null;
    const baselineVisibleExactCount = Number.isInteger(receipt?.baseline_visible_exact_user_count) ? receipt.baseline_visible_exact_user_count : null;

    // Preferred path: a stable new ChatGPT user turn id exists and its complete
    // visible body exactly matches the staged start command.
    const exact = inspectNewUserAnchor(baselineUsers, outgoingText, "start_exact");
    if (exact.anchor_turn_id) {
      return {
        confirmed: true,
        receipt_mode: "exact_user_turn",
        anchor_turn_id: exact.anchor_turn_id,
        expected_assistant_turn_id: null,
        anchor_scan: exact,
        new_assistant_turn_ids: [],
        visible_expected_user_present: true
      };
    }

    // Current ChatGPT can render the visible user bubble before/without the
    // private data-turn-id attribute. The screenshot/live failure that led to
    // v1.0.30 was exactly this class: the message was visibly present while the
    // strict turn-id scanner reported candidate_count=0. Compare the visible
    // message inventory against a baseline captured BEFORE the irreversible Send.
    const visibleUsers = visibleUserMessageInventory();
    const visibleExactCount = expectedCanonical ? visibleUsers.filter(item => item.canonical_text === expectedCanonical).length : 0;
    const visibleExpectedUserPresent = baselineVisibleExactCount !== null
      ? visibleExactCount > baselineVisibleExactCount
      : visibleExactCount > 0;
    const visibleUserGrowth = baselineVisibleCount !== null
      ? Math.max(0, visibleUsers.length - baselineVisibleCount)
      : 0;
    const unexpectedVisibleGrowth = visibleExpectedUserPresent
      ? Math.max(0, visibleUserGrowth - 1)
      : visibleUserGrowth;

    const allSections = Array.from(document.querySelectorAll('section[data-turn], article[data-turn]'));
    const previousIndex = previousAnchorTurnId
      ? allSections.findIndex(section => section.getAttribute("data-turn-id") === previousAnchorTurnId)
      : -1;
    const appended = previousIndex >= 0 ? allSections.slice(previousIndex + 1) : allSections;
    const unmatchedStableUsers = appended.filter(section => {
      if (section.getAttribute("data-turn") !== "user") return false;
      const id = section.getAttribute("data-turn-id") || "";
      if (id && baselineUsers.has(id)) return false;
      const readings = userBodyReadings(section);
      const normalized = readings.map(reading => canonicalComposerText(reading.text || ""));
      return !normalized.includes(expectedCanonical);
    });
    const newAssistants = allSections.filter(section => {
      if (section.getAttribute("data-turn") !== "assistant") return false;
      const id = section.getAttribute("data-turn-id") || "";
      return Boolean(id) && !baselineAssistants.has(id);
    });
    const uniqueAssistantIds = [...new Set(newAssistants.map(section => section.getAttribute("data-turn-id")).filter(Boolean))];

    // Once the exact visible start bubble is present, one new assistant turn is
    // sufficient to bind the response to the durable pre-Send receipt even if
    // the user bubble never acquired a private turn id. We intentionally bind
    // to the previous stable user anchor + exact assistant id; prompt polling
    // already supports that recovery form and rejects later manual interruptions.
    if (previousAnchorTurnId && previousIndex >= 0 && unexpectedVisibleGrowth === 0 && unmatchedStableUsers.length === 0 && uniqueAssistantIds.length === 1 && (visibleExpectedUserPresent || visibleUserGrowth === 0)) {
      return {
        confirmed: true,
        receipt_mode: visibleExpectedUserPresent ? "visible_user_plus_assistant_fallback" : "assistant_turn_fallback",
        anchor_turn_id: previousAnchorTurnId,
        expected_assistant_turn_id: uniqueAssistantIds[0],
        anchor_scan: exact,
        new_assistant_turn_ids: uniqueAssistantIds,
        visible_expected_user_present: visibleExpectedUserPresent,
        visible_user_count: visibleUsers.length,
        visible_exact_user_count: visibleExactCount
      };
    }

    // If a new assistant is already present but the user bubble is temporarily
    // not discoverable, keep the receipt pending rather than claiming failure.
    // A later reconciliation can confirm once either the exact bubble or stable
    // turn id materializes. Multiple assistants or additional user messages are
    // ambiguous and must never be auto-accepted.
    const conflict = unmatchedStableUsers.length > 0 || unexpectedVisibleGrowth > 0;
    return {
      confirmed: false,
      receipt_mode: uniqueAssistantIds.length > 1
        ? "ambiguous_new_assistants"
        : conflict
          ? "intervening_user_turn"
          : visibleExpectedUserPresent
            ? "visible_expected_user_waiting_assistant"
            : uniqueAssistantIds.length === 1
              ? "assistant_present_waiting_visible_user"
              : "pending",
      anchor_turn_id: null,
      expected_assistant_turn_id: null,
      anchor_scan: exact,
      new_assistant_turn_ids: uniqueAssistantIds,
      unmatched_user_turn_count: unmatchedStableUsers.length,
      visible_user_growth: visibleUserGrowth,
      unexpected_visible_user_growth: unexpectedVisibleGrowth,
      visible_expected_user_present: visibleExpectedUserPresent,
      visible_user_count: visibleUsers.length,
      visible_exact_user_count: visibleExactCount
    };
  }

  async function waitForStartReceipt(receipt, outgoingText, options = {}) {
    const timeoutMs = Number.isFinite(options.timeout_ms) ? options.timeout_ms : 20000;
    const deadline = Date.now() + timeoutMs;
    const sendGeneration = reportSendGeneration;
    const expectedIdentity = activeConversationRef ? { ...activeConversationRef } : null;
    const expanded = new Set();
    const seenCandidateIds = new Set();
    const traceId = `${activeRunId || "no-run"}:start-receipt`;
    let last = inspectStartReceipt(receipt, outgoingText);
    while (Date.now() < deadline) {
      assertReportSendGeneration(sendGeneration);
      if (expectedIdentity) assertExpectedConversation(expectedIdentity, "DURING_START_ACK");
      last = inspectStartReceipt(receipt, outgoingText);
      if (last.anchor_scan) recordAnchorCandidateDiagnostics(last.anchor_scan, traceId, seenCandidateIds);
      if (last.confirmed) {
        recordDiagnostic("START_SEND_RECEIPT_CONFIRMED", {
          anchor_turn_id: last.anchor_turn_id || "",
          expected_assistant_turn_id: last.expected_assistant_turn_id || "",
          anchor_selection: last.receipt_mode,
          baseline_user_turn_count: Array.isArray(receipt?.baseline_user_turn_ids) ? receipt.baseline_user_turn_ids.length : 0,
          candidate_count: last.new_assistant_turn_ids?.length || 0,
          event_source: options.event_source || "start_delivery"
        });
        return last;
      }
      // ChatGPT may render a just-sent user turn collapsed. Expansion is a
      // presentation-only action scoped to the new candidate; it never sends
      // another message and is fenced by the current send generation/chat.
      for (const candidate of (last.anchor_scan?.candidates || []).slice(-3)) {
        if (expanded.size < 3) expandPendingUserMessage(candidate, expanded, sendGeneration, expectedIdentity);
      }
      await sleep(100);
    }
    recordDiagnostic("START_SEND_RECEIPT_UNCONFIRMED", {
      anchor_selection: last.receipt_mode || "pending",
      baseline_user_turn_count: Array.isArray(receipt?.baseline_user_turn_ids) ? receipt.baseline_user_turn_ids.length : 0,
      candidate_count: last.new_assistant_turn_ids?.length || 0,
      rejection_reason: last.receipt_mode || "pending",
      event_source: options.event_source || "start_delivery"
    });
    return last;
  }

  function inspectExistingUserAnchorAfter(previousAnchorTurnId, outgoingText, anchorMode = "plain_recovery") {
    const sections = turnSections();
    const index = sections.findIndex((section) => section.getAttribute("data-turn-id") === previousAnchorTurnId);
    if (index < 0 && anchorMode === "plain_recovery") return { anchor_turn_id: null, candidates: [], anchor_mode: anchorMode, anchor_policy: "full_text_only", anchor_selection: "previous_anchor_missing", candidate_count: 0, baseline_user_turn_count: 0 };
    const start = index >= 0 ? index + 1 : 0;
    const beforeIds = new Set(sections.slice(0, start)
      .filter((section) => section.getAttribute("data-turn") === "user")
      .map((section) => section.getAttribute("data-turn-id"))
      .filter(Boolean));
    return inspectNewUserAnchor(beforeIds, outgoingText, anchorMode);
  }

  function findExistingUserAnchorAfter(previousAnchorTurnId, outgoingText, anchorMode = "plain_recovery") {
    return inspectExistingUserAnchorAfter(previousAnchorTurnId, outgoingText, anchorMode).anchor_turn_id;
  }

  function assistantCandidateAfterAnchor(anchorTurnId, expectedAssistantTurnId = null) {
    const sections = turnSections();
    const index = sections.findIndex((section) => section.getAttribute("data-turn-id") === anchorTurnId);
    if (index < 0) return { missing_anchor: true };

    // Copy-payload recovery is intentionally different from ordinary prompt
    // polling. It is permitted only when the worker supplied the precise
    // assistant turn captured before the paused Copy attempt. User turns that
    // appeared after the original anchor are evidence for the journal, not a
    // new anchor and not a new manual-interruption decision.
    if (expectedAssistantTurnId) {
      const interveningUserTurnIds = [];
      let expectedAssistant = null;
      for (let i = index + 1; i < sections.length; i += 1) {
        const section = sections[i];
        const turnType = section.getAttribute("data-turn");
        const turnId = section.getAttribute("data-turn-id") || "";
        if (turnType === "user" && turnId) interveningUserTurnIds.push(turnId);
        if (turnType === "assistant" && turnId === expectedAssistantTurnId) {
          expectedAssistant = section;
          break;
        }
      }
      if (!expectedAssistant) {
        return {
          waiting: true,
          expected_assistant_turn_id: expectedAssistantTurnId,
          intervening_user_turn_ids: interveningUserTurnIds,
          intervening_user_turn_count: interveningUserTurnIds.length
        };
      }

      const copy = detectCopyReadiness(expectedAssistant);
      const structuralBlockId = writingBlockStructuralId(expectedAssistant);
      const promptText = copy.writing_block ? sectionWritingBlockText(expectedAssistant) : "";
      const payloadExtracted = copy.writing_block === true && typeof promptText === "string" && promptText.length > 0;
      const payloadBytes = payloadExtracted ? new TextEncoder().encode(promptText).byteLength : 0;
      const structuralSignature = writingBlockStructuralSignature(anchorTurnId, expectedAssistant, structuralBlockId, copy);
      return {
        anchor_turn_id: anchorTurnId,
        assistant_turn_id: expectedAssistantTurnId,
        expected_assistant_turn_id: expectedAssistantTurnId,
        // Safe diagnostics only: turn IDs and count, no user text.
        intervening_user_turn_ids: interveningUserTurnIds,
        intervening_user_turn_count: interveningUserTurnIds.length,
        prompt_text: promptText,
        payload_extracted: payloadExtracted,
        payload_bytes: payloadBytes,
        payload_extraction_error: payloadExtracted ? "" : (copy.writing_block ? "writing_block_body_not_available" : "writing_block_missing"),
        copy_ready: copy.ready,
        copy_mode: copy.mode,
        writing_block: copy.writing_block,
        prompt_form_reason: copy.writing_block ? "writing_block_present" : "writing_block_missing",
        writing_block_id: structuralBlockId,
        button_snapshot: copy.buttons,
        structural_signature: structuralSignature
      };
    }

    const assistants = [];
    for (let i = index + 1; i < sections.length; i += 1) {
      const section = sections[i];
      const turnType = section.getAttribute("data-turn");
      if (turnType === "user") {
        return {
          manual_interruption: true,
          next_user_turn_id: section.getAttribute("data-turn-id"),
          manual_turn_index_after_anchor: i - index
        };
      }
      if (turnType === "assistant") assistants.push(section);
    }

    const assistant = assistants[assistants.length - 1];
    if (!assistant) return { waiting: true };

    const copy = detectCopyReadiness(assistant);
    const structuralBlockId = writingBlockStructuralId(assistant);
    // The writing-block body is transferred as the task payload only after local
    // state accepts this DOM candidate. Its text never affects readiness,
    // stability, authorization, duplication or continuation.
    const promptText = copy.writing_block ? sectionWritingBlockText(assistant) : "";
    const payloadExtracted = copy.writing_block === true && typeof promptText === "string" && promptText.length > 0;
    const payloadBytes = payloadExtracted ? new TextEncoder().encode(promptText).byteLength : 0;
    const structuralSignature = writingBlockStructuralSignature(anchorTurnId, assistant, structuralBlockId, copy);

    return {
      anchor_turn_id: anchorTurnId,
      assistant_turn_id: assistant.getAttribute("data-turn-id"),
      prompt_text: promptText,
      payload_extracted: payloadExtracted,
      payload_bytes: payloadBytes,
      payload_extraction_error: payloadExtracted ? "" : (copy.writing_block ? "writing_block_body_not_available" : "writing_block_missing"),
      copy_ready: copy.ready,
      copy_mode: copy.mode,
      writing_block: copy.writing_block,
      prompt_form_reason: copy.writing_block ? "writing_block_present" : "writing_block_missing",
      writing_block_id: structuralBlockId,
      button_snapshot: copy.buttons,
      structural_signature: structuralSignature
    };
  }

  async function waitUntilTextLeavesComposer(composer, originalText, sentText, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const current = getComposerText(composer);
      if (!current.includes(sentText) && (current === originalText || current.trim() === "")) return true;
      await sleep(100);
    }
    return false;
  }

  function bridgeError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function base64ToUint8Array(base64) {
    const binary = atob(String(base64 || ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function findAttachmentInput(composerContext) {
    if (!isPrimaryComposerContextValid(composerContext)) return null;
    const scoped = [...composerContext.form.querySelectorAll('input[type="file"]')]
      .filter((input) => input instanceof HTMLInputElement && !input.disabled && !isInsideAssistantOrWritingBlock(input));
    if (!scoped.length) {
      recordDiagnostic("ATTACHMENT_INPUT_REJECTED_NONCOMPOSER", {
        event_source: "composer_form_only",
        rejection_reason: "no_file_input_in_bound_composer_form"
      });
    }
    return scoped[0] || null;
  }

  async function attachReportFileToComposer(attachment, { onInputChanged = null } = {}) {
    if (!attachment?.base64 || !attachment?.display_name) throw bridgeError("Bridge extension не получил файл контекста для этой доставки.", "ATTACHMENT_TRANSFER_MISSING");
    const embeddedEditors = visibleEmbeddedAssistantEditors();
    if (embeddedEditors.length) {
      recordDiagnostic("ATTACHMENT_EMBEDDED_EDITOR_GUARD", {
        event_source: "report_delivery",
        rejection_reason: "visible_embedded_assistant_editor",
        embedded_editor_detected: true
      });
      throw bridgeError("Открыт редактор assistant writing block. Файл не будет прикреплён к нему; отчёт отправится без файла.", "ATTACHMENT_EMBEDDED_EDITOR_ACTIVE");
    }
    const composerContext = findPrimaryComposerContext();
    if (!composerContext || !isPrimaryComposerContextValid(composerContext)) {
      throw bridgeError("Не найдено подтверждённое нижнее поле ChatGPT для прикрепления файла.", "PRIMARY_COMPOSER_MISSING");
    }
    recordDiagnostic("ATTACHMENT_COMPOSER_BOUND", composerContextDiagnostic(composerContext, "composer_form_only"));
    const input = findAttachmentInput(composerContext);
    if (!input || !composerContext.form.contains(input) || isEmbeddedAssistantEditor(input.closest("form"))) {
      recordDiagnostic("ATTACHMENT_INPUT_REJECTED_NONCOMPOSER", {
        ...composerContextDiagnostic(composerContext, "composer_form_only"),
        rejection_reason: "file_input_not_in_primary_composer_form"
      });
      throw bridgeError("В нижней форме ChatGPT нет подтверждённого поля загрузки файла.", "ATTACHMENT_INPUT_NOT_IN_PRIMARY_COMPOSER");
    }
    recordDiagnostic("ATTACHMENT_UPLOAD_STARTED", composerContextDiagnostic(composerContext, "composer_form_only"));
    const dataTransfer = new DataTransfer();
    const file = new File([base64ToUint8Array(attachment.base64)], attachment.display_name, { type: attachment.mime_type || "application/octet-stream" });
    dataTransfer.items.add(file);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files");
    if (!descriptor?.set) throw bridgeError("Браузер не разрешил прикрепить файл к ChatGPT.", "ATTACHMENT_FILES_SETTER_MISSING");
    descriptor.set.call(input, dataTransfer.files);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    recordDiagnostic("ATTACHMENT_INPUT_CHANGED", composerContextDiagnostic(composerContext, "composer_form_only"));

    // Hard boundary: after the extension's own input/change it neither reads,
    // validates, removes, tracks nor otherwise touches the attachment/card/file.
    // It persists the one-time boundary and returns to the caller, which may
    // start the document-only Send retry. No DOM attachment observation follows.
    if (typeof onInputChanged === "function") {
      try {
        await onInputChanged();
      } catch (error) {
        recordDiagnostic("ATTACHMENT_INPUT_CHANGED_PERSIST_UNCONFIRMED", {
          ...composerContextDiagnostic(composerContext, "composer_form_only"),
          rejection_reason: error?.message || "attachment_input_changed_state_not_acknowledged"
        });
      }
    }
    return { input_changed: true, display_name: attachment.display_name, composer_context: composerContext };
  }

  async function sendMessageAndCaptureAnchor(messageText, beforeClick = null, boundComposerContext = null, deliveryPreparation = null) {
    const sendGeneration = reportSendGeneration;
    const expectedSendConversation = activeConversationRef ? { ...activeConversationRef } : null;
    assertReportSendGeneration(sendGeneration);
    const composerContext = boundComposerContext || findPrimaryComposerContext();
    if (!isPrimaryComposerContextValid(composerContext)) {
      recordDiagnostic("REPORT_COMPOSER_REJECTED_NONPRIMARY", {
        ...composerContextDiagnostic(composerContext, "report_delivery"),
        rejection_reason: "report_delivery_requires_primary_composer"
      });
      throw bridgeError("Не найдено подтверждённое нижнее поле ChatGPT. Отчёт будет безопасно повторён позже.", "PRIMARY_COMPOSER_MISSING");
    }
    const composer = composerContext.composer;
    recordDiagnostic("REPORT_PRIMARY_COMPOSER_BOUND", composerContextDiagnostic(composerContext, "report_delivery"));

    await loadSendButtonProfile();

    assertReportSendGeneration(sendGeneration);
    const originalText = typeof deliveryPreparation?.original_text === "string"
      ? deliveryPreparation.original_text
      : getComposerText(composer);
    const beforeIds = userTurnIds();
    const beforeAssistantIds = assistantTurnIds();
    const previousUserAnchorTurnId = latestUserTurnId();
    const visibleUserBaseline = visibleUserMessageBaseline(messageText);
    const currentComposerText = getComposerText(composer);
    const stagedIdentity = deliveryPreparation?.stage_identity || null;
    if (!boundComposerContext) beginComposerInputGuard(composer);
    const textAlreadyStaged = composerTextMatchesReport(currentComposerText, messageText);
    if (!textAlreadyStaged) {
      if (currentComposerText) {
        throw bridgeError("Нижнее поле ChatGPT содержит другой неотправленный текст; отчёт не будет его перезаписывать.", "PRIMARY_COMPOSER_OCCUPIED");
      }
      setComposerText(composer, messageText);
      markComposerBridgeStage(composer, stagedIdentity, messageText);
      await sleep(SEND_BUTTON_RENDER_WAIT_MS);
    }

    if (!isPrimaryComposerContextValid(composerContext)) {
      recordDiagnostic("REPORT_COMPOSER_REJECTED_NONPRIMARY", {
        ...composerContextDiagnostic(composerContext, "report_delivery"),
        rejection_reason: "composer_lost_primary_scope_before_send"
      });
      throw bridgeError("Нижняя форма ChatGPT изменилась до отправки. Отчёт не отправлен в assistant editor и будет безопасно повторён позже.", "PRIMARY_COMPOSER_SCOPE_LOST");
    }
    const sendResolution = await waitForPrimaryComposerSendButton(composerContext);
    if (!sendResolution?.button) {
      // Preserve the staged report AND any intervening user draft. Never clear
      // a composer merely because its Send button is temporarily unavailable.
      recordDiagnostic("REPORT_SEND_BUTTON_MISSING", {
        ...composerContextDiagnostic(composerContext, "report_delivery"),
        event_source: deliveryPreparation?.report_text_staged === true ? "post_report_text_stage" : "report_delivery",
        rejection_reason: "no_safe_send_button_in_primary_composer"
      });
      throw bridgeError(
        deliveryPreparation?.report_text_staged === true
          ? "Отчёт уже находится в нижней форме ChatGPT, но безопасная Send-кнопка ещё не найдена. Ожидаю DOM-событие Send."
          : "В нижней форме ChatGPT не найдена безопасная кнопка отправки. Ничего не нажимал; отчёт будет безопасно повторён позже.",
        "PRIMARY_COMPOSER_SEND_BUTTON_MISSING"
      );
    }
    recordDiagnostic(
      sendResolution.source === "manual_profile_semantic_fallback" ? "REPORT_SEND_BUTTON_MANUAL_BOUND" : "REPORT_SEND_BUTTON_AUTO_BOUND",
      { ...composerContextDiagnostic(composerContext, "report_delivery"), event_source: sendResolution.source }
    );

    // Commit immediately before the irreversible click. A click whose DOM result
    // is delayed or invisible is an uncertain send, never a pre-send retry case.
    if (!sendResolution.button.isConnected || !isVisible(sendResolution.button)) {
      throw bridgeError("Кнопка отправки исчезла до клика. Отчёт не отправлен и ждёт только нового DOM-события Send.", "SEND_BUTTON_DISCONNECTED");
    }
    assertReportSendGeneration(sendGeneration);
    if (expectedSendConversation) assertExpectedConversation(expectedSendConversation, "BEFORE_SEND_CLICK");
    assertComposerReportReadback(composer, messageText, "before_send_commit");
    if (typeof beforeClick === "function") await beforeClick({
      baseline_user_turn_ids: [...beforeIds],
      baseline_assistant_turn_ids: [...beforeAssistantIds],
      baseline_visible_user_count: visibleUserBaseline.total_count,
      baseline_visible_exact_user_count: visibleUserBaseline.exact_count,
      previous_anchor_turn_id: currentAnchorTurnId || previousUserAnchorTurnId || null
    });
    assertReportSendGeneration(sendGeneration);
    if (expectedSendConversation) assertExpectedConversation(expectedSendConversation, "AT_SEND_CLICK");
    if (!isPrimaryComposerContextValid(composerContext) || !sendResolution.button.isConnected || !isVisible(sendResolution.button) || sendResolution.button.disabled || sendResolution.button.getAttribute("aria-disabled") === "true") {
      throw bridgeError("Форма или кнопка изменились до клика. Ничего не отправлено.", "PRIMARY_COMPOSER_SCOPE_LOST");
    }
    assertComposerReportReadback(composer, messageText, "at_send_click");
    recordDiagnostic("REPORT_SEND_CLICK_ATTEMPT", {
      ...composerContextDiagnostic(composerContext, "report_delivery"),
      event_source: sendResolution.source
    });
    if (typeof deliveryPreparation?.on_send_click === "function") deliveryPreparation.on_send_click();
    sendResolution.button.click();
    recordDiagnostic("REPORT_SEND_CLICKED", {
      ...composerContextDiagnostic(composerContext, "report_delivery"),
      event_source: sendResolution.source
    });
    const sent = await waitUntilTextLeavesComposer(composer, originalText, messageText);
    if (!sent) {
      recordDiagnostic("REPORT_SEND_NOT_CONFIRMED", {
        ...composerContextDiagnostic(composerContext, "report_delivery"),
        rejection_reason: "composer_text_not_cleared_after_click"
      });
      throw bridgeError("Кнопка была нажата, но результат клика не подтвердился. Повторный клик запрещён; выполняю только reconciliation user-turn.", "COMPOSER_NOT_CLEARED");
    }
    composerInputGuards.get(composer)?.dispose();
    composerInputGuards.delete(composer);
    clearComposerBridgeStage(composer);
    recordDiagnostic("REPORT_SEND_COMPOSER_CLEARED", {
      ...composerContextDiagnostic(composerContext, "report_delivery"),
      event_source: sendResolution.source
    });

    const anchorMode = deliveryPreparation?.anchor_mode || "plain_delivery";
    if (anchorMode === "start_exact") {
      const startReceipt = await waitForStartReceipt({
        baseline_user_turn_ids: [...beforeIds],
        baseline_assistant_turn_ids: [...beforeAssistantIds],
        baseline_visible_user_count: visibleUserBaseline.total_count,
        baseline_visible_exact_user_count: visibleUserBaseline.exact_count,
        previous_anchor_turn_id: previousUserAnchorTurnId || null
      }, messageText, { event_source: "start_delivery" });
      if (!startReceipt.confirmed || !startReceipt.anchor_turn_id) {
        throw bridgeError(
          "Send нажат; стартовый user-turn ещё не подтверждён. Повторный Send запрещён; выполняется только сверка уже сделанной отправки.",
          "MESSAGE_SENT_ANCHOR_UNCONFIRMED"
        );
      }
      currentAnchorTurnId = startReceipt.anchor_turn_id;
      candidateFirstSeen = null;
      return {
        anchor_turn_id: startReceipt.anchor_turn_id,
        expected_assistant_turn_id: startReceipt.expected_assistant_turn_id || null,
        start_receipt_mode: startReceipt.receipt_mode,
        identity: conversationIdentity(),
        chat_path: conversationIdentity().chat_path
      };
    }

    const anchorTurnId = await waitForNewUserAnchor(beforeIds, messageText, {
      anchor_mode: anchorMode,
      trace_id: `${activeRunId || "no-run"}:${deliveryPreparation?.stage_identity?.delivery_id || "no-delivery"}:plain`,
      delivery_id: deliveryPreparation?.stage_identity?.delivery_id || "",
      event_source: "report_delivery"
    });
    if (!anchorTurnId) {
      recordDiagnostic("REPORT_USER_ANCHOR_NOT_FOUND", {
        event_source: "report_delivery",
        anchor_mode: anchorMode,
        anchor_policy: anchorPolicyForMode(anchorMode)
      });
      throw bridgeError(
        "Send нажат; полный текст отправленного сообщения пока не подтверждён. Отчёт сохранён, выполняется только сверка без повторной отправки.",
        "MESSAGE_SENT_ANCHOR_UNCONFIRMED"
      );
    }

    recordDiagnostic("REPORT_USER_ANCHOR_FOUND", { anchor_turn_id: anchorTurnId, event_source: "report_delivery" });
    currentAnchorTurnId = anchorTurnId;
    candidateFirstSeen = null;
    return { anchor_turn_id: anchorTurnId, identity: conversationIdentity(), chat_path: conversationIdentity().chat_path };
  }

  function isCurrentPromptPollGeneration(generation) {
    return generation === promptPollGeneration;
  }

  function stopPromptPolling(expectedGeneration = null) {
    if (Number.isInteger(expectedGeneration) && !isCurrentPromptPollGeneration(expectedGeneration)) return false;
    // Invalidate all callbacks that belonged to the prior wait before clearing
    // timers. A newer wait may only be stopped by its own generation or an
    // explicit stop/restart call.
    promptPollGeneration += 1;
    
    if (promptPollTimer) clearInterval(promptPollTimer);
    if (promptStabilityTimer) clearTimeout(promptStabilityTimer);
    if (promptFastTimer) clearTimeout(promptFastTimer);
    if (promptMutationTimer) clearTimeout(promptMutationTimer);
    if (promptObserver) promptObserver.disconnect();
    promptPollTimer = null;
    promptStabilityTimer = null;
    promptFastTimer = null;
    promptMutationTimer = null;
    promptObserver = null;
    promptPollBoundAnchorTurnId = null;
    candidateFirstSeen = null;
    currentExpectedAssistantTurnId = null;
    return true;
  }

  function schedulePromptCheck(delayMs = 0, forceStableCheck = false, generation = promptPollGeneration) {
    if (!isCurrentPromptPollGeneration(generation)) return;
    if (promptFastTimer) clearTimeout(promptFastTimer);
    promptFastTimer = setTimeout(() => {
      if (!isCurrentPromptPollGeneration(generation)) return;
      promptFastTimer = null;
      promptTick(forceStableCheck, generation);
    }, delayMs);
  }

  // The completion gate gets its own timer. ChatGPT can keep mutating unrelated
  // assistant controls while a writing block is already complete; those mutations
  // may request a fast rescan but must never cancel the two-second local-block
  // stability deadline.
  function schedulePromptStabilityCheck(delayMs = PROMPT_STABILITY_MS, generation = promptPollGeneration) {
    if (!isCurrentPromptPollGeneration(generation)) return;
    if (promptStabilityTimer) clearTimeout(promptStabilityTimer);
    promptStabilityTimer = setTimeout(() => {
      if (!isCurrentPromptPollGeneration(generation)) return;
      promptStabilityTimer = null;
      promptTick(true, generation);
    }, Math.max(0, Number(delayMs) || 0));
  }

  function startPromptObserver(generation = promptPollGeneration) {
    if (!isCurrentPromptPollGeneration(generation)) return;
    if (promptObserver) promptObserver.disconnect();
    const target = document.querySelector("main") || document.body;
    if (!target) return;

    promptObserver = new MutationObserver(() => {
      if (!isCurrentPromptPollGeneration(generation) || !currentAnchorTurnId || promptMutationTimer) return;
      promptMutationTimer = setTimeout(() => {
        if (!isCurrentPromptPollGeneration(generation)) return;
        promptMutationTimer = null;
        schedulePromptCheck(0, false, generation);
      }, PROMPT_MUTATION_DEBOUNCE_MS);
    });

    promptObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled", "class", "data-testid", "aria-label", "title"]
    });
  }

  function reportPromptActivity(candidate, phase) {
    const signature = [activeRunId || "", currentAnchorTurnId || "", candidate?.assistant_turn_id || "", phase || ""].join("|");
    const now = Date.now();
    if (signature === lastPromptActivitySignature && now - lastPromptActivityAt < 1500) return;
    lastPromptActivitySignature = signature;
    lastPromptActivityAt = now;
    // Telemetry is never allowed to own the capture state machine. A missing
    // service-worker callback previously left promptTickInFlight true after the
    // writing block was visibly ready, so local Copy was never reached.
    void request("AUTOMATION_PROMPT_ACTIVITY", {
      run_id: activeRunId,
      origin: conversationIdentity().origin,
      conversation_id: activeConversationId,
      chat_path: conversationIdentity().chat_path,
      anchor_turn_id: currentAnchorTurnId,
      assistant_turn_id: candidate?.assistant_turn_id || null,
      phase
    }, ACTIVITY_REQUEST_TIMEOUT_MS);
  }

  function candidateHasReadyAssistantTurnCopy(candidate) {
    return Array.isArray(candidate?.button_snapshot) && candidate.button_snapshot.some((snapshot) =>
      snapshot?.testid === "copy-turn-action-button" && snapshot?.enabled === true
    );
  }

  async function promptTick(forceStableCheck = false, generation = promptPollGeneration) {
    if (!isCurrentPromptPollGeneration(generation) || !contentRuntimeIsCurrent() || !currentAnchorTurnId || promptTickInFlight) return;
    // A report sender can record a newer user-turn before the Worker explicitly
    // starts the next poll. The existing generation does not own that new anchor
    // and must neither scan it nor stop itself; startPromptPolling will replace it.
    if (promptPollBoundAnchorTurnId !== currentAnchorTurnId) return;
    // Strict pinned-dialog boundary: never scan/Copy in another ChatGPT route. The Worker now treats this as a recoverable pause and resumes only after the exact pinned conversation returns.
    if (activeConversationRef && !sameConversationReference(activeConversationRef)) {
      await reportConversationContextBlocked("DURING_PROMPT_POLL", activeConversationRef);
      showStatus("Avito Finder: ChatGPT ушёл из закреплённого диалога. Автоматизация на безопасной паузе и продолжится сама после возврата в этот же чат.", "warning");
      stopPromptPolling(generation);
      return;
    }
    promptTickInFlight = true;

    try {
      const raw = assistantCandidateAfterAnchor(currentAnchorTurnId, currentExpectedAssistantTurnId);
      const candidate = Object.assign(
        { ...conversationIdentity(), run_id: activeRunId, anchor_turn_id: currentAnchorTurnId },
        raw
      );
      if (!activeRunId || !activeConversationId || !sameActiveConversation(activeConversationId)) {
        stopPromptPolling(generation);
        return;
      }

      if (candidate.waiting || candidate.missing_anchor || candidate.manual_interruption) {
        await reportPromptActivity(candidate, candidate.manual_interruption ? "manual_interruption" : "waiting_assistant");
        if (candidate.manual_interruption) recordDiagnostic("PROMPT_MANUAL_TURN_CANDIDATE", candidate);
        recordDiagnostic(
          candidate.manual_interruption ? "PROMPT_SCAN_MANUAL_INTERRUPTION" :
            candidate.missing_anchor ? "PROMPT_SCAN_MISSING_ANCHOR" : "PROMPT_SCAN_WAITING_ASSISTANT",
          candidate
        );
        const response = await request("AUTOMATION_PROMPT_CANDIDATE", { candidate });
        if (response.data?.reanchored && response.data?.continuation_anchor_turn_id) {
          const nextAnchor = String(response.data.continuation_anchor_turn_id);
          recordDiagnostic("PROMPT_MANUAL_TURN_REANCHORED", { ...candidate, next_user_turn_id: nextAnchor });
          startPromptPolling(activeRunId, activeConversationId, nextAnchor, null);
          return;
        }
        if (response.data?.paused) {
          if (candidate.manual_interruption) recordDiagnostic("PROMPT_MANUAL_TURN_ACCEPTED", candidate);
          showStatus("Avito Finder: после сообщения extension появилось ручное user-сообщение. Автоматизация на паузе.", "warning");
          stopPromptPolling(generation);
        } else if (candidate.manual_interruption) {
          candidate.rejection_reason = response.data?.reason || "worker_did_not_pause";
          recordDiagnostic("PROMPT_MANUAL_TURN_REJECTED", candidate);
        }
        return;
      }

      if (candidate.expected_assistant_turn_id) {
        recordDiagnostic("PROMPT_RESUME_ASSISTANT_CANDIDATE", candidate);
        if (candidate.intervening_user_turn_count > 0) {
          candidate.rejection_reason = "expected_assistant_recovery_preserves_original_form";
          recordDiagnostic("PROMPT_MANUAL_TURN_REJECTED", candidate);
        }
      }

      if (!candidate.writing_block) {
        const assistantTurnFinal = candidateHasReadyAssistantTurnCopy(candidate);
        await reportPromptActivity(candidate, assistantTurnFinal ? "assistant_ready_without_writing_block" : "assistant_streaming");
        if (!assistantTurnFinal) {
          recordDiagnostic("PROMPT_WAIT_WRITING_BLOCK", candidate);
          candidateFirstSeen = null;
          showStatus("Avito Finder: assistant-ответ обнаружен; жду Writing Block. Обычный Markdown/code block командой не является.", "warning");
          schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, false, generation);
          return;
        }

        const structuralChanged = !candidateFirstSeen ||
          candidateFirstSeen.structural_signature !== candidate.structural_signature;
        if (structuralChanged) {
          candidateFirstSeen = { structural_signature: candidate.structural_signature, first_seen_ms: Date.now() };
          recordDiagnostic("PROMPT_NON_WRITING_BLOCK_FINALITY_STARTED", candidate);
          showStatus("Avito Finder: assistant-turn завершён, но Writing Block отсутствует. Проверяю стабильность формы перед безопасным отказом.", "warning");
          schedulePromptStabilityCheck(PROMPT_STABILITY_MS, generation);
          return;
        }
        const stableForMs = Date.now() - candidateFirstSeen.first_seen_ms;
        if (stableForMs < PROMPT_STABILITY_MS) {
          schedulePromptStabilityCheck(PROMPT_STABILITY_MS - stableForMs, generation);
          return;
        }

        candidate.assistant_finality_confirmed = true;
        candidate.copy_gate_confirmed = true;
        candidate.prompt_source = "anchored_completed_assistant_without_writing_block";
        candidate.rejection_reason = "ASSISTANT_WRITING_BLOCK_REQUIRED";
        candidate.poll_generation = generation;
        recordDiagnostic("PROMPT_FINAL_ASSISTANT_WITHOUT_WRITING_BLOCK", candidate);
        const response = await request("AUTOMATION_PROMPT_FORM_ERROR", { candidate });
        if (!isCurrentPromptPollGeneration(generation)) return;
        if (!response.ok) {
          showStatus(`Avito Finder: ошибка возврата format-report — ${response.error}`, "error");
          return;
        }
        if (response.data?.accepted && response.data?.disposition === "continuation_started" && response.data?.continuation_anchor_turn_id) {
          const nextAnchor = String(response.data.continuation_anchor_turn_id);
          recordDiagnostic("PROMPT_FORM_ERROR_CONTINUATION_HANDOFF", { ...candidate, next_anchor_turn_id: nextAnchor });
          startPromptPolling(activeRunId, activeConversationId, nextAnchor, null);
          return;
        }
        if (response.data?.ignored) {
          candidate.rejection_reason = response.data?.reason || candidate.rejection_reason;
          recordDiagnostic("PROMPT_FORM_ERROR_IGNORED", candidate);
          schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, false, generation);
          return;
        }
        showStatus("Avito Finder: завершённый assistant-ответ не содержит Writing Block. На Avito ничего не выполнялось.", "error");
        stopPromptPolling(generation);
        return;
      }

      await reportPromptActivity(candidate, candidate.copy_ready ? "assistant_ready_writing_block" : "assistant_streaming");
      const structuralChanged = !candidateFirstSeen ||
        candidateFirstSeen.structural_signature !== candidate.structural_signature;

      if (structuralChanged) {
        candidateFirstSeen = { structural_signature: candidate.structural_signature, first_seen_ms: Date.now() };
        recordDiagnostic("PROMPT_DOM_STABILITY_STARTED", candidate);
        showStatus(
          candidate.copy_ready
            ? "Avito Finder: writing block готов; жду 2 секунды неизменности DOM-структуры."
            : "Avito Finder: writing block найден; жду готовую Copy-кнопку и 2 секунды неизменности DOM-структуры.",
          "warning"
        );
        schedulePromptStabilityCheck(PROMPT_STABILITY_MS, generation);
        return;
      }

      const stableForMs = Date.now() - candidateFirstSeen.first_seen_ms;
      if (stableForMs < PROMPT_STABILITY_MS) {
        schedulePromptStabilityCheck(PROMPT_STABILITY_MS - stableForMs, generation);
        return;
      }

      // Completion is a DOM-state decision only: an active generic Copy control
      // proves that ChatGPT finished this assistant turn. No prompt language,
      // marker, header, workstream, iteration ID or other payload text is read.
      if (!candidate.copy_ready) {
        candidate.assistant_finality_confirmed = false;
        candidate.copy_gate_confirmed = false;
        candidate.prompt_source = "anchored_writing_block_dom_waiting_copy";
        recordDiagnostic("PROMPT_WAIT_COPY_DOM", candidate);
        showStatus(
          "Avito Finder: assistant-ответ ещё не завершён. Жду общий признак готового сообщения, не исполняю промежуточный текст команды.",
          "warning"
        );
        schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, false, generation);
        return;
      }

      const candidateSection = turnSections().find((section) =>
        section.getAttribute("data-turn-id") === candidate.assistant_turn_id
      ) || null;
      const localPayload = confirmLocalWritingBlockCopyAndExtract(candidateSection);
      candidate.prompt_text = localPayload.text || "";
      candidate.payload_extracted = localPayload.ok === true;
      candidate.payload_bytes = Number.isInteger(localPayload.bytes) ? localPayload.bytes : 0;
      candidate.payload_extraction_error = localPayload.ok === true ? "" : (localPayload.error || "WRITING_BLOCK_LOCAL_BODY_UNAVAILABLE");
      candidate.poll_generation = generation;
      if (candidate.payload_extracted !== true || Core.normalizeText(candidate.prompt_text || "").length === 0) {
        candidate.rejection_reason = "EMPTY_WRITING_BLOCK_PAYLOAD_IGNORED";
        recordDiagnostic("PROMPT_EMPTY_WRITING_BLOCK_IGNORED", candidate);
        // An empty renderer shell is not a command and must never create a same-chat
        // validator report or replace the current anchor. Recheck after the DOM settles.
        candidateFirstSeen = null;
        schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, false, generation);
        return;
      }

      // v1.0.34: Copy readiness and toolbar stability do not prove body finality.
      // Sample the actual local Writing Block body repeatedly and require the exact
      // same fingerprint for a bounded stability window before validation. This is
      // still local DOM observation; no command is sent to the Worker during settle.
      const payloadFingerprint = localTextFingerprint(candidate.prompt_text || "");
      const now = Date.now();
      let preview = null;
      try { preview = Core.parseCommandForm(candidate.prompt_text || ""); } catch (_) { preview = null; }
      const invalidLooking = preview ? preview.valid !== true : true;
      const requiredPayloadStableMs = invalidLooking ? PROMPT_INVALID_PAYLOAD_STABILITY_MS : PROMPT_PAYLOAD_STABILITY_MS;
      if (!candidateFirstSeen || candidateFirstSeen.payload_fingerprint !== payloadFingerprint) {
        candidateFirstSeen = {
          ...(candidateFirstSeen || {}),
          structural_signature: candidate.structural_signature,
          first_seen_ms: candidateFirstSeen?.first_seen_ms || now,
          payload_fingerprint: payloadFingerprint,
          payload_first_seen_ms: now,
          payload_sample_count: 1,
          payload_bytes: candidate.payload_bytes
        };
        candidate.payload_stability_ms = 0;
        candidate.payload_sample_count = 1;
        candidate.local_preview_valid = preview?.valid === true;
        recordDiagnostic("PROMPT_PAYLOAD_STABILITY_STARTED", candidate);
        schedulePromptStabilityCheck(PROMPT_PAYLOAD_SAMPLE_MS, generation);
        return;
      }
      candidateFirstSeen.payload_sample_count = Number(candidateFirstSeen.payload_sample_count || 1) + 1;
      const payloadStableForMs = now - Number(candidateFirstSeen.payload_first_seen_ms || now);
      candidate.payload_stability_ms = payloadStableForMs;
      candidate.payload_sample_count = candidateFirstSeen.payload_sample_count;
      candidate.local_preview_valid = preview?.valid === true;
      if (candidateFirstSeen.payload_sample_count < PROMPT_PAYLOAD_MIN_SAMPLES || payloadStableForMs < requiredPayloadStableMs) {
        recordDiagnostic("PROMPT_PAYLOAD_STABILITY_WAIT", candidate);
        schedulePromptStabilityCheck(Math.min(PROMPT_PAYLOAD_SAMPLE_MS, Math.max(1, requiredPayloadStableMs - payloadStableForMs)), generation);
        return;
      }

      candidate.stable = true;
      candidate.copy_gate_confirmed = true;
      candidate.assistant_finality_confirmed = true;
      candidate.prompt_source = "anchored_completed_writing_block_dom_payload_stable";
      candidate.form_key = `${candidate.anchor_turn_id || ""}|${candidate.assistant_turn_id || ""}|${payloadFingerprint}`;
      recordDiagnostic("PROMPT_PAYLOAD_STABILITY_CONFIRMED", candidate);
      const response = await request("AUTOMATION_PROMPT_CANDIDATE", { candidate });
      // The Worker can start the next same-chat wait while this older request is
      // still resolving (notably after a validator-error report). Never let this
      // stale response stop the newly anchored poll.
      if (!isCurrentPromptPollGeneration(generation)) {
        candidate.rejection_reason = "PROMPT_RESPONSE_SUPERSEDED_BY_NEW_ANCHOR";
        recordDiagnostic("PROMPT_RESPONSE_SUPERSEDED_BY_NEW_ANCHOR", candidate);
        return;
      }
      if (!response.ok) {
        showStatus(`Avito Finder: ошибка проверки prompt — ${response.error}`, "error");
        return;
      }

      if (response.data?.paused) {
        candidate.rejection_reason = response.data?.reason || "prompt_payload_unavailable";
        recordDiagnostic("PROMPT_COPY_PAYLOAD_UNAVAILABLE_PAUSED", candidate);
        showStatus(
          "Avito Finder: не удалось получить текст формы. Задача Bridge не создана. Автоматизация на паузе; «Продолжить» повторит эту же форму.",
          "warning"
        );
        stopPromptPolling(generation);
        return;
      }

      if (response.data?.accepted) {
        recordDiagnostic("PROMPT_ACCEPTED_FROM_STABLE_WRITING_BLOCK_DOM", candidate);
        showStatus("Avito Finder: полный текст формы получен через local Copy и передан в изолированную локальную обработку.", "neutral");
        // Worker report delivery may synchronously install a newer same-chat anchor
        // before this response returns. The generation guard above is authoritative.
        // A continuation handoff therefore never stops or replaces that newer poll.
        if (response.data?.disposition === "continuation_started") {
          recordDiagnostic("PROMPT_WORKER_CONTINUATION_HANDOFF", {
            ...candidate,
            next_anchor_turn_id: response.data?.continuation_anchor_turn_id || ""
          });
          if (isCurrentPromptPollGeneration(generation)) stopPromptPolling(generation);
          return;
        }
        // A normal diagnostic task is now owned by the Worker; it will return a
        // report and explicitly start the next anchor poll after delivery.
        stopPromptPolling(generation);
        return;
      }

      if (response.data?.ignored) {
        candidate.rejection_reason = response.data?.reason || "candidate_ignored_by_local_state";
        recordDiagnostic("PROMPT_CANDIDATE_IGNORED", candidate);
        schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, false, generation);
        return;
      }

      if (response.data?.connection_recovering) {
        recordDiagnostic("PROMPT_SUBMISSION_CONNECTION_RECOVERY", candidate);
        showStatus("Avito Finder: связь с Bridge временно потеряна. Автоматически проверяю отправку этой же задачи; prompt повторно не отправляю.", "warning");
        stopPromptPolling(generation);
        
        
        return;
      }

      if (response.data?.waiting_stability) {
        recordDiagnostic("PROMPT_WORKER_WAIT_STABILITY", candidate);
        schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, true, generation);
        return;
      }

      if (response.data?.waiting_payload_extraction) {
        candidate.rejection_reason = response.data?.reason || "writing_block_payload_unavailable";
        recordDiagnostic("PROMPT_PAYLOAD_EXTRACTION_PENDING", candidate);
        // Keep the same structural candidate and wait only for a DOM mutation or
        // re-extraction of this writing block. No task POST and no focus happen.
        schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, true, generation);
        return;
      }

      const debug = response.data?.debug || {};
      candidate.rejection_reason = response.data?.reason || "unknown_rejection";
      candidate.expected_status = debug.expected_status || "";
      candidate.actual_status = debug.actual_status || "";
      candidate.expected_owner_tab_id = Number.isInteger(debug.expected_owner_tab_id) ? debug.expected_owner_tab_id : null;
      candidate.actual_sender_tab_id = Number.isInteger(debug.actual_sender_tab_id) ? debug.actual_sender_tab_id : null;
      candidate.expected_chat_origin = debug.expected_chat_origin || "";
      candidate.actual_chat_origin = debug.actual_chat_origin || "";
      candidate.expected_conversation_id = debug.expected_conversation_id || "";
      candidate.actual_conversation_id = debug.actual_conversation_id || "";
      candidate.expected_anchor_turn_id = debug.expected_anchor_turn_id || "";
      candidate.actual_anchor_turn_id = debug.actual_anchor_turn_id || "";
      candidate.expected_chat_path = debug.expected_chat_path || "";
      candidate.actual_chat_path = debug.actual_chat_path || "";
      candidate.mismatch_fields = debug.mismatch_fields || "";
      candidate.tab_matches = debug.tab_matches === true;
      candidate.origin_matches = debug.origin_matches === true;
      candidate.conversation_matches = debug.conversation_matches === true;
      candidate.anchor_matches = debug.anchor_matches === true;
      candidate.paused = debug.paused === true;
      recordDiagnostic("PROMPT_REJECTED_BY_WORKER", candidate);

      showStatus(
        `Avito Finder: команда не принята. Причина: ${candidate.rejection_reason}; ` +
        `несовпало=${candidate.mismatch_fields || "неизвестно"}; ` +
        `серия=${candidate.actual_status || "?"}; ожидается=${candidate.expected_status || "?"}.`,
        "error"
      );
    } finally {
      promptTickInFlight = false;
    }
  }

  function startPromptPolling(runId, conversationId, anchorTurnId = null, expectedAssistantTurnId = null) {
    const nextAnchor = anchorTurnId || currentAnchorTurnId;
    const nextExpectedAssistant = expectedAssistantTurnId || null;
    if (!runId || !conversationId || !nextAnchor || !sameActiveConversation(conversationId)) return false;

    // Idempotence is valid only when this exact anchor is already owned by a
    // live observer/timer generation. A report sender may have discovered a
    // newer anchor before this function runs; that must restart and fence the
    // older poll rather than returning early.
    const alreadyPollingExactAnchor =
      activeRunId === runId &&
      currentAnchorTurnId === nextAnchor &&
      promptPollBoundAnchorTurnId === nextAnchor &&
      currentExpectedAssistantTurnId === nextExpectedAssistant &&
      Boolean(promptPollTimer) &&
      Boolean(promptObserver);
    if (alreadyPollingExactAnchor) {
      recordDiagnostic("PROMPT_POLL_ALREADY_LIVE_FOR_ANCHOR", {
        anchor_turn_id: nextAnchor,
        poll_generation: promptPollGeneration
      });
      return true;
    }

    const priorAnchorTurnId = promptPollBoundAnchorTurnId || currentAnchorTurnId || null;
    const priorGeneration = promptPollGeneration;
    
    stopPromptPolling();
    const generation = ++promptPollGeneration;
    activeRunId = runId;
    activeConversationId = conversationId;
    currentAnchorTurnId = nextAnchor;
    promptPollBoundAnchorTurnId = nextAnchor;
    currentExpectedAssistantTurnId = nextExpectedAssistant;
    recordDiagnostic("PROMPT_POLL_BOUND_TO_NEW_ANCHOR", {
      prior_anchor_turn_id: priorAnchorTurnId,
      anchor_turn_id: nextAnchor,
      prior_generation: priorGeneration,
      poll_generation: generation
    });
    if (currentExpectedAssistantTurnId) {
      recordDiagnostic("PROMPT_RESUME_ANCHOR_SET", {
        anchor_turn_id: currentAnchorTurnId,
        expected_assistant_turn_id: currentExpectedAssistantTurnId,
        recovery_mode: "same_assistant_copy_retry"
      });
    }
    startPromptObserver(generation);
    promptTick(false, generation);
    promptPollTimer = setInterval(() => promptTick(false, generation), 20000);
    showStatus(
      currentExpectedAssistantTurnId
        ? "Avito Finder: повторяю получение той же формы. Ручные сообщения не заменят исходный assistant-блок."
        : `Avito Finder: ран привязан только к этому диалогу ${conversationId.slice(0, 8)}…; жду prompt после user-turn extension.`,
      "warning"
    );
    return true;
  }

  async function reconcilePageMode() {
    if (!contentRuntimeIsCurrent() || pageStateSyncInFlight) return;
    pageStateSyncInFlight = true;
    try {
      const identity=conversationIdentity();
      if(activeConversationRef && !sameConversationReference(activeConversationRef)) {
        stopPromptPolling();
        await reportConversationContextBlocked('ROUTE_OBSERVER',activeConversationRef);
        return;
      }
      if(!identity.conversation_id || promptPollTimer) return;
      const response=await request('AF_CAPTURE_RECOVER_CONTINUOUS',{identity});
      const data=response?.ok ? response.data : null;
      if(!data?.resume || !sameConversationReference(data.expected_identity))return;
      activeRunId=data.search_id;activeConversationId=data.conversation_id;activeConversationRef=data.expected_identity;
      if(startPromptPolling(data.search_id,data.conversation_id,data.anchor_turn_id||null,data.expected_assistant_turn_id||null))
        recordDiagnostic('PROMPT_CONTINUATION_RECOVERED_AFTER_SPA_CONTEXT_RETURN',{anchor_turn_id:data.anchor_turn_id||null,run_id:data.search_id,conversation_id:data.conversation_id});
    } finally {pageStateSyncInFlight=false;}
  }

  // Watch route changes in the document; do not poll the worker every second
  // merely to keep it alive. A body mutation with the same URL costs no RPC.
  let routeObserver=null, lastObservedRoute=String(location.href);
  function startPageStateReconciliation() {
    const observe=()=>{
      if(!contentRuntimeIsCurrent()) {routeObserver?.disconnect();return;}
      const route=String(location.href);if(route===lastObservedRoute)return;
      lastObservedRoute=route;reconcilePageMode().catch(()=>{});
    };
    routeObserver=new MutationObserver(observe);
    routeObserver.observe(document.documentElement,{childList:true,subtree:true});
    window.addEventListener('popstate',observe);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible' && activeRunId)reconcilePageMode().catch(()=>{});});
  }

  window.addEventListener("offline", () => {
    if (!contentRuntimeIsCurrent()) return;
    if (activeRunId) showStatus("Avito Finder: интернет-соединение потеряно. Ран сохранён и продолжится автоматически после восстановления связи.", "warning");
  });
  window.addEventListener("online", () => {
    if (!contentRuntimeIsCurrent()) return;
    if (activeRunId) {
      showStatus("Avito Finder: интернет-соединение восстановлено. Проверяю продолжение текущего рана.", "success");
      reconcilePageMode().catch(()=>{});
    }
  });

  function restorePickerComposer() {
    if (!pickerState?.composer) return;
    try { setComposerText(pickerState.composer, pickerState.originalText); } catch (_) {}
  }

  async function finishPickerWithButton(button) {
    const profile = makeSendButtonProfile(button);
    const response = await request("SAVE_SEND_BUTTON_PROFILE", { profile });
    if (!response.ok) throw new Error(response.error);
    sendButtonProfile = profile;
    restorePickerComposer();
    pickerState = null;
    hidePickerOverlay();
    showStatus("Кнопка сохранена. Extension будет нажимать только её.", "success");
  }

  function cancelSendButtonPicker(message = "Режим выбора кнопки отменён. Тестовый текст удалён.") {
    if (!pickerState) return;
    restorePickerComposer();
    pickerState = null;
    hidePickerOverlay();
    showStatus(message, "warning");
  }

  function startSendButtonPicker() {
    const composer = findComposer();
    if (!composer) throw new Error("Не найдено подтверждённое нижнее поле ChatGPT.");
    if (pickerState) cancelSendButtonPicker("Предыдущий выбор отменён. Запущен новый.");
    pickerState = { composer, originalText: getComposerText(composer) };
    setComposerText(composer, PICKER_TEST_TEXT);
    showPickerOverlay();
    showStatus("Тестовый текст вставлен. Кликни ту кнопку, которую extension должна всегда нажимать.", "warning");
  }

  document.addEventListener("pointerdown", (event) => {
    if (!pickerState) return;
    if (event.target instanceof Element && event.target.closest(`#${pickerOverlayId}`)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    suppressNextClick = true;

    const button = asEnabledButton(event.target);
    if (!button) {
      showStatus("Кликни по кнопке, которую нужно сохранить.", "warning");
      return;
    }
    const pickerForm = pickerState?.composer?.closest("form") || null;
    if (!pickerForm || button.closest("form") !== pickerForm) {
      showStatus("Выбери кнопку отправки только в нижней форме ChatGPT. Кнопки writing block не подходят.", "warning");
      return;
    }
    finishPickerWithButton(button).catch((err) => cancelSendButtonPicker(`Не удалось сохранить кнопку: ${err.message}`));
  }, true);

  document.addEventListener("click", (event) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!pickerState || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancelSendButtonPicker();
  }, true);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!contentRuntimeIsCurrent()) return false;

    if (message?.type === "AF_CAPTURE_START_AND_ANCHOR") {
      (async () => {
        try {
          const expectedIdentity = message.expected_identity;
          assertExpectedConversation(expectedIdentity, "BEFORE_START");
          const identityBeforeStart = conversationIdentity();
          if (!identityBeforeStart.conversation_id) throw bridgeError("Не удалось определить текущий ChatGPT-чат до отправки «Ищи».", "CONVERSATION_ID_MISSING");
          activeRunId = message.search_id || null;
          activeConversationId = identityBeforeStart.conversation_id;
          activeConversationRef = expectedIdentity;
          // Exact Bridge ordering remains unchanged after the strict same-dialog guard:
          // stage → 2000 ms React wait → bind Send → click → composer clear → exact new user-turn.
          const startSendGeneration = reportSendGeneration;
          let startClicked = false;
          const stagedComposerContext = await stageAutomationStartMessage(message.message_text);
          assertReportSendGeneration(startSendGeneration);
          assertExpectedConversation(expectedIdentity, "AFTER_STAGE");
          try {
            const sent = await sendMessageAndCaptureAnchor(message.message_text, async (receipt) => {
              const saved = await request("AF_CAPTURE_START_SEND_INTENT", {
                search_id: activeRunId, identity: expectedIdentity, receipt
              });
              if (!saved.ok) throw bridgeError("Не удалось сохранить границу стартовой отправки; Send не нажат.", "START_SEND_INTENT_NOT_PERSISTED");
            }, stagedComposerContext, {
              stage_identity: { run_id: "af-start", delivery_id: "af-start" },
              anchor_mode: "start_exact",
              on_send_click: () => { startClicked = true; }
            });
            const identity = message.wait_for_conversation_identity ? await waitForConversationIdentity() : conversationIdentity();
            assertExpectedConversation(expectedIdentity, "AFTER_ANCHOR");
            sendResponse({ ok: true, ...sent, identity, send_attempted: startClicked, content_script_version: CONTENT_SCRIPT_VERSION, content_script_protocol: CONTENT_SCRIPT_PROTOCOL });
          } catch (err) {
            sendResponse({ ok: false, error: err.message, code: err.code || "AF_START_CAPTURE_FAILED", send_attempted: startClicked });
          }
        } catch (err) {
          sendResponse({ ok: false, error: err.message, code: err.code || "AF_START_CAPTURE_FAILED", send_attempted: false });
        }
      })();
      return true;
    }

    if (message?.type === "AF_CAPTURE_RECONCILE_START") {
      (async () => {
        try {
          const expectedIdentity = message.expected_identity;
          assertExpectedConversation(expectedIdentity, "RECONCILE_START");
          const receipt = message.receipt || {};
          const messageText = typeof message.message_text === "string" ? message.message_text : "Ищи";
          const scan = inspectStartReceipt(receipt, messageText);
          sendResponse({
            ok: true,
            state: scan.confirmed ? "confirmed" : "pending",
            receipt_mode: scan.receipt_mode || "pending",
            anchor_turn_id: scan.anchor_turn_id || null,
            expected_assistant_turn_id: scan.expected_assistant_turn_id || null,
            identity: conversationIdentity()
          });
        } catch (err) {
          sendResponse({ ok: false, error: err.message, code: err.code || "START_RECONCILE_FAILED" });
        }
      })();
      return true;
    }

    if (message?.type === "AF_CAPTURE_RECONCILE_REPORT") {
      (async () => {
        const expectedIdentity = message.expected_identity;
        const reportText = typeof message.report_text === "string" ? message.report_text : "";
        try {
          if (!reportText.trim()) throw bridgeError("Пустой отчёт нельзя сверять.", "REPORT_TEXT_EMPTY");
          assertExpectedConversation(expectedIdentity, "BEFORE_REPORT_RECONCILE");
          // A reconciliation may run after a content-script reload. Restore only
          // the exact pinned conversation identity; no message is sent here.
          activeRunId = String(message.search_id || activeRunId || "");
          activeConversationId = expectedIdentity?.conversation_id || activeConversationId;
          activeConversationRef = expectedIdentity || activeConversationRef;
          const composerContext = findPrimaryComposerContext();
          const composerText = isPrimaryComposerContextValid(composerContext) ? getComposerText(composerContext.composer) : "";
          if (composerTextMatchesReport(composerText, reportText)) {
            sendResponse({ ok: true, state: "staged", identity: conversationIdentity() });
            return;
          }
          const previousAnchorTurnId = String(message.previous_anchor_turn_id || "");
          const receiptIds = message.receipt?.baseline_user_turn_ids;
          let beforeIds = null;
          if (Array.isArray(receiptIds) && receiptIds.length && receiptIds.length <= 2000) beforeIds = new Set(receiptIds);
          else if (previousAnchorTurnId) {
            const sections = turnSections();
            const index = sections.findIndex(section => section.getAttribute("data-turn-id") === previousAnchorTurnId);
            if (index >= 0) beforeIds = new Set(sections.slice(0,index+1).filter(section => section.getAttribute("data-turn") === "user").map(section=>section.getAttribute("data-turn-id")));
          }
          const anchor = beforeIds ? await waitForNewUserAnchor(beforeIds,reportText,{anchor_mode:"plain_recovery",timeout_ms:1500,event_source:"read_only_report_reconciliation"}) : null;
          assertExpectedConversation(expectedIdentity, "AFTER_REPORT_RECONCILE");
          if (anchor) {
            sendResponse({ ok: true, state: "confirmed", anchor_turn_id: anchor, identity: conversationIdentity() });
            return;
          }
          const state = !isPrimaryComposerContextValid(composerContext) ? "absent" : composerText ? "occupied" : "empty";
          sendResponse({ ok: true, state, identity: conversationIdentity() });
        } catch (err) {
          sendResponse({ ok: false, error: err.message, code: err.code || "AF_REPORT_RECONCILE_FAILED" });
        }
      })();
      return true;
    }


    if (message?.type === "AF_CAPTURE_DISCARD_OWNED_REPORT_STAGE") {
      (async () => {
        try {
          const expectedIdentity = message.expected_identity;
          const reportText = typeof message.report_text === "string" ? message.report_text : "";
          assertExpectedConversation(expectedIdentity, "BEFORE_DISCARD_OWNED_REPORT_STAGE");
          const composerContext = findPrimaryComposerContext();
          if (!isPrimaryComposerContextValid(composerContext)) throw bridgeError("Primary composer unavailable.", "PRIMARY_COMPOSER_MISSING");
          const composer = composerContext.composer;
          const stage = readComposerBridgeStage(composer);
          const actualText = getComposerText(composer);
          const expectedFingerprint = localTextFingerprint(reportText);
          const owned = Boolean(stage &&
            stage.run_id === String(message.search_id || "") &&
            (!message.delivery_id || stage.delivery_id === String(message.delivery_id || "")) &&
            stage.text_fingerprint === localTextFingerprint(actualText) &&
            composerTextMatchesReport(actualText, reportText) &&
            (!message.report_fingerprint || stage.report_fingerprint === String(message.report_fingerprint || "") || stage.report_fingerprint === expectedFingerprint));
          if (!owned) {
            sendResponse({ ok: true, cleared: false, reason: "OWNED_REPORT_STAGE_NOT_CONFIRMED" });
            return;
          }
          beginComposerInputGuard(composer);
          setComposerText(composer, "");
          clearComposerBridgeStage(composer);
          composerInputGuards.get(composer)?.dispose();
          composerInputGuards.delete(composer);
          recordDiagnostic("OWNED_VALIDATION_REPORT_STAGE_DISCARDED", {
            run_id: String(message.search_id || ""),
            delivery_id: String(message.delivery_id || ""),
            report_fingerprint: expectedFingerprint,
            event_source: "larger_same_turn_writing_block_superseded_unsent_validation"
          });
          sendResponse({ ok: true, cleared: true });
        } catch (err) {
          sendResponse({ ok: false, error: err.message, code: err.code || "DISCARD_OWNED_REPORT_STAGE_FAILED" });
        }
      })();
      return true;
    }

    if (message?.type === "AF_CAPTURE_SEND_REPORT") {
      (async () => {
        const expectedIdentity = message.expected_identity;
        const reportText = typeof message.report_text === "string" ? message.report_text : "";
        try {
          if (!reportText.trim()) throw bridgeError("Пустой диагностический отчёт не отправляется.", "REPORT_TEXT_EMPTY");
          assertExpectedConversation(expectedIdentity, "BEFORE_REPORT_DELIVERY");
          activeRunId = String(message.search_id || activeRunId || "");
          activeConversationId = expectedIdentity?.conversation_id || null;
          activeConversationRef = expectedIdentity;
          const id = `${activeConversationId}:${activeRunId}:${String(message.delivery_id || "")}:${localTextFingerprint(reportText)}`;
          let delivery = localReportDeliveries.get(id);
          if (delivery && delivery.payload !== reportText) throw bridgeError("Один идентификатор доставки получил несовпадающий текст. Отправка остановлена.", "REPORT_DELIVERY_PAYLOAD_CONFLICT");
          if (!delivery) {
            if (plainDeliveryInFlight && plainDeliveryInFlight !== id) {
              sendResponse({ok:false,code:"REPORT_COMPOSER_SEND_IN_PROGRESS",error:"Поле занято другой незавершённой доставкой Finder.",send_attempted:false});
              return;
            }
            // Same adapter can receive a duplicate message after a Worker restart.
            // Once Send was attempted, only an exact user-turn reconciliation is safe.
            for (const [key,record] of localReportDeliveries) if (localReportDeliveries.size>32 && record.confirmed) localReportDeliveries.delete(key);
            if(localReportDeliveries.size>64) throw bridgeError("Нужна сверка незавершённых отправок.","REPORT_RECONCILIATION_REQUIRED");
            plainDeliveryInFlight = id;
            delivery = {clicked:false,confirmed:false,promise:null,payload:reportText};
            localReportDeliveries.set(id,delivery);
            delivery.promise = (async()=>{
              try {
                const sent=await sendMessageAndCaptureAnchor(reportText,async (receipt)=>{
                  const saved = await request("AF_CAPTURE_REPORT_SEND_INTENT", {
                    search_id: activeRunId, delivery_id: String(message.delivery_id || ""),
                    identity: expectedIdentity, receipt
                  });
                  if (!saved.ok) throw bridgeError("Не удалось сохранить границу отправки; Send не нажат.", "REPORT_SEND_INTENT_NOT_PERSISTED");
                },null,{
                  original_text:"",stage_identity:{run_id:activeRunId,delivery_id:String(message.delivery_id||"diagnostic-report"),report_fingerprint:localTextFingerprint(reportText)},anchor_mode:"plain_delivery",
                  on_send_click:()=>{delivery.clicked=true;}
                });
                assertExpectedConversation(expectedIdentity,"AFTER_REPORT_DELIVERY");
                delivery.confirmed=true;return {ok:true,...sent,identity:conversationIdentity()};
              } catch(err) {
                if(!delivery.clicked) localReportDeliveries.delete(id);
                return {ok:false,error:err.message,code:err.code||"AF_REPORT_DELIVERY_FAILED",send_attempted:delivery.clicked};
              }
            })().finally(() => { if (plainDeliveryInFlight === id) plainDeliveryInFlight = null; });
          }
          sendResponse(await delivery.promise);
        } catch(err) {sendResponse({ok:false,error:err.message,code:err.code||"AF_REPORT_DELIVERY_FAILED"});}
      })();
      return true;
    }

    if (message?.type === "AF_CAPTURE_PING") {
      sendResponse({ ok: true, content_script_version: CONTENT_SCRIPT_VERSION, content_script_protocol: CONTENT_SCRIPT_PROTOCOL, identity: conversationIdentity() });
      return false;
    }

    if (message?.type === "AF_CAPTURE_BEGIN_PROMPT_POLL") {
      if (!sameActiveConversation(message.conversation_id) || !sameConversationReference(message.expected_identity) || !sameConversationReference(activeConversationRef)) {
        reportConversationContextBlocked("BEFORE_PROMPT_POLL", message.expected_identity).catch(() => {});
        sendResponse({ ok: false, error: "Этот таб не совпадает с зафиксированным ChatGPT-диалогом текущей задачи." });
        return false;
      }
      const started = startPromptPolling(message.search_id, message.conversation_id, message.anchor_turn_id || currentAnchorTurnId, message.expected_assistant_turn_id || null);
      sendResponse({ ok: started === true, anchor_turn_id: message.anchor_turn_id || currentAnchorTurnId || null, expected_assistant_turn_id: message.expected_assistant_turn_id || null });
      return false;
    }

    if (message?.type === "AF_CAPTURE_STOP") {
      if (message.expected_identity && !sameConversationReference(message.expected_identity)) {
        reportConversationContextBlocked("STOP", message.expected_identity).catch(() => {});
        sendResponse({ ok: false, error: "STOP_CONTEXT_MISMATCH" });
        return false;
      }
      reportSendGeneration += 1;
      stopPromptPolling();
      
      
      
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "AF_INSPECT_CHATGPT_DOM") {
      const sections = turnSections();
      sendResponse({ ok: true, snapshot: {
        url: location.href,
        title: document.title,
        conversation_id: conversationIdentity().conversation_id,
        turn_count: sections.length,
        user_turn_count: sections.filter((section) => section.getAttribute("data-turn") === "user").length,
        assistant_turn_count: sections.filter((section) => section.getAttribute("data-turn") === "assistant").length,
        primary_composer_present: Boolean(findPrimaryComposerContext()),
        actions_performed: "none_read_only"
      }});
      return false;
    }

    sendResponse({ ok: false, error: "Unknown Avito Finder ChatGPT capture message." });
    return false;
  });

  if (globalThis.__AF_TEST_EXPORTS) {
    globalThis.__AF_TEST_EXPORTS.chatCapture = {
      readComposerText: getComposerText, writeComposerText: setComposerText,
      composerTextMatchesReport, composerReadbackDetails, inspectExistingUserAnchorAfter,
      userBodyReadings, inspectNewUserAnchor, inspectStartReceipt, assistantTurnIds, sectionUserText, waitForNewUserAnchor, waitForStartReceipt,

      startFixturePromptPoll({ run_id, conversation_id, anchor_turn_id }) {
        const fixtureConversationId = String(conversation_id || "").toLowerCase();
        fixtureConversationIdentityOverride = {
          origin: "https://chatgpt.com",
          chat_path: `/c/${fixtureConversationId}`,
          conversation_id: fixtureConversationId
        };
        activeRunId = String(run_id || "fixture-run");
        activeConversationId = fixtureConversationId;
        activeConversationRef = conversationIdentity();
        return startPromptPolling(activeRunId, activeConversationId, String(anchor_turn_id || ""), null);
      },
      readFixtureState() {
        return {
          generation: promptPollGeneration,
          tick_in_flight: promptTickInFlight,
          anchor_turn_id: currentAnchorTurnId,
          bound_anchor_turn_id: promptPollBoundAnchorTurnId,
          stability_timer_live: Boolean(promptStabilityTimer)
        };
      }
    };
  }

  async function resumeAfterReload() {
    if (!contentRuntimeIsCurrent()) return;
    await loadSendButtonProfile();
    // The worker owns the durable run state. On a harmless content-script reload,
    // recover only an already delivered report's next-form wait in this same pinned
    // conversation; never stage text, resend a report, or create a new start command.
    const identity = conversationIdentity();
    if (!identity.conversation_id) return;
    const response = await request("AF_CAPTURE_RECOVER_CONTINUOUS", { identity });
    const data = response?.ok ? response.data : null;
    if (!data?.resume || !sameConversationReference(data.expected_identity)) return;
    activeRunId = data.search_id;
    activeConversationId = data.conversation_id;
    activeConversationRef = data.expected_identity;
    const started = startPromptPolling(data.search_id, data.conversation_id, data.anchor_turn_id || null, data.expected_assistant_turn_id || null);
    if (started) recordDiagnostic("PROMPT_CONTINUATION_RECOVERED_AFTER_RELOAD", { anchor_turn_id: data.anchor_turn_id || null, run_id: data.search_id, conversation_id: data.conversation_id });
  }

  startPageStateReconciliation();
  resumeAfterReload().catch((error) => {
    if (isExtensionContextInvalidated(error)) disposeContentRuntime("extension_context_invalidated");
  });
})();