from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.42" / "v142_work"
RELEASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.43"
DEST = RELEASE / "v143_work"
GREEN_SOURCE = ROOT / "подбор авито расширение" / "v143_prepatch_tests" / "ip_recovery_terminal_evidence_green.test.js"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


def main() -> None:
    if not BASE.is_dir():
        raise SystemExit(f"missing exact v1.0.42 base: {BASE}")
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(BASE, DEST)

    manifest_path = DEST / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("version") != "1.0.42":
        raise RuntimeError(f"wrong base manifest: {manifest.get('version')}")
    manifest["version"] = "1.0.43"
    manifest["version_name"] = "1.0.43-ip-recovery-evidence-preservation"
    manifest["description"] = (
        "Avito Finder: bounded visible-UI execution with exact IP-firewall classification, "
        "bounded connection recovery and evidence-preserving terminal diagnostics, "
        "Writing Block-local capture stability, dedicated requested-tab allocation, "
        "sticky residential recovery and manual CAPTCHA."
    )
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    avito_path = DEST / "avito_content.js"
    avito = avito_path.read_text(encoding="utf-8")
    avito = replace_once(avito, 'const ADAPTER_VERSION = "1.0.42";', 'const ADAPTER_VERSION = "1.0.43";', "Avito adapter identity")
    avito_path.write_text(avito, encoding="utf-8")

    worker_path = DEST / "service_worker.js"
    worker = worker_path.read_text(encoding="utf-8")
    start = worker.index("function avitoRuntimeFailureReport(state, reason) {")
    end = worker.index("\nasync function returnAvitoRuntimeFailureToPinnedChat", start)
    new_fn = r'''function avitoRuntimeFailureReport(state, reason) {
  const recovery = state?.connection_recovery || {};
  const prepared = recovery?.prepared || {};
  const create = recovery?.create || prepared?.endpoint_create || null;
  const rotation = recovery?.provider_rotation || null;
  const before = prepared?.probe_before || null;
  const after = prepared?.probe_after || null;
  const beforeError = prepared?.probe_before_error || null;
  const afterError = prepared?.probe_after_error || null;
  const transport = prepared?.transport_status || null;
  const probeKnown = Boolean(before || after || beforeError || afterError || transport);
  const probeStatus = prepared?.probe_ip_changed === true ? "смена IP подтверждена" : "без подтверждённой смены IP";
  const probeLine = probeKnown
    ? `IP probe: ${before || "—"} → ${after || "—"}; ${probeStatus}.`
    : "IP probe: данных нет.";
  const probeErrors = [beforeError ? `before=${beforeError}` : "", afterError ? `after=${afterError}` : ""].filter(Boolean).join("; ");
  const transportLine = `Транспорт: ${transport || "UNKNOWN"}${probeErrors ? `; ошибки: ${probeErrors}` : ""}.`;
  const createLine = create
    ? `Endpoint/create: ${create.state || "UNKNOWN"}${Number.isFinite(Number(create.attempt)) ? `; попытка ${Number(create.attempt)}` : ""}${create.reason ? `; причина: ${create.reason}` : ""}.`
    : "Endpoint/create: данных нет.";
  const rotationLine = rotation
    ? `Provider rotation: ${rotation.state || "UNKNOWN"}${Number.isFinite(Number(rotation.attempt)) ? `; попытка ${Number(rotation.attempt)}` : ""}${rotation.ip_change_proven === true ? "; смена IP доказана" : "; смена IP не доказана"}.`
    : "Provider rotation: данных нет.";
  return [
    "Avito Finder: действие на Avito остановлено безопасно.",
    "",
    `Задача: ${state.search_id || "?"}`,
    `Этап: ${state.phase || "AVITO_TASK"}`,
    `Причина: ${reason || "AVITO_TASK_FAILED"}`,
    "",
    `Автоматические попытки восстановления: ${Number(state.connection_recovery?.attempt || state.avito_ip_block_reload_count || 0)}. Повтор мутаций запрещён.`,
    probeLine,
    transportLine,
    createLine,
    rotationLine,
    `Сохранённый курсор очереди: ${state.sequential_review?.cursor ?? "не используется"}; карточек прочитано: ${state.sequential_review?.details?.length ?? 0}.`,
    `Версия: ${chrome.runtime.getManifest().version}. Смена IP Avito не заявляется без отдельного доказательства.`,
    "Расширение вернуло этот отчёт в тот же чат и продолжает ожидать следующую форму."
  ].join("\n");
}'''
    worker = worker[:start] + new_fn + worker[end:]
    if worker.count("function avitoRuntimeFailureReport(state, reason) {") != 1:
        raise RuntimeError("runtime failure report replacement corrupted function count")
    worker_path.write_text(worker, encoding="utf-8")

    # Advance only version-specific regression expectations; behavior assertions stay unchanged.
    version_test_paths = [
        DEST / "tests" / "v135_prompt_form_terminal_gate.test.py",
        DEST / "tests" / "ip_block_ui_plan_recovery_v124.test.js",
        DEST / "tests" / "ip_block_verified_egress_v123.test.js",
        DEST / "tests" / "proxy_recovery_integrity_v137.test.js",
        DEST / "tests" / "traffic_lite_zero_media.test.js",
    ]
    for p in version_test_paths:
        text = p.read_text(encoding="utf-8")
        text = text.replace('1.0.42', '1.0.43')
        p.write_text(text, encoding="utf-8")

    # The grouped harness had a 30s external kill for popup_lifecycle while the
    # unchanged v1.0.42 baseline itself takes 29.608s in the same runner. The
    # v1.0.43 popup.js/html are byte-identical. Widen only the outer process
    # deadline to 45s; the popup assertions and production code are unchanged.
    # Evidence: releases/v1.0.43/QA/popup_timeout_diagnostic.json.
    runner_path = DEST / "tests" / "run_all_v136.py"
    runner = runner_path.read_text(encoding="utf-8")
    runner = replace_once(
        runner,
        "('popup_lifecycle','v129/browser_popup_lifecycle.py','AF_POPUP_LIFECYCLE_REPORT',30)",
        "('popup_lifecycle','v129/browser_popup_lifecycle.py','AF_POPUP_LIFECYCLE_REPORT',45)",
        "popup lifecycle outer process deadline",
    )
    runner_path.write_text(runner, encoding="utf-8")

    shutil.copy2(GREEN_SOURCE, DEST / "tests" / "ip_recovery_terminal_evidence_v143.test.js")

    origin = {
        "schema": "avito_finder_v143_materialization_v2",
        "version": "1.0.43",
        "base_version": "1.0.42",
        "purpose": "preserve exact IP recovery evidence in terminal failure report; no recovery behavior change",
        "runtime_behavior_changed": ["service_worker.js"],
        "identity_only_changed": ["avito_content.js", "manifest.json"],
        "runtime_unchanged": ["chatgpt_content.js", "core.js", "proxy_manager.js", "recovery.js"],
        "test_harness_only_changed": ["tests/run_all_v136.py popup_lifecycle external deadline 30s -> 45s"],
        "popup_timeout_diagnostic": "releases/v1.0.43/QA/popup_timeout_diagnostic.json",
        "recovery_behavior_changed": False,
        "terminal_report_behavior_changed": True,
        "capture_version_unchanged": "0.6.19",
        "red_authority": "releases/v1.0.43/QA/red/RED.json",
        "base_service_worker_sha256": sha256(BASE / "service_worker.js"),
        "materialized_service_worker_sha256": sha256(DEST / "service_worker.js"),
        "base_proxy_manager_sha256": sha256(BASE / "proxy_manager.js"),
        "materialized_proxy_manager_sha256": sha256(DEST / "proxy_manager.js"),
        "base_chatgpt_content_sha256": sha256(BASE / "chatgpt_content.js"),
        "materialized_chatgpt_content_sha256": sha256(DEST / "chatgpt_content.js"),
    }
    if origin["base_proxy_manager_sha256"] != origin["materialized_proxy_manager_sha256"]:
        raise RuntimeError("proxy_manager unexpectedly changed")
    if origin["base_chatgpt_content_sha256"] != origin["materialized_chatgpt_content_sha256"]:
        raise RuntimeError("chatgpt_content unexpectedly changed")
    if origin["base_service_worker_sha256"] == origin["materialized_service_worker_sha256"]:
        raise RuntimeError("service_worker evidence patch did not materialize")
    (DEST / "BUILD_ORIGIN_v1.0.43.json").write_text(json.dumps(origin, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(origin, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
