from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.43" / "v143_work"
RELEASE = ROOT / "подбор авито расширение" / "releases" / "v1.0.44"
DEST = RELEASE / "v144_work"
GREEN = ROOT / "подбор авито расширение" / "v144_prepatch_tests" / "global_avito_request_authority_green.test.js"


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected one match, got {n}")
    return text.replace(old, new, 1)


def main() -> None:
    if not BASE.is_dir():
        raise SystemExit(f"missing exact v1.0.43 source: {BASE}")
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(BASE, DEST)

    manifest_path = DEST / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("version") != "1.0.43":
        raise RuntimeError(f"wrong base manifest: {manifest.get('version')}")
    manifest["version"] = "1.0.44"
    manifest["version_name"] = "1.0.44-global-avito-request-authority"
    manifest["description"] = (
        "Avito Finder: fail-closed global Avito network request authority after IP/rate/transport blocks; "
        "new Avito requests require measured complete egress change, with preserved queue/cursor, "
        "Writing Block capture, sticky residential recovery and manual CAPTCHA boundaries."
    )
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    avito_path = DEST / "avito_content.js"
    avito = replace_once(
        avito_path.read_text(encoding="utf-8"),
        'const ADAPTER_VERSION = "1.0.43";',
        'const ADAPTER_VERSION = "1.0.44";',
        "adapter version",
    )
    avito_path.write_text(avito, encoding="utf-8")

    recovery_path = DEST / "recovery.js"
    recovery = recovery_path.read_text(encoding="utf-8")
    marker = "  function pacMatches(effective, config) {"
    gate = r'''  function beginBlockedEgressEpoch(previous = null, kind = null, attempt = 0, now = Date.now()) {
    const prior = previous && typeof previous === 'object' ? previous : {};
    const egressEpoch = Number.isSafeInteger(Number(prior.egress_epoch)) ? Number(prior.egress_epoch) : 0;
    const priorBlocked = Number.isSafeInteger(Number(prior.blocked_egress_epoch)) ? Number(prior.blocked_egress_epoch) : 0;
    const blockedEpoch = Math.max(egressEpoch, priorBlocked) + 1;
    return {
      blocked: true,
      blocked_reason: String(kind || 'NETWORK_BLOCK'),
      blocked_at: now,
      blocked_attempt: Number(attempt || 0),
      blocked_egress_epoch: blockedEpoch,
      egress_epoch: egressEpoch,
      egress_change_confirmed: false,
      transport_status: null,
      probe_before: null,
      probe_after: null,
      probe_ip_changed: false
    };
  }
  function applyAvitoEgressEvidence(authority, prepared = {}, now = Date.now()) {
    const base = authority && typeof authority === 'object' ? authority : beginBlockedEgressEpoch(null, 'NETWORK_BLOCK', 0, now);
    const before = String(prepared?.probe_before || '').trim() || null;
    const after = String(prepared?.probe_after || '').trim() || null;
    const transport = String(prepared?.transport_status || '').trim() || null;
    const measuredChanged = Boolean(transport === 'PROBES_COMPLETE' && before && after && before !== after && prepared?.probe_ip_changed === true);
    const blockedEpoch = Number(base.blocked_egress_epoch || 0);
    const priorEgress = Number(base.egress_epoch || 0);
    const nextEgress = measuredChanged ? Math.max(priorEgress + 1, blockedEpoch + 1) : priorEgress;
    return {
      ...base,
      evidence_at: now,
      transport_status: transport,
      probe_before: before,
      probe_after: after,
      probe_ip_changed: measuredChanged,
      egress_change_confirmed: measuredChanged,
      egress_epoch: nextEgress
    };
  }
  function avitoRequestAuthority(state = {}) {
    const gate = state?.avito_network_authority;
    if (!gate || gate.blocked !== true) return {allowed:true, reason:'NO_BLOCKED_EGRESS'};
    const prepared = state?.connection_recovery?.prepared || {};
    const before = String(prepared?.probe_before || gate.probe_before || '').trim() || null;
    const after = String(prepared?.probe_after || gate.probe_after || '').trim() || null;
    const transport = String(prepared?.transport_status || gate.transport_status || '').trim() || null;
    const measuredChanged = Boolean(transport === 'PROBES_COMPLETE' && before && after && before !== after && (prepared?.probe_ip_changed === true || gate.probe_ip_changed === true));
    const epochAdvanced = Number(gate.egress_epoch || 0) > Number(gate.blocked_egress_epoch || 0);
    const confirmed = gate.egress_change_confirmed === true && measuredChanged && epochAdvanced;
    return {
      allowed: confirmed,
      reason: confirmed ? 'EGRESS_CHANGE_CONFIRMED' : 'AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE',
      blocked_reason: gate.blocked_reason || null,
      blocked_egress_epoch: Number(gate.blocked_egress_epoch || 0),
      egress_epoch: Number(gate.egress_epoch || 0),
      transport_status: transport,
      probe_before: before,
      probe_after: after,
      egress_change_confirmed: confirmed
    };
  }
'''
    recovery = replace_once(recovery, marker, gate + marker, "insert global authority functions")
    old_return = "return Object.freeze({VERSION,MAX_ATTEMPTS,RECOVERY_BUDGET_MS,RATE_LIMIT_RECOVERY_BUDGET_MS,RATE_LIMIT_BACKOFF_MS,recoveryBudgetMs,rateLimitBackoffMs,retryAfterTime,replayPolicy,interruption,operationKey,sameOperation,isCancelled,freshRecovery,reserveAttempt,serialLane,singleFlight,deadline,fetchBounded,pacMatches,redactedError});"
    new_return = "return Object.freeze({VERSION,MAX_ATTEMPTS,RECOVERY_BUDGET_MS,RATE_LIMIT_RECOVERY_BUDGET_MS,RATE_LIMIT_BACKOFF_MS,recoveryBudgetMs,rateLimitBackoffMs,retryAfterTime,replayPolicy,interruption,operationKey,sameOperation,isCancelled,freshRecovery,reserveAttempt,serialLane,singleFlight,deadline,fetchBounded,beginBlockedEgressEpoch,applyAvitoEgressEvidence,avitoRequestAuthority,pacMatches,redactedError});"
    recovery = replace_once(recovery, old_return, new_return, "export authority functions")
    recovery_path.write_text(recovery, encoding="utf-8")

    worker_path = DEST / "service_worker.js"
    worker = worker_path.read_text(encoding="utf-8")
    old_wrappers = '''const tabsQuery = (query) => cb((done) => chrome.tabs.query(query, done));
const tabsGet = (tabId) => cb((done) => chrome.tabs.get(tabId, done));
const tabsUpdate = (tabId, props) => cb((done) => chrome.tabs.update(tabId, props, done));
const tabsReload = (tabId, props = {}) => cb((done) => chrome.tabs.reload(tabId, props, done));
const tabsCreate = (props) => cb((done) => chrome.tabs.create(props, done));'''
    new_wrappers = '''const tabsQuery = (query) => cb((done) => chrome.tabs.query(query, done));
const tabsGet = (tabId) => cb((done) => chrome.tabs.get(tabId, done));
const tabsUpdate = async (tabId, props) => {
  if (props?.url && Core.isAvitoUrl(String(props.url))) await assertAvitoNetworkRequestAuthorized('tabs.update', tabId, String(props.url));
  return cb((done) => chrome.tabs.update(tabId, props, done));
};
const tabsReload = async (tabId, props = {}) => {
  const current = await tabsGet(tabId);
  if (Core.isAvitoUrl(String(current?.url || current?.pendingUrl || ''))) await assertAvitoNetworkRequestAuthorized('tabs.reload', tabId, String(current?.url || current?.pendingUrl || ''));
  return cb((done) => chrome.tabs.reload(tabId, props, done));
};
const tabsCreate = async (props) => {
  if (props?.url && Core.isAvitoUrl(String(props.url))) await assertAvitoNetworkRequestAuthorized('tabs.create', null, String(props.url));
  return cb((done) => chrome.tabs.create(props, done));
};'''
    worker = replace_once(worker, old_wrappers, new_wrappers, "guard low-level Avito tab network primitives")

    gettab = "async function getTab(tabId) { try { return await tabsGet(tabId); } catch (_) { return null; } }"
    helper = r'''async function getTab(tabId) { try { return await tabsGet(tabId); } catch (_) { return null; } }
async function assertAvitoNetworkRequestAuthorized(action, tabId, targetUrl) {
  const state = await getState();
  const authority = Recovery.avitoRequestAuthority(state);
  if (authority.allowed) return authority;
  await log('AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE', {
    search_id: state.search_id || null,
    operation_id: Recovery.operationKey(state),
    action,
    tab_id: tabId ?? null,
    target_url: targetUrl || null,
    blocked_reason: authority.blocked_reason || null,
    blocked_egress_epoch: authority.blocked_egress_epoch,
    egress_epoch: authority.egress_epoch,
    transport_status: authority.transport_status || null,
    probe_before: authority.probe_before || null,
    probe_after: authority.probe_after || null,
    egress_change_confirmed: false
  });
  throw new Error('AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE');
}'''
    worker = replace_once(worker, gettab, helper, "insert common request authority assertion")

    reserve_state = "current=await saveState({...current,connection_recovery:record,avito_ip_block_reload_count:record.attempt});"
    reserve_state_guarded = "current=await saveState({...current,connection_recovery:record,avito_network_authority:Recovery.beginBlockedEgressEpoch(current.avito_network_authority,interruptionKind,record.attempt),avito_ip_block_reload_count:record.attempt});"
    worker = replace_once(worker, reserve_state, reserve_state_guarded, "close Avito request authority immediately when network block is registered")

    old_entry = "current=await saveState({...current,status:'RECOVERING_AVITO_CONNECTION',phase:'AVITO_CONNECTION_RECOVERY',connection_recovery:{...record,phase:'PREPARING',resume_after:null,continuation:continuation||record.continuation||null,source:source||record.source||null,previous_time_origin:Number(previousTimeOrigin||record.previous_time_origin||0),interruption_kind:interruptionKind||record.interruption_kind||'IP_BLOCK'},avito_ip_block_reload_count:record.attempt});"
    new_entry = "current=await saveState({...current,status:'RECOVERING_AVITO_CONNECTION',phase:'AVITO_CONNECTION_RECOVERY',connection_recovery:{...record,phase:'PREPARING',resume_after:null,continuation:continuation||record.continuation||null,source:source||record.source||null,previous_time_origin:Number(previousTimeOrigin||record.previous_time_origin||0),interruption_kind:interruptionKind||record.interruption_kind||'IP_BLOCK'},avito_network_authority:(current.avito_network_authority?.blocked===true?current.avito_network_authority:Recovery.beginBlockedEgressEpoch(current.avito_network_authority,interruptionKind||record.interruption_kind||'IP_BLOCK',record.attempt)),avito_ip_block_reload_count:record.attempt});"
    worker = replace_once(worker, old_entry, new_entry, "preserve immediate blocked epoch on recovery execution/resume")

    old_rate = "const prepared=interruptionKind==='RATE_LIMIT' ? {strategy:'COOLDOWN_SAME_ROUTE',probe_ip_changed:false,avito_exit_ip_verified:false} : await prepareRecoveryProxy(current,(await getState()).connection_recovery,controller.signal);"
    new_rate = "const prepared=await prepareRecoveryProxy(current,(await getState()).connection_recovery,controller.signal);"
    worker = replace_once(worker, old_rate, new_rate, "rate limit must recover and verify egress")

    old_state = "connection_recovery:{...current.connection_recovery,phase:'AWAITING_FRESH_DOCUMENT',resume_after:null,prepared},avito_navigation_expected:false"
    new_state = "connection_recovery:{...current.connection_recovery,phase:'AWAITING_FRESH_DOCUMENT',resume_after:null,prepared},avito_network_authority:Recovery.applyAvitoEgressEvidence(current.avito_network_authority,prepared),avito_navigation_expected:false"
    worker = replace_once(worker, old_state, new_state, "persist measured egress authority before network action")

    export_old = "log,patchProxyDiagnostics,applyProxyProfileInternal,prepareRecoveryProxy,restoreInterruptedProxyTransaction,"
    export_new = "log,patchProxyDiagnostics,applyProxyProfileInternal,prepareRecoveryProxy,restoreInterruptedProxyTransaction,assertAvitoNetworkRequestAuthorized,"
    worker = replace_once(worker, export_old, export_new, "test export request authority assertion")
    worker_path.write_text(worker, encoding="utf-8")

    version_tests = [
        DEST / "tests" / "v135_prompt_form_terminal_gate.test.py",
        DEST / "tests" / "ip_block_ui_plan_recovery_v124.test.js",
        DEST / "tests" / "ip_block_verified_egress_v123.test.js",
        DEST / "tests" / "proxy_recovery_integrity_v137.test.js",
        DEST / "tests" / "traffic_lite_zero_media.test.js",
    ]
    for p in version_tests:
        if p.exists():
            p.write_text(p.read_text(encoding="utf-8").replace('1.0.43', '1.0.44'), encoding="utf-8")

    shutil.copy2(GREEN, DEST / "tests" / "global_avito_request_authority_v144.test.js")

    origin = {
        "schema": "avito_finder_v144_materialization_v2",
        "version": "1.0.44",
        "base_version": "1.0.43",
        "purpose": "global fail-closed Avito network request authority after network block",
        "runtime_behavior_changed": ["service_worker.js", "recovery.js"],
        "identity_only_changed": ["avito_content.js", "manifest.json"],
        "runtime_unchanged": ["chatgpt_content.js", "core.js", "proxy_manager.js"],
        "request_authority_closed_before_rate_limit_backoff": True,
        "red_authority": "releases/v1.0.44/QA/red/RED.json",
        "base_service_worker_sha256": sha256(BASE / "service_worker.js"),
        "materialized_service_worker_sha256": sha256(DEST / "service_worker.js"),
        "base_recovery_sha256": sha256(BASE / "recovery.js"),
        "materialized_recovery_sha256": sha256(DEST / "recovery.js"),
        "base_chatgpt_content_sha256": sha256(BASE / "chatgpt_content.js"),
        "materialized_chatgpt_content_sha256": sha256(DEST / "chatgpt_content.js"),
        "base_core_sha256": sha256(BASE / "core.js"),
        "materialized_core_sha256": sha256(DEST / "core.js"),
        "base_proxy_manager_sha256": sha256(BASE / "proxy_manager.js"),
        "materialized_proxy_manager_sha256": sha256(DEST / "proxy_manager.js"),
    }
    for name in ("chatgpt_content", "core", "proxy_manager"):
        if origin[f"base_{name}_sha256"] != origin[f"materialized_{name}_sha256"]:
            raise RuntimeError(f"{name} unexpectedly changed")
    if origin["base_service_worker_sha256"] == origin["materialized_service_worker_sha256"]:
        raise RuntimeError("service_worker patch did not materialize")
    if origin["base_recovery_sha256"] == origin["materialized_recovery_sha256"]:
        raise RuntimeError("recovery policy patch did not materialize")
    (DEST / "BUILD_ORIGIN_v1.0.44.json").write_text(
        json.dumps(origin, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(origin, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
