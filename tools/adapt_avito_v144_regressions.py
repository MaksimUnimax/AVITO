from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get("AF_V144_WORK", ROOT / "подбор авито расширение" / "releases" / "v1.0.44" / "v144_work"))


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match in {path}, got {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def main() -> None:
    if not WORK.is_dir():
        raise SystemExit(f"missing materialized v1.0.44 worktree: {WORK}")

    # Successful recovery fixtures must prove a genuinely different egress.
    # Keep the default helper deterministic but advance the public test IP on
    # every egress probe. Negative tests below explicitly override this default.
    vm = WORK / "tests" / "helpers" / "worker_vm.cjs"
    replace_once(
        vm,
        "  ctx={chrome,console,URL,Date,Math,Promise,Array,String,Number,Boolean,Error,TypeError,Set,Map,RegExp,JSON,Object,Uint8Array,TextEncoder,TextDecoder,AbortController,structuredClone,queueMicrotask,",
        "  let defaultEgressProbe=33;\n  ctx={chrome,console,URL,Date,Math,Promise,Array,String,Number,Boolean,Error,TypeError,Set,Map,RegExp,JSON,Object,Uint8Array,TextEncoder,TextDecoder,AbortController,structuredClone,queueMicrotask,",
        "declare deterministic changing egress fixture",
    )
    replace_once(
        vm,
        "fetch:options.fetch|| (async()=>({ok:true,status:200,headers:{},json:async()=>({ip:'185.42.12.34'}),text:async()=>'{\"ip\":\"185.42.12.34\"}'}))};",
        "fetch:options.fetch|| (async()=>{const ip='185.42.12.'+(++defaultEgressProbe);return {ok:true,status:200,headers:{},json:async()=>({ip}),text:async()=>JSON.stringify({ip})};})};",
        "successful recovery fixture advances egress",
    )

    recovery = WORK / "tests" / "recovery_behavior_v125.test.js"
    replace_once(
        recovery,
        "test('same egress on both checks is not a false Avito-IP proof and does not prevent fresh target check',async t=>{const w=fixture(t);const s=await w.seed();const r=await w.h.recoverAvitoIpBlockAndReload(s,w.tabs.get(7),1,'test');assert.equal(r.status,'WAITING_FOR_AVITO_PAGE_READY');assert.equal(r.connection_recovery.prepared.probe_ip_changed,false);assert.equal(r.connection_recovery.prepared.avito_exit_ip_verified,false);assert.equal(w.calls.filter(x=>x[0]==='reload').length,1);assert.equal(w.effective().value.pacScript.data.includes('127.0.0.1:9'),false);assert.equal(w.effective().value.pacScript.data.includes('api.ipify.org'),false);});",
        "test('same egress on both checks fails closed and never requests a fresh Avito document',async t=>{const sameIp=async()=>({ok:true,status:200,headers:{},json:async()=>({ip:'185.42.12.34'}),text:async()=>'{\"ip\":\"185.42.12.34\"}'});const w=fixture(t,{fetch:sameIp});const s=await w.seed();const r=await w.h.recoverAvitoIpBlockAndReload(s,w.tabs.get(7),1,'test');assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.equal(r.connection_recovery.prepared.probe_ip_changed,false);assert.equal(r.connection_recovery.prepared.avito_exit_ip_verified,false);assert.equal(w.calls.filter(x=>x[0]==='reload'||x[0]==='navigate').length,0);assert.equal(w.sent.length,1);assert.ok((w.local[C.STORAGE.logs]||[]).some(x=>x.type==='AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE'));assert.equal(w.effective().value.pacScript.data.includes('127.0.0.1:9'),false);assert.equal(w.effective().value.pacScript.data.includes('api.ipify.org'),false);});",
        "same-egress regression must fail closed",
    )
    replace_once(
        recovery,
        "test('unreachable IP checker remains telemetry, not a permanent recovery gate',async t=>{const w=fixture(t,{fetch:async()=>{throw new Error('fixture checker unavailable');}});const s=await w.seed();const r=await w.h.recoverAvitoIpBlockAndReload(s,w.tabs.get(7),1,'test');assert.equal(r.status,'WAITING_FOR_AVITO_PAGE_READY');assert.equal(r.connection_recovery.prepared.probe_before,null);assert.equal(w.calls.filter(x=>x[0]==='reload').length,1);});",
        "test('unreachable IP checker fails closed and cannot authorize an Avito retry',async t=>{const w=fixture(t,{fetch:async()=>{throw new Error('fixture checker unavailable');}});const s=await w.seed();const r=await w.h.recoverAvitoIpBlockAndReload(s,w.tabs.get(7),1,'test');assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.equal(r.connection_recovery.prepared.probe_before,null);assert.equal(w.calls.filter(x=>x[0]==='reload'||x[0]==='navigate').length,0);assert.equal(w.sent.length,1);assert.ok((w.local[C.STORAGE.logs]||[]).some(x=>x.type==='AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE'));});",
        "unavailable-probe regression must fail closed",
    )

    contract = WORK / "tests" / "contract_audit_v129.test.js"
    replace_once(
        contract,
        "test('rate-limit recovery works DIRECT and does not call Proxy.Market',async t=>{let requests=0;const w=fixture(t,{fetch:async()=>{requests++;throw Error('not expected');}});const s=await w.seed();await w.h.saveProxyRuntime({...await w.h.getProxyRuntime(),mode:'direct'});const r=await w.h.recoverAvitoConnectionAndReload(s,w.tabs.get(7),1,'429',null,'RATE_LIMIT');assert.equal(r.connection_recovery.prepared.strategy,'COOLDOWN_SAME_ROUTE');assert.equal(requests,0);assert.equal(w.calls.filter(x=>x[0]==='pac').length,0);assert.equal(w.calls.filter(x=>x[0]==='reload').length,1);});",
        "test('rate-limit recovery on DIRECT fails closed and cannot treat cooldown as request authority',async t=>{let requests=0;const w=fixture(t,{fetch:async()=>{requests++;throw Error('not expected');}});const s=await w.seed();await w.h.saveProxyRuntime({...await w.h.getProxyRuntime(),mode:'direct'});const r=await w.h.recoverAvitoConnectionAndReload(s,w.tabs.get(7),1,'429',null,'RATE_LIMIT');assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.match(r.blocked_reason,/PROXY_NOT_ACTIVE|SUPPRESSED/);assert.equal(requests,0);assert.equal(w.calls.filter(x=>x[0]==='pac').length,0);assert.equal(w.calls.filter(x=>x[0]==='reload'||x[0]==='navigate').length,0);assert.equal(w.sent.length,1);});",
        "DIRECT rate limit must fail closed",
    )

    queue = WORK / "tests" / "v129" / "browser_queue_cycles.py"
    old = """    if fault=='rate_limit':\n     v=await h.wait(lambda v:v['state']['status']=='RATE_LIMIT_BACKOFF',45);assert v['state']['sequential_review']['cursor']==1;await h.call('restart')\n"""
    new = """    if fault=='rate_limit':\n     v=await h.wait(lambda v:v['state']['status']=='RATE_LIMIT_BACKOFF',45);assert v['state']['sequential_review']['cursor']==1;await h.call('restart')\n     v=await h.wait(lambda v:v['state']['status']=='SEQUENTIAL_RECOVERY_BLOCKED',45)\n     q=v['state']['sequential_review'];assert q['cursor']==1 and len(q['details'])==1,q\n     authority=v['state'].get('avito_network_authority') or {};assert authority.get('blocked') is True and authority.get('egress_change_confirmed') is not True,authority\n     assert not [x for x in v['calls'] if x[0] in ['reload','navigate'] and x[1] in [q.get('in_flight',{}).get('child_tab_id'),q.get('captcha',{}).get('child_tab_id')]],v['calls']\n     pc=await h.pages[1].evaluate('({sendClicks,sentReports})')\n     assert pc['sendClicks']==1 and not pc['sentReports'],pc\n     assert not h.errors,h.errors\n     results.append({'name':name,'status':'PASS','expected_terminal':'SEQUENTIAL_RECOVERY_BLOCKED','cursor':1,'details_preserved':1,'state':v['state']['status'],'delivery_checkpoints':h.delivery_checkpoints,'trace':h.trace,'duration_seconds':round(time.monotonic()-start,3)})\n     continue\n"""
    replace_once(queue, old, new, "direct-route rate limit queue is a fail-closed regression")

    origin_path = WORK / "BUILD_ORIGIN_v1.0.44.json"
    origin = json.loads(origin_path.read_text(encoding="utf-8"))
    origin["test_harness_only_changed"] = [
        "tests/helpers/worker_vm.cjs: successful recovery fixture now advances synthetic egress per probe",
        "tests/recovery_behavior_v125.test.js: same-IP and unavailable-probe cases now assert fail-closed; success cases retain recovery semantics with changed egress",
        "tests/contract_audit_v129.test.js: DIRECT 429 now asserts fail-closed/no reload instead of cooldown same-route retry",
        "tests/v129/browser_queue_cycles.py: DIRECT mid-queue 429 now asserts cursor preservation + SEQUENTIAL_RECOVERY_BLOCKED",
    ]
    origin["test_contract_migration_reason"] = (
        "v1.0.44 promotes no-reload-without-proven-egress from a branch-local behavior to a global invariant; "
        "old fixtures that expected successful recovery on same or unavailable egress were invalid under the new contract"
    )
    origin_path.write_text(json.dumps(origin, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status":"PASS","work":str(WORK),"adapted":origin["test_harness_only_changed"]},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
