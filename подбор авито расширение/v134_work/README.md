# Avito Finder v1.0.34 — Writing Block Body Stability

v1.0.34 is a corrective release after a live monitor-search failure on 2026-09-12. The failure was not on Avito: ChatGPT displayed a long executable Writing Block, but Finder accepted a shorter in-progress body after its toolbar/Copy control became ready. The truncated 660-character command failed local validation with `UI_PLAN_STEP_REQUIRED`; when the same assistant turn later contained the complete ~6.8 KB body, the Worker rejected it as `COMMAND_ALREADY_IN_FLIGHT`.

## Main corrections

1. **Writing Block body stability gate.** Toolbar readiness is no longer sufficient. Finder samples the exact extracted command-body fingerprint and waits for body stability before sending it to the Worker. Body mutation resets the settle window. Invalid-looking payloads receive a longer settle window so streaming tails such as `Шаги:` are not prematurely validated.
2. **Validate before durable ownership.** `Core.parseCommandForm()` now runs before a command candidate is durably consumed. A Worker shutdown between capture and validation can no longer strand the run in a provisional unvalidated state.
3. **Legacy recovery.** A persisted `FORM_TEXT_CAPTURED_UNVALIDATED` from an older build is recovered read-only to `WAITING_FOR_NEXT_ASSISTANT_FORM` without Avito mutation.
4. **Same-turn larger-payload supersede.** If an older/partial body already produced an unsent validation report, a strictly larger body from the exact same assistant turn may supersede it only after the content script proves and clears the exact Finder-owned staged validation report. User drafts, foreign text, a different assistant turn, same-size payloads, or an already-clicked report are never overwritten.
5. **Version handshake consistency.** Worker and ChatGPT adapter are both protocol version `0.6.17`; Avito DOM adapter is `1.0.34`.

## Verification

The selected cross-layer matrix contains **128 individually named scenarios**, split into independent blocks so a long monolithic test run is not required. Result: **128/128 PASS**. In addition, the complete Node regression suite is **346/346 PASS**, with focused queue/navigation **30/30 PASS** and focused recovery/proxy/network **120/120 PASS**.

See:
- `docs/SCENARIO_MATRIX_128_v1.0.34_RU.md`
- `qa/v134/SCENARIO_MATRIX_128_v1.0.34.json`
- `docs/AUDIT_v1.0.34_RU.md`
- `docs/TEST_REPORT_v1.0.34_RU.md`
- `docs/SOURCES_v1.0.34_RU.md`

## Boundaries

The browser scenarios use the production extension JavaScript in real Chromium DOM fixtures and Worker/Chrome API doubles as documented by each scenario. They do **not** claim that an unpacked MV3 build was installed into the assistant's Chromium or that live ChatGPT/Avito/Proxy.Market were contacted. Live acceptance remains the user's installed Chrome run.

## Upgrade

Replace the files in the same unpacked-extension directory, then Reload the existing extension in `chrome://extensions`. Do not remove the extension and do not clear its storage if you want to preserve the current search state.
