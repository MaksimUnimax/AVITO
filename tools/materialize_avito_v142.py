from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.41" / "v141_work"
RELEASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.42"
DEST = RELEASE / "v142_work"
GREEN_SOURCE = ROOT / "подбор авито расширение" / "v142_prepatch_tests" / "writing_block_capture_green.py"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, got {count}")
    return text.replace(old, new, 1)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    if not BASE.is_dir():
        raise SystemExit(f"missing exact v1.0.41 base: {BASE}")
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(BASE, DEST)

    manifest_path = DEST / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("version") != "1.0.41":
        raise RuntimeError(f"wrong base manifest: {manifest.get('version')}")
    manifest["version"] = "1.0.42"
    manifest["version_name"] = "1.0.42-writing-block-capture-stability-recovery"
    manifest["description"] = (
        "Avito Finder: bounded visible-UI execution with Writing Block-local capture stability, "
        "bounded payload extraction recovery, exact IP-firewall classification, bounded reload recovery, "
        "dedicated requested-tab allocation, sticky residential recovery, and manual CAPTCHA."
    )
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    avito_path = DEST / "avito_content.js"
    avito = avito_path.read_text(encoding="utf-8")
    avito = replace_once(avito, 'const ADAPTER_VERSION = "1.0.41";', 'const ADAPTER_VERSION = "1.0.42";', "Avito adapter identity")
    avito_path.write_text(avito, encoding="utf-8")

    chat_path = DEST / "chatgpt_content.js"
    chat = chat_path.read_text(encoding="utf-8")
    chat = replace_once(chat, 'const CONTENT_SCRIPT_VERSION = "0.6.18";', 'const CONTENT_SCRIPT_VERSION = "0.6.19";', "ChatGPT adapter identity")

    old_constants = '''  const PROMPT_PAYLOAD_MIN_SAMPLES = Number(globalThis.__AF_TEST_PROMPT_PAYLOAD_MIN_SAMPLES ?? 3);\n  const PROMPT_ACTIVE_RECHECK_MS = 750;'''
    new_constants = '''  const PROMPT_PAYLOAD_MIN_SAMPLES = Number(globalThis.__AF_TEST_PROMPT_PAYLOAD_MIN_SAMPLES ?? 3);\n  // v1.0.42: local Writing Block extraction can transiently disappear while the\n  // same block and local Copy control remain valid. Retry that payload read without\n  // erasing the already-proven structural candidate, but never poll forever.\n  const PROMPT_PAYLOAD_EXTRACTION_MAX_MISSES = Number(globalThis.__AF_TEST_PROMPT_PAYLOAD_EXTRACTION_MAX_MISSES ?? 8);\n  const PROMPT_PAYLOAD_EXTRACTION_TIMEOUT_MS = Number(globalThis.__AF_TEST_PROMPT_PAYLOAD_EXTRACTION_TIMEOUT_MS ?? 8000);\n  const PROMPT_ACTIVE_RECHECK_MS = 750;'''
    chat = replace_once(chat, old_constants, new_constants, "payload extraction budget constants")

    old_signature = '''  function writingBlockStructuralSignature(anchorTurnId, assistant, blockId, copy) {\n    const controls = (copy?.buttons || []).map((button) => [\n      button.tag || "", button.testid || "", button.aria || "", button.title || "", button.svg || "", button.enabled === true ? "1" : "0"\n    ].join(":"));\n    return [\n      anchorTurnId || "",\n      assistant?.getAttribute("data-turn-id") || "",\n      blockId || "",\n      copy?.writing_block === true ? "writing-block" : "no-writing-block",\n      copy?.ready === true ? "copy-ready" : "copy-pending",\n      copy?.mode || "",\n      controls.join("|")\n    ].join("||");\n  }'''
    new_signature = '''  function writingBlockStructuralSignature(anchorTurnId, assistant, blockId, copy) {\n    // Writing Block stability is local to the block identity and its own Copy\n    // readiness. Unrelated assistant-turn buttons are diagnostic data only and\n    // must not restart the command-finality gate when they mutate.\n    return [\n      anchorTurnId || "",\n      assistant?.getAttribute("data-turn-id") || "",\n      blockId || "",\n      copy?.writing_block === true ? "writing-block" : "no-writing-block",\n      copy?.ready === true ? "copy-ready" : "copy-pending",\n      copy?.mode || ""\n    ].join("||");\n  }'''
    chat = replace_once(chat, old_signature, new_signature, "Writing Block structural signature")

    old_empty = '''      if (candidate.payload_extracted !== true || Core.normalizeText(candidate.prompt_text || "").length === 0) {\n        candidate.rejection_reason = "EMPTY_WRITING_BLOCK_PAYLOAD_IGNORED";\n        recordDiagnostic("PROMPT_EMPTY_WRITING_BLOCK_IGNORED", candidate);\n        // An empty renderer shell is not a command and must never create a same-chat\n        // validator report or replace the current anchor. Recheck after the DOM settles.\n        candidateFirstSeen = null;\n        schedulePromptCheck(PROMPT_ACTIVE_RECHECK_MS, false, generation);\n        return;\n      }\n\n      // v1.0.34: Copy readiness and toolbar stability do not prove body finality.'''
    new_empty = '''      if (candidate.payload_extracted !== true || Core.normalizeText(candidate.prompt_text || "").length === 0) {\n        const extractionNow = Date.now();\n        const priorMissCount = Number(candidateFirstSeen?.payload_extraction_miss_count || 0);\n        const missStartedAt = Number(candidateFirstSeen?.payload_extraction_miss_started_ms || extractionNow);\n        const missCount = priorMissCount + 1;\n        // Preserve the structural proof for this exact assistant turn/block. A\n        // transient empty local-body read is a payload-layer retry, not a new DOM\n        // candidate. This is the v1.0.41 live-livelock boundary.\n        candidateFirstSeen = {\n          ...(candidateFirstSeen || {}),\n          structural_signature: candidate.structural_signature,\n          first_seen_ms: candidateFirstSeen?.first_seen_ms || extractionNow,\n          payload_extraction_miss_count: missCount,\n          payload_extraction_miss_started_ms: missStartedAt\n        };\n        candidate.payload_extraction_miss_count = missCount;\n        candidate.payload_extraction_elapsed_ms = Math.max(0, extractionNow - missStartedAt);\n        candidate.rejection_reason = "EMPTY_WRITING_BLOCK_PAYLOAD_RETRY";\n        const exhausted = missCount >= PROMPT_PAYLOAD_EXTRACTION_MAX_MISSES ||\n          candidate.payload_extraction_elapsed_ms >= PROMPT_PAYLOAD_EXTRACTION_TIMEOUT_MS;\n        if (exhausted) {\n          candidate.rejection_reason = "WRITING_BLOCK_LOCAL_BODY_UNAVAILABLE_BOUNDED";\n          recordDiagnostic("PROMPT_PAYLOAD_EXTRACTION_FAILED_BOUNDED", candidate);\n          showStatus(\n            "Avito Finder: FAILED_WITH_EXACT_REASON — Writing Block найден, но его локальный текст недоступен после ограниченного числа повторов. На Avito ничего не выполнялось.",\n            "error"\n          );\n          stopPromptPolling(generation);\n          return;\n        }\n        recordDiagnostic("PROMPT_PAYLOAD_EXTRACTION_RETRY", candidate);\n        schedulePromptCheck(PROMPT_PAYLOAD_SAMPLE_MS, false, generation);\n        return;\n      }\n\n      if (candidateFirstSeen) {\n        candidateFirstSeen.payload_extraction_miss_count = 0;\n        candidateFirstSeen.payload_extraction_miss_started_ms = 0;\n      }\n\n      // v1.0.34: Copy readiness and toolbar stability do not prove body finality.'''
    chat = replace_once(chat, old_empty, new_empty, "empty payload retry state machine")

    old_diag = '''      payload_extraction_error: candidate?.payload_extraction_error || "",\n      response_kind: candidate?.response_kind || "",'''
    new_diag = '''      payload_extraction_error: candidate?.payload_extraction_error || "",\n      payload_extraction_miss_count: Number.isInteger(candidate?.payload_extraction_miss_count) ? candidate.payload_extraction_miss_count : 0,\n      payload_extraction_elapsed_ms: Number.isFinite(candidate?.payload_extraction_elapsed_ms) ? candidate.payload_extraction_elapsed_ms : 0,\n      response_kind: candidate?.response_kind || "",'''
    chat = replace_once(chat, old_diag, new_diag, "payload retry diagnostic fields")
    chat_path.write_text(chat, encoding="utf-8")

    worker_path = DEST / "service_worker.js"
    worker = worker_path.read_text(encoding="utf-8")
    worker = replace_once(worker, 'const CAPTURE_VERSION = "0.6.18";', 'const CAPTURE_VERSION = "0.6.19";', "Worker capture adapter identity")
    worker_path.write_text(worker, encoding="utf-8")

    # Version-only assertions in inherited regression tests must follow the
    # materialized release identity; all behavioral assertions remain byte-for-byte
    # inherited. Node diagnostics proved these were the only stale 1.0.41 refs.
    version_test_specs = [
        (
            DEST / "tests" / "ip_block_ui_plan_recovery_v124.test.js",
            'test("v1.0.41 is the unified recovery build", () => {',
            'test("v1.0.42 retains the unified recovery build", () => {',
            'assert.equal(manifest.version, "1.0.41");',
            'assert.equal(manifest.version, "1.0.42");',
        ),
        (
            DEST / "tests" / "ip_block_verified_egress_v123.test.js",
            'test("v1.0.41 retains bounded diagnostic host permissions without all-URL access", () => {',
            'test("v1.0.42 retains bounded diagnostic host permissions without all-URL access", () => {',
            'assert.equal(manifest.version, "1.0.41");',
            'assert.equal(manifest.version, "1.0.42");',
        ),
        (
            DEST / "tests" / "traffic_lite_zero_media.test.js",
            'test("v1.0.41 preserves zero-media Traffic Lite alongside unified recovery", () => {',
            'test("v1.0.42 preserves zero-media Traffic Lite alongside unified recovery", () => {',
            'assert.equal(manifest.version, "1.0.41");',
            'assert.equal(manifest.version, "1.0.42");',
        ),
        (
            DEST / "tests" / "proxy_recovery_integrity_v137.test.js",
            None,
            None,
            "assert.equal(manifest.version,'1.0.41');",
            "assert.equal(manifest.version,'1.0.42');",
        ),
    ]
    for path, old_label, new_label, old_assert, new_assert in version_test_specs:
        text = path.read_text(encoding="utf-8")
        if old_label is not None:
            text = replace_once(text, old_label, new_label, f"{path.name} release label")
        text = replace_once(text, old_assert, new_assert, f"{path.name} manifest identity")
        path.write_text(text, encoding="utf-8")

    form_gate_path = DEST / "tests" / "v135_prompt_form_terminal_gate.test.py"
    form_gate = form_gate_path.read_text(encoding="utf-8")
    form_gate = replace_once(form_gate, 'assert \'"version": "1.0.41"\' in manifest', 'assert \'"version": "1.0.42"\' in manifest', "Form-gate manifest identity expectation")
    form_gate = replace_once(form_gate, "print('v1.0.41 prompt form terminal gate PASS')", "print('v1.0.42 prompt form terminal gate PASS')", "Form-gate release label")
    form_gate_path.write_text(form_gate, encoding="utf-8")

    target_test = DEST / "tests" / "writing_block_capture_v142.py"
    shutil.copy2(GREEN_SOURCE, target_test)

    test_only_changed = [
        "tests/v135_prompt_form_terminal_gate.test.py",
        "tests/ip_block_ui_plan_recovery_v124.test.js",
        "tests/ip_block_verified_egress_v123.test.js",
        "tests/proxy_recovery_integrity_v137.test.js",
        "tests/traffic_lite_zero_media.test.js",
        "tests/writing_block_capture_v142.py",
    ]
    origin = {
        "schema": "avito_finder_v142_materialization_v3",
        "version": "1.0.42",
        "base_version": "1.0.41",
        "production_runtime_changed": ["chatgpt_content.js", "service_worker.js", "avito_content.js", "manifest.json"],
        "runtime_behavior_changed": ["chatgpt_content.js"],
        "identity_only_changed": ["service_worker.js", "avito_content.js", "manifest.json"],
        "test_only_changed": test_only_changed,
        "service_worker_behavior_delta": "CAPTURE_VERSION 0.6.18 -> 0.6.19 only",
        "service_worker_byte_identical_to_v141": sha256(DEST / "service_worker.js") == sha256(BASE / "service_worker.js"),
        "proxy_manager_byte_identical_to_v141": sha256(DEST / "proxy_manager.js") == sha256(BASE / "proxy_manager.js"),
        "capture_contract": {
            "transient_payload_miss_preserves_structural_candidate": True,
            "payload_retry_is_bounded": True,
            "unrelated_assistant_controls_excluded_from_structural_signature": True,
            "payload_fingerprint_stability_retained": True,
            "ordinary_markdown_remains_non_executable": True,
            "worker_capture_identity_matches_adapter": True,
        },
        "base_chatgpt_content_sha256": sha256(BASE / "chatgpt_content.js"),
        "materialized_chatgpt_content_sha256": sha256(DEST / "chatgpt_content.js"),
        "base_service_worker_sha256": sha256(BASE / "service_worker.js"),
        "materialized_service_worker_sha256": sha256(DEST / "service_worker.js"),
    }
    if origin["service_worker_byte_identical_to_v141"]:
        raise RuntimeError("service_worker identity did not advance with chat capture adapter")
    (DEST / "BUILD_ORIGIN_v1.0.42.json").write_text(json.dumps(origin, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(origin, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
