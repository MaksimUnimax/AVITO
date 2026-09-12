from pathlib import Path

PATH = Path('подбор авито расширение/extension_v1.0.24/chatgpt_content.js')
src = PATH.read_text(encoding='utf-8')

if 'function ordinaryAssistantPayloadText(section)' in src:
    print('patch already applied')
    raise SystemExit(0)


def replace_once(old: str, new: str, label: str) -> None:
    global src
    count = src.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    src = src.replace(old, new, 1)


old = '''  function sectionUserText(section) {
    const role = section.querySelector('[data-message-author-role="user"]');
    return (role?.innerText || role?.textContent || section.innerText || section.textContent || "").trim();
  }
'''
new = old + '''
  function cleanAssistantTurnText(section) {
    if (!(section instanceof Element)) return "";
    const role = section.querySelector('[data-message-author-role="assistant"]') || section;
    const clone = role.cloneNode(true);
    clone.querySelectorAll("button, [role=button], svg, script, style").forEach((node) => node.remove());
    return String(clone.innerText || clone.textContent || "")
      .replace(/\\u00a0/g, " ")
      .replace(/^\\s+|\\s+$/g, "");
  }

  function ordinaryAssistantPayloadText(section) {
    if (!(section instanceof Element)) return "";
    const role = section.querySelector('[data-message-author-role="assistant"]') || section;
    const codeBlocks = Array.from(role.querySelectorAll("pre"))
      .map((block) => {
        const clone = block.cloneNode(true);
        clone.querySelectorAll("button, [role=button], svg, script, style").forEach((node) => node.remove());
        return String(clone.innerText || clone.textContent || "")
          .replace(/\\u00a0/g, " ")
          .replace(/^\\s+|\\s+$/g, "");
      })
      .filter(Boolean);
    // Structural preference only: if the completed assistant turn contains one
    // code block, that block is the command payload. No command text is parsed
    // to make this decision. Otherwise use the whole completed assistant turn.
    if (codeBlocks.length === 1) return codeBlocks[0];
    return cleanAssistantTurnText(section);
  }
'''
replace_once(old, new, 'assistant payload helpers')

old = '''  function buttonToken(snapshot) {
    return [snapshot.testid, snapshot.aria, snapshot.title, snapshot.text]
      .join(" ")
      .toLowerCase();
  }

  function detectCopyReadiness(section) {
'''
new = '''  function buttonToken(snapshot) {
    return [snapshot.testid, snapshot.aria, snapshot.title, snapshot.text]
      .join(" ")
      .toLowerCase();
  }

  function isGenericAssistantTurnCopySnapshot(snapshot) {
    const token = buttonToken(snapshot);
    return snapshot.testid === "copy-turn-action-button" ||
      /копировать\\s+ответ|copy\\s+response/u.test(token);
  }

  function detectCopyReadiness(section) {
'''
replace_once(old, new, 'generic turn copy helper')

old = '''    const allSemanticCopy = buttons.find((entry) => {
      const token = buttonToken(entry.snapshot);
      return entry.snapshot.testid === "copy-turn-action-button" ||
        token.includes("copy") ||
        token.includes("копир");
    });
    const allSpriteCopy = buttons.find((entry) => String(entry.snapshot.svg).includes("#ce3544"));
    const writingBlock = Boolean(binding?.root);

    if ((allSemanticCopy && !allSemanticCopy.snapshot.enabled) ||
        (allSpriteCopy && !allSpriteCopy.snapshot.enabled)) {
'''
new = '''    const genericTurnCopy = buttons.find((entry) => isGenericAssistantTurnCopySnapshot(entry.snapshot));
    const allSemanticCopy = buttons.find((entry) => {
      const token = buttonToken(entry.snapshot);
      return isGenericAssistantTurnCopySnapshot(entry.snapshot) ||
        token.includes("copy") ||
        token.includes("копир");
    });
    const allSpriteCopy = buttons.find((entry) => String(entry.snapshot.svg).includes("#ce3544"));
    const writingBlock = Boolean(binding?.root);

    // Ordinary assistant responses are complete only when the assistant-turn
    // Copy action itself exists. A code-block-local "Копировать" control must
    // never be mistaken for assistant finality.
    if (!writingBlock) {
      if (genericTurnCopy && !genericTurnCopy.snapshot.enabled) {
        return {
          ready: false,
          mode: "semantic_turn_copy_disabled",
          writing_block: false,
          buttons: buttons.map((entry) => entry.snapshot)
        };
      }
      if (genericTurnCopy && genericTurnCopy.snapshot.enabled) {
        return {
          ready: true,
          mode: "semantic_turn_copy_button",
          writing_block: false,
          buttons: buttons.map((entry) => entry.snapshot)
        };
      }
      return {
        ready: false,
        mode: buttons.length ? "ordinary_assistant_waiting_turn_copy" : "no_controls_yet",
        writing_block: false,
        buttons: buttons.map((entry) => entry.snapshot)
      };
    }

    if ((allSemanticCopy && !allSemanticCopy.snapshot.enabled) ||
        (allSpriteCopy && !allSpriteCopy.snapshot.enabled)) {
'''
replace_once(old, new, 'finality level fix')

old = '''  function confirmLocalWritingBlockCopyAndExtract(section) {
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
'''
new = old + '''
  function confirmAssistantPayloadAndExtract(section, candidate) {
    if (candidate?.writing_block === true) return confirmLocalWritingBlockCopyAndExtract(section);
    const copy = detectCopyReadiness(section);
    if (copy.writing_block === true || copy.ready !== true || copy.mode !== "semantic_turn_copy_button") {
      return { ok: false, error: "ORDINARY_ASSISTANT_TURN_NOT_FINAL", text: "", bytes: 0 };
    }
    const text = ordinaryAssistantPayloadText(section);
    const bytes = text ? new TextEncoder().encode(text).byteLength : 0;
    if (!text) return { ok: false, error: "ORDINARY_ASSISTANT_BODY_UNAVAILABLE", text: "", bytes: 0 };
    return { ok: true, text, bytes, source: "ordinary_assistant_turn_dom" };
  }
'''
replace_once(old, new, 'payload extractor')

old = '''      const promptText = copy.writing_block ? sectionWritingBlockText(expectedAssistant) : "";
      const payloadExtracted = copy.writing_block === true && typeof promptText === "string" && promptText.length > 0;
      const payloadBytes = payloadExtracted ? new TextEncoder().encode(promptText).byteLength : 0;
'''
new = '''      const promptText = copy.writing_block
        ? sectionWritingBlockText(expectedAssistant)
        : (copy.ready ? ordinaryAssistantPayloadText(expectedAssistant) : "");
      const payloadExtracted = typeof promptText === "string" && promptText.length > 0 && (copy.writing_block || copy.ready);
      const payloadBytes = payloadExtracted ? new TextEncoder().encode(promptText).byteLength : 0;
'''
replace_once(old, new, 'expected assistant candidate payload')

old = '''    const promptText = copy.writing_block ? sectionWritingBlockText(assistant) : "";
    const payloadExtracted = copy.writing_block === true && typeof promptText === "string" && promptText.length > 0;
    const payloadBytes = payloadExtracted ? new TextEncoder().encode(promptText).byteLength : 0;
'''
new = '''    const promptText = copy.writing_block
      ? sectionWritingBlockText(assistant)
      : (copy.ready ? ordinaryAssistantPayloadText(assistant) : "");
    const payloadExtracted = typeof promptText === "string" && promptText.length > 0 && (copy.writing_block || copy.ready);
    const payloadBytes = payloadExtracted ? new TextEncoder().encode(promptText).byteLength : 0;
'''
replace_once(old, new, 'ordinary assistant candidate payload')

old = '''      if (!candidate.writing_block) {
        await reportPromptActivity(candidate, "assistant_streaming");
        recordDiagnostic("PROMPT_WAIT_WRITING_BLOCK", candidate);
        candidateFirstSeen = null;
        showStatus("Avito Finder: assistant-ответ обнаружен; жду writing block и готовую Copy-кнопку. Содержимое не анализируется.", "warning");
        schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, false, generation);
        return;
      }
'''
new = '''      if (!candidate.writing_block && !candidate.copy_ready) {
        await reportPromptActivity(candidate, "assistant_streaming");
        recordDiagnostic("PROMPT_WAIT_ASSISTANT_FINALITY", candidate);
        candidateFirstSeen = null;
        showStatus("Avito Finder: assistant-ответ обнаружен; жду завершения текущего assistant-turn. Writing block не обязателен.", "warning");
        schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, false, generation);
        return;
      }
'''
replace_once(old, new, 'remove unconditional writing-block wait')

old = '''      candidate.stable = true;
      candidate.copy_gate_confirmed = true;
      candidate.assistant_finality_confirmed = true;
      candidate.prompt_source = "anchored_completed_writing_block_dom";
      const candidateSection = turnSections().find((section) =>
        section.getAttribute("data-turn-id") === candidate.assistant_turn_id
      ) || null;
      const localPayload = confirmLocalWritingBlockCopyAndExtract(candidateSection);
'''
new = '''      candidate.stable = true;
      candidate.copy_gate_confirmed = true;
      candidate.assistant_finality_confirmed = true;
      candidate.prompt_source = candidate.writing_block
        ? "anchored_completed_writing_block_dom"
        : "anchored_completed_assistant_turn_dom";
      const candidateSection = turnSections().find((section) =>
        section.getAttribute("data-turn-id") === candidate.assistant_turn_id
      ) || null;
      const localPayload = confirmAssistantPayloadAndExtract(candidateSection, candidate);
'''
replace_once(old, new, 'final payload extraction path')

old = '''      if (response.data?.accepted) {
        recordDiagnostic("PROMPT_ACCEPTED_FROM_STABLE_WRITING_BLOCK_DOM", candidate);
        showStatus("Avito Finder: полный текст формы получен через local Copy и передан в изолированную локальную обработку.", "neutral");
'''
new = '''      if (response.data?.accepted) {
        recordDiagnostic(
          candidate.writing_block ? "PROMPT_ACCEPTED_FROM_STABLE_WRITING_BLOCK_DOM" : "PROMPT_ACCEPTED_FROM_STABLE_ASSISTANT_TURN_DOM",
          candidate
        );
        showStatus(
          candidate.writing_block
            ? "Avito Finder: полный текст формы получен из writing block и передан в изолированную локальную обработку."
            : "Avito Finder: завершённый assistant-turn получен и передан в изолированную локальную обработку.",
          "neutral"
        );
'''
replace_once(old, new, 'acceptance diagnostic')

PATH.write_text(src, encoding='utf-8')
print('patched', PATH)
