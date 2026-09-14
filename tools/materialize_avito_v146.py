from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.45" / "v145_work"
RELEASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.46"
DEST = RELEASE / "v146_work"
GREEN = ROOT / "подбор авито расширение" / "v146_prepatch_tests" / "terminal_avito_failure_capture_green.test.js"

EXPECTED_BASE_HASHES = {
    "service_worker.js": "0e5b569683d4b49fb629d93195ac5fadfe6671ff3d10d2d6481705f09777b584",
    "recovery.js": "1ec586819d4ecc0edb7c1c8fdd8af1b7f1262880f553ba8e9cb135c00b58babc",
    "core.js": "01511a35dcec266a155e0b09ab869d1f91b21bf06d6940cef7f0fb8584a40d76",
    "proxy_manager.js": "c348fed57f0dcc2b97bab972ccfbf9420fee49b6ac89eb479d40ecad8f620e66",
    "chatgpt_content.js": "bf30d2babc8b7769fc6c7e651713c164a84c42d6c973270756da319088f7da4d",
    "avito_content.js": "ebd7de4ff60919017aee3351473d9706acb13d20d0f829a7dc52b21dd6b522c0",
    "manifest.json": "8af11207ee1caab76957ef0b71eb7f5ebea2cf190e240f26a63d4c5aa157287d",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, got {count}")
    return text.replace(old, new, 1)


def main() -> None:
    if not BASE.is_dir():
        raise SystemExit(f"missing exact v1.0.45 source: {BASE}")
    manifest = json.loads((BASE / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != "1.0.45":
        raise RuntimeError(f"wrong base manifest: {manifest.get('version')}")
    for name, expected in EXPECTED_BASE_HASHES.items():
        actual = sha256(BASE / name)
        if actual != expected:
            raise RuntimeError(f"exact v1.0.45 base hash mismatch {name}: {actual} != {expected}")

    red = RELEASE / "QA" / "red" / "RED.json"
    if not red.is_file():
        raise RuntimeError("v1.0.46 RED authority missing")
    red_data = json.loads(red.read_text(encoding="utf-8"))
    if red_data.get("status") != "RED_CONFIRMED" or red_data.get("source_version") != "1.0.45":
        raise RuntimeError(f"invalid v1.0.46 RED authority: {red_data}")

    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(BASE, DEST)

    manifest_path = DEST / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["version"] = "1.0.46"
    manifest["version_name"] = "1.0.46-terminal-failure-capture-quiescence"
    manifest["description"] = (
        "Avito Finder: terminal non-CAPTCHA Avito failure reports quiesce the old ChatGPT capture cycle instead of requiring another Writing Block; "
        "CAPTCHA/manual continuation, v1.0.35 form validation, v1.0.44 request authority and v1.0.45 transport escalation are preserved."
    )
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    avito_path = DEST / "avito_content.js"
    avito = replace_once(
        avito_path.read_text(encoding="utf-8"),
        'const ADAPTER_VERSION = "1.0.45";',
        'const ADAPTER_VERSION = "1.0.46";',
        "adapter version",
    )
    avito_path.write_text(avito, encoding="utf-8")

    worker_path = DEST / "service_worker.js"
    worker = worker_path.read_text(encoding="utf-8")

    helper_marker = "async function deliverReportToPinnedChat(state,report,reportKind) {"
    helper = """function shouldContinueAssistantFormAfterReport(reportKind, manualGateKind) {\n  return String(reportKind || '') !== 'avito_failure' || String(manualGateKind || '') === 'CAPTCHA';\n}\nasync function quiesceTerminalReportAfterDelivery(state, pinned, reportKind, nextAnchorTurnId, source) {\n  await storageRemove([INSPECTION_KEY]);\n  const timerKey = Recovery.operationKey(state);\n  if (reportAckTimers.has(timerKey)) { clearTimeout(reportAckTimers.get(timerKey)); reportAckTimers.delete(timerKey); }\n  const terminal = await saveState({\n    ...state,\n    status: 'TERMINAL_REPORT_DELIVERED',\n    phase: 'CHATGPT_TERMINAL_REPORT',\n    anchor_turn_id: nextAnchorTurnId || state.anchor_turn_id || null,\n    report: null,\n    report_kind: null,\n    report_delivery_id: null,\n    report_delivery_dispatched: false,\n    report_send_attempted: null,\n    report_delivery_error_code: null,\n    report_send_receipt: null,\n    report_ack_budget: null,\n    manual_gate_kind: null,\n    expected_assistant_turn_id: null,\n    assistant_turn_id: null,\n    partial_collection_observations: [],\n    sequential_review: continuationSequentialCheckpoint(state.sequential_review),\n    user_started: false,\n    blocked_reason: null\n  });\n  await log(source === 'reconcile' ? 'REPORT_RECONCILED_CONFIRMED' : 'REPORT_SENT_CONFIRMED', {\n    search_id: terminal.search_id,\n    report_kind: reportKind,\n    user_turn_id: nextAnchorTurnId || null,\n    chatgpt_tab_id: pinned.tab.id,\n    terminal: true\n  });\n  let stopResponse = null;\n  try {\n    stopResponse = await sendChat(pinned.tab.id, { type: 'AF_CAPTURE_STOP', expected_identity: pinned.context });\n  } catch (error) {\n    stopResponse = { ok: false, error: Recovery.redactedError(error) };\n  }\n  await log('TERMINAL_REPORT_CAPTURE_QUIESCED', {\n    search_id: terminal.search_id,\n    report_kind: reportKind,\n    source,\n    capture_stop_confirmed: stopResponse?.ok === true,\n    capture_stop_error: stopResponse?.ok === true ? null : (stopResponse?.error || 'CAPTURE_STOP_UNCONFIRMED')\n  });\n  return getState();\n}\nasync function deliverReportToPinnedChat(state,report,reportKind) {"""
    worker = replace_once(worker, helper_marker, helper, "report continuation policy helper")

    direct_marker = """  await assertCurrentOperation(staged);\n  const nextAnchorTurnId = response.anchor_turn_id || null;\n  if (!nextAnchorTurnId) {"""
    direct_replacement = """  await assertCurrentOperation(staged);\n  const nextAnchorTurnId = response.anchor_turn_id || null;\n  if (!shouldContinueAssistantFormAfterReport(reportKind, manualGateKind)) {\n    return quiesceTerminalReportAfterDelivery(staged, pinned, reportKind, nextAnchorTurnId, 'direct');\n  }\n  if (!nextAnchorTurnId) {"""
    worker = replace_once(worker, direct_marker, direct_replacement, "terminal direct delivery quiescence")

    reconcile_marker = """  const resumablePreClick = canResumePreClickReport(state);\n  if (response.state === \"confirmed\" && response.anchor_turn_id) {\n    await storageRemove([INSPECTION_KEY]);"""
    reconcile_replacement = """  const resumablePreClick = canResumePreClickReport(state);\n  const reconcileManualGateKind = state.manual_gate_kind || null;\n  const reconcileContinuationRequired = shouldContinueAssistantFormAfterReport(state.report_kind, reconcileManualGateKind);\n  if (response.state === \"confirmed\" && (response.anchor_turn_id || !reconcileContinuationRequired)) {\n    if (!reconcileContinuationRequired) {\n      const terminal = await quiesceTerminalReportAfterDelivery(state, pinned, state.report_kind || 'avito_failure', response.anchor_turn_id || null, 'reconcile');\n      return { ok: true, state: terminal };\n    }\n    await storageRemove([INSPECTION_KEY]);"""
    worker = replace_once(worker, reconcile_marker, reconcile_replacement, "terminal reconciliation quiescence")

    wording_marker = '    "Расширение вернуло этот отчёт в тот же чат и продолжает ожидать следующую форму."'
    wording_replacement = """    /CAPTCHA_MANUAL_REQUIRED/i.test(String(reason || \"\"))\n      ? \"Расширение вернуло этот отчёт в тот же чат и ждёт ручного решения CAPTCHA перед продолжением.\"\n      : \"Расширение вернуло этот отчёт в тот же чат и завершило текущую задачу. Новая работа запускается новой командой пользователя.\""""
    worker = replace_once(worker, wording_marker, wording_replacement, "terminal failure report wording")
    worker_path.write_text(worker, encoding="utf-8")

    # Identity expectations move with the package version. Runtime expectations
    # are migrated only when they assert the exact post-terminal-report lifecycle
    # superseded by the v1.0.46 RED. Transport, request authority, delivery count,
    # evidence and CAPTCHA/manual continuation assertions remain unchanged.
    version_tests = [
        DEST / "tests" / "v135_prompt_form_terminal_gate.test.py",
        DEST / "tests" / "ip_block_ui_plan_recovery_v124.test.js",
        DEST / "tests" / "ip_block_verified_egress_v123.test.js",
        DEST / "tests" / "proxy_recovery_integrity_v137.test.js",
        DEST / "tests" / "traffic_lite_zero_media.test.js",
    ]
    for path in version_tests:
        if path.exists():
            path.write_text(path.read_text(encoding="utf-8").replace("1.0.45", "1.0.46"), encoding="utf-8")

    # v1.0.45 transport regression: only the post-exhaustion chat state changes.
    embedded_transport = DEST / "tests" / "recovery_escalation_v145.test.js"
    embedded_transport_text = embedded_transport.read_text(encoding="utf-8")
    embedded_transport_text = replace_once(
        embedded_transport_text,
        "  assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');",
        "  assert.equal(r.status,'TERMINAL_REPORT_DELIVERED');",
        "v1.0.46 post-exhaustion transport terminal state",
    )
    embedded_transport.write_text(embedded_transport_text, encoding="utf-8")

    # The aggregate diagnostic proved five additional stale lifecycle assertions.
    # Each one is attached to a terminal non-CAPTCHA avito_failure and changes
    # only WAITING_FOR_NEXT_ASSISTANT_FORM -> TERMINAL_REPORT_DELIVERED.
    contract_audit = DEST / "tests" / "contract_audit_v129.test.js"
    contract_text = contract_audit.read_text(encoding="utf-8")
    contract_old = "assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.equal(r.avito_network_authority?.blocked,true);"
    contract_new = "assert.equal(r.status,'TERMINAL_REPORT_DELIVERED');assert.equal(r.avito_network_authority?.blocked,true);"
    contract_text = replace_once(contract_text, contract_old, contract_new, "rate-limit DIRECT terminal report state")
    contract_audit.write_text(contract_text, encoding="utf-8")

    recovery_behavior = DEST / "tests" / "recovery_behavior_v125.test.js"
    behavior_text = recovery_behavior.read_text(encoding="utf-8")
    behavior_replacements = [
        (
            "assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.equal(r.connection_recovery.attempt,4);assert.equal(r.connection_recovery.prepared.probe_ip_changed,false);",
            "assert.equal(r.status,'TERMINAL_REPORT_DELIVERED');assert.equal(r.connection_recovery.attempt,4);assert.equal(r.connection_recovery.prepared.probe_ip_changed,false);",
            "same-egress exhaustion terminal report state",
        ),
        (
            "assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.equal(r.connection_recovery.attempt,4);assert.equal(r.connection_recovery.prepared.probe_before,null);",
            "assert.equal(r.status,'TERMINAL_REPORT_DELIVERED');assert.equal(r.connection_recovery.attempt,4);assert.equal(r.connection_recovery.prepared.probe_before,null);",
            "unreachable-probe exhaustion terminal report state",
        ),
        (
            "assert.equal((await w.h.getState()).status,'WAITING_FOR_NEXT_ASSISTANT_FORM');});\ntest('mutating plan interruption",
            "assert.equal((await w.h.getState()).status,'TERMINAL_REPORT_DELIVERED');});\ntest('mutating plan interruption",
            "recovery exhaustion exactly-one-report terminal state",
        ),
        (
            "assert.equal(w.sent.length,1);assert.equal((await w.h.getState()).status,'WAITING_FOR_NEXT_ASSISTANT_FORM');});\ntest('full worker: UI-plan block",
            "assert.equal(w.sent.length,1);assert.equal((await w.h.getState()).status,'TERMINAL_REPORT_DELIVERED');});\ntest('full worker: UI-plan block",
            "terminal readiness failure terminal state",
        ),
    ]
    for old, new, label in behavior_replacements:
        behavior_text = replace_once(behavior_text, old, new, label)
    recovery_behavior.write_text(behavior_text, encoding="utf-8")

    embedded = DEST / "tests" / "terminal_avito_failure_capture_v146.test.js"
    shutil.copy2(GREEN, embedded)
    embedded_text = embedded.read_text(encoding="utf-8")
    embedded_text = replace_once(
        embedded_text,
        "const ROOT=path.resolve(process.env.AF_SOURCE_ROOT || path.join(__dirname,'..','releases','v1.0.46','v146_work'));",
        "const ROOT=path.resolve(process.env.AF_SOURCE_ROOT || path.join(__dirname,'..'));",
        "embedded GREEN self-contained source root",
    )
    embedded.write_text(embedded_text, encoding="utf-8")

    origin = {
        "schema": "avito_finder_v146_materialization_v1",
        "version": "1.0.46",
        "base_version": "1.0.45",
        "purpose": "terminal non-CAPTCHA Avito failure capture quiescence",
        "runtime_behavior_changed": ["service_worker.js"],
        "identity_only_changed": ["avito_content.js", "manifest.json"],
        "runtime_unchanged": ["recovery.js", "chatgpt_content.js", "core.js", "proxy_manager.js"],
        "test_harness_only_changed": [
            "tests/recovery_escalation_v145.test.js: post-exhaustion state expectation only",
            "tests/contract_audit_v129.test.js: rate-limit DIRECT terminal report state expectation only",
            "tests/recovery_behavior_v125.test.js: four terminal non-CAPTCHA failure state expectations only"
        ],
        "preserved_contracts": [
            "v1.0.35 finalized assistant without Writing Block remains one terminal validation outcome while prompt polling is active",
            "CAPTCHA avito_failure remains continuation-capable",
            "v1.0.44 global fail-closed Avito request gate",
            "v1.0.45 transport-only recovery escalation"
        ],
        "new_terminal_state": "TERMINAL_REPORT_DELIVERED",
        "terminal_capture_marker": "TERMINAL_REPORT_CAPTURE_QUIESCED",
        "red_authority": "releases/v1.0.46/QA/red/RED.json",
        "base_hashes": {name: sha256(BASE / name) for name in EXPECTED_BASE_HASHES},
        "materialized_hashes": {name: sha256(DEST / name) for name in EXPECTED_BASE_HASHES},
    }
    for name in ("recovery.js", "core.js", "proxy_manager.js", "chatgpt_content.js"):
        if origin["base_hashes"][name] != origin["materialized_hashes"][name]:
            raise RuntimeError(f"unexpected runtime change outside v1.0.46 scope: {name}")
    if origin["base_hashes"]["service_worker.js"] == origin["materialized_hashes"]["service_worker.js"]:
        raise RuntimeError("service_worker.js did not change")
    (DEST / "BUILD_ORIGIN_v1.0.46.json").write_text(json.dumps(origin, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(origin, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
