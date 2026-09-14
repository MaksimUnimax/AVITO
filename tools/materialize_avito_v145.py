from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.44" / "v144_work"
RELEASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.45"
DEST = RELEASE / "v145_work"
GREEN = ROOT / "подбор авито расширение" / "v145_prepatch_tests" / "recovery_escalation_green.test.js"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, got {count}")
    return text.replace(old, new, 1)


def main() -> None:
    if not BASE.is_dir():
        raise SystemExit(f"missing exact v1.0.44 source: {BASE}")
    manifest = json.loads((BASE / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != "1.0.44":
        raise RuntimeError(f"wrong base manifest: {manifest.get('version')}")

    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(BASE, DEST)

    manifest_path = DEST / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["version"] = "1.0.45"
    manifest["version_name"] = "1.0.45-transport-recovery-escalation"
    manifest["description"] = (
        "Avito Finder: transport recovery escalates internally without retrying Avito until a new measured egress is proven; "
        "preserves the v1.0.44 global fail-closed Avito request gate, bounded provider mutation, queue/cursor and CAPTCHA boundaries."
    )
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    avito_path = DEST / "avito_content.js"
    avito = replace_once(
        avito_path.read_text(encoding="utf-8"),
        'const ADAPTER_VERSION = "1.0.44";',
        'const ADAPTER_VERSION = "1.0.45";',
        "adapter version",
    )
    avito_path.write_text(avito, encoding="utf-8")

    worker_path = DEST / "service_worker.js"
    worker = worker_path.read_text(encoding="utf-8")
    old = """    const prepared=await prepareRecoveryProxy(current,(await getState()).connection_recovery,controller.signal);\n    current=await assertCurrentOperation(current);\n    if(controller.signal.aborted || Date.now()>=record.deadline_at) throw new Error('AVITO_RECOVERY_DEADLINE_EXCEEDED');\n    const freshTab=await getTab(tab.id);"""
    new = """    const prepared=await prepareRecoveryProxy(current,(await getState()).connection_recovery,controller.signal);\n    current=await assertCurrentOperation(current);\n    if(controller.signal.aborted || Date.now()>=record.deadline_at) throw new Error('AVITO_RECOVERY_DEADLINE_EXCEEDED');\n    current=await saveState({...current,connection_recovery:{...current.connection_recovery,phase:'EGRESS_EVIDENCE_READY',resume_after:null,prepared},avito_network_authority:Recovery.applyAvitoEgressEvidence(current.avito_network_authority,prepared),avito_ip_block_reload_count:record.attempt});\n    const requestAuthority=Recovery.avitoRequestAuthority(current);\n    if(requestAuthority.allowed!==true) {\n      let nextRecord;\n      try { nextRecord=Recovery.reserveAttempt(current.connection_recovery,Date.now()); }\n      catch(error) { throw error; }\n      await log('AVITO_RECOVERY_ESCALATED_WITHOUT_TARGET_REQUEST',{search_id:current.search_id,operation_id:key,tab_id:tab.id,from_attempt:record.attempt,to_attempt:nextRecord.attempt,interruption_kind:interruptionKind,transport_status:prepared?.transport_status||null,probe_before:prepared?.probe_before||null,probe_after:prepared?.probe_after||null,probe_ip_changed:prepared?.probe_ip_changed===true,target_requests_issued:0});\n      return performReservedConnectionRecoveryInsideLane(current,tab,previousTimeOrigin,source,continuation,interruptionKind,nextRecord);\n    }\n    const freshTab=await getTab(tab.id);"""
    worker = replace_once(worker, old, new, "internal transport escalation before target request")
    worker_path.write_text(worker, encoding="utf-8")

    version_tests = [
        DEST / "tests" / "v135_prompt_form_terminal_gate.test.py",
        DEST / "tests" / "ip_block_ui_plan_recovery_v124.test.js",
        DEST / "tests" / "ip_block_verified_egress_v123.test.js",
        DEST / "tests" / "proxy_recovery_integrity_v137.test.js",
        DEST / "tests" / "traffic_lite_zero_media.test.js",
    ]
    for path in version_tests:
        if path.exists():
            path.write_text(path.read_text(encoding="utf-8").replace("1.0.44", "1.0.45"), encoding="utf-8")

    embedded = DEST / "tests" / "recovery_escalation_v145.test.js"
    shutil.copy2(GREEN, embedded)
    embedded_text = embedded.read_text(encoding="utf-8")
    embedded_text = replace_once(
        embedded_text,
        "const ROOT=path.resolve(process.env.AF_SOURCE_ROOT || path.join(__dirname,'..','releases','v1.0.45','v145_work'));",
        "const ROOT=path.resolve(process.env.AF_SOURCE_ROOT || path.join(__dirname,'..'));",
        "embedded GREEN self-contained source root",
    )
    embedded.write_text(embedded_text, encoding="utf-8")

    origin = {
        "schema": "avito_finder_v145_materialization_v1",
        "version": "1.0.45",
        "base_version": "1.0.44",
        "purpose": "bounded transport recovery escalation without target Avito retry",
        "runtime_behavior_changed": ["service_worker.js"],
        "identity_only_changed": ["avito_content.js", "manifest.json"],
        "runtime_unchanged": ["recovery.js", "chatgpt_content.js", "core.js", "proxy_manager.js"],
        "preserved_v144_global_request_gate": True,
        "internal_escalation_marker": "AVITO_RECOVERY_ESCALATED_WITHOUT_TARGET_REQUEST",
        "red_authority": "releases/v1.0.45/QA/red/RED.json",
        "base_service_worker_sha256": sha256(BASE / "service_worker.js"),
        "materialized_service_worker_sha256": sha256(DEST / "service_worker.js"),
        "base_recovery_sha256": sha256(BASE / "recovery.js"),
        "materialized_recovery_sha256": sha256(DEST / "recovery.js"),
        "base_core_sha256": sha256(BASE / "core.js"),
        "materialized_core_sha256": sha256(DEST / "core.js"),
        "base_proxy_manager_sha256": sha256(BASE / "proxy_manager.js"),
        "materialized_proxy_manager_sha256": sha256(DEST / "proxy_manager.js"),
        "base_chatgpt_content_sha256": sha256(BASE / "chatgpt_content.js"),
        "materialized_chatgpt_content_sha256": sha256(DEST / "chatgpt_content.js"),
    }
    for name in ("recovery", "core", "proxy_manager", "chatgpt_content"):
        if origin[f"base_{name}_sha256"] != origin[f"materialized_{name}_sha256"]:
            raise RuntimeError(f"unexpected runtime change outside v1.0.45 scope: {name}")
    (DEST / "BUILD_ORIGIN_v1.0.45.json").write_text(json.dumps(origin, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(origin, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
