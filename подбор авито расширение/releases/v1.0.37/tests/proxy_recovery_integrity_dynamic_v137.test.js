'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadWorker}=require('../../../v1.0.36-r2/v136_work/tests/helpers/worker_vm.cjs');

function fixture(t,opts={}) { const w=loadWorker(opts); t.after(()=>w.dispose()); return w; }
function popupRequest(w,message){
  const listener=[...w.chrome.runtime.onMessage.listeners][0];
  assert.ok(listener,'worker runtime message listener');
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('POPUP_REQUEST_TEST_TIMEOUT')),3000);
    listener(message,{id:w.chrome.runtime.id,url:w.chrome.runtime.getURL('popup.html')},value=>{clearTimeout(timer);resolve(value);});
  });
}
function proxySet(w,value){return new Promise((resolve,reject)=>w.chrome.proxy.settings.set({value,scope:'regular'},()=>{const e=w.chrome.runtime.lastError;e?reject(new Error(e.message)):resolve();}));}
function nextTick(ms=0){return new Promise(r=>setTimeout(r,ms));}

test('dynamic diagnostic rejects wrong PAC even when runtime mode/profile say proxy', async t=>{
  const w=fixture(t); await w.seed();
  await w.h.applyProxyProfileInternal(w.profile,'TEST_APPLY');
  let d=await popupRequest(w,{type:'AF_PROXY_DIAGNOSTIC'});
  assert.equal(d.ok,true); assert.equal(d.exact_pac_match,true);
  await proxySet(w,{mode:'pac_script',pacScript:{data:'function FindProxyForURL(url,host){return "DIRECT";}'}});
  d=await popupRequest(w,{type:'AF_PROXY_DIAGNOSTIC'});
  assert.equal(d.ok,true);
  assert.equal(d.exact_pac_match,false);
  assert.equal(d.status,'PROXY_CONFIG_MISMATCH');
});

test('dynamic auth evidence survives same-profile internal PAC reapply', async t=>{
  const w=fixture(t); await w.seed();
  await w.h.applyProxyProfileInternal(w.profile,'TEST_INITIAL_APPLY');
  const epoch=(await w.h.getProxyRuntime()).proxy_profile_epoch_at;
  assert.ok(epoch);
  const authListener=[...w.chrome.webRequest.onAuthRequired.listeners][0];
  assert.ok(authListener);
  const answer=await new Promise(resolve=>authListener({isProxy:true,requestId:'auth-1',challenger:{host:'pool.proxy.market',port:10000},type:'main_frame'},resolve));
  assert.equal(answer.authCredentials.username,'fixture-user');
  await nextTick(5);
  await w.h.applyProxyProfileInternal(w.profile,'TEST_REAPPLY',{}, {preserve_proxy_diagnostics:true,pac_nonce:'test-reapply'});
  const runtime=await w.h.getProxyRuntime();
  assert.equal(runtime.proxy_profile_epoch_at,epoch);
  const d=await popupRequest(w,{type:'AF_PROXY_DIAGNOSTIC'});
  assert.equal(d.auth_seen_for_active_profile,true);
  assert.equal(String(d.last_auth_profile_id),String(w.profile.id));
});

test('dynamic attempt 3 CAPTCHA persists current recovery receipt before terminal report', async t=>{
  const w=fixture(t); let s=await w.seed();
  const base=w.R.freshRecovery(s,7,Date.now(),'IP_BLOCK');
  const existing={...base,attempt:2,phase:'AWAITING_FRESH_DOCUMENT',source:'prior',interruption_kind:'IP_BLOCK',previous_time_origin:1};
  s=await w.h.saveState({...s,connection_recovery:existing,avito_ip_block_reload_count:2});
  w.tabs.get(7).ip_block=true; w.tabs.get(7).captcha=true;
  const result=await w.h.recoverAvitoIpBlockAndReload(s,w.tabs.get(7),1,'dynamic-third-attempt');
  const runtime=await w.h.getProxyRuntime();
  assert.equal(runtime.last_ip_block_recovery.attempt,3);
  assert.equal(runtime.last_ip_block_recovery.target_status,'CAPTCHA_MANUAL_REQUIRED');
  assert.equal(runtime.last_ip_block_recovery.target_ip_block,true);
  assert.equal(runtime.last_ip_block_recovery.target_captcha,true);
  assert.equal(runtime.last_ip_block_recovery.completed_at!=null,true);
  assert.equal(result.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
  assert.equal(result.phase,'CAPTCHA_MANUAL_WAIT');
  assert.equal(result.manual_gate_kind,'CAPTCHA');
});

test('dynamic attempt 3 without session API key records explicit endpoint-create skip', async t=>{
  const w=fixture(t,{apiKey:''}); let s=await w.seed();
  const base=w.R.freshRecovery(s,7,Date.now(),'IP_BLOCK');
  const record={...base,attempt:3,phase:'PREPARING',source:'test',interruption_kind:'IP_BLOCK'};
  s=await w.h.saveState({...s,connection_recovery:record});
  const returned=await w.h.maybeCreateRecoveryEndpoint(s,record,w.profile,new AbortController().signal);
  assert.equal(returned.id,w.profile.id);
  const after=await w.h.getState();
  assert.equal(after.connection_recovery.create.state,'SKIPPED');
  assert.equal(after.connection_recovery.create.reason,'API_KEY_UNAVAILABLE');
  assert.equal(after.connection_recovery.create.attempt,3);
  const logs=w.local[w.C.STORAGE.logs]||[];
  assert.ok(logs.some(x=>x.type==='PROXY_RECOVERY_ENDPOINT_SKIPPED'&&x.reason==='API_KEY_UNAVAILABLE'));
});

test('dynamic egress probe errors survive in prepared result and durable diagnostic fields', async t=>{
  const w=fixture(t,{fetch:async()=>{throw new Error('fixture-egress-down');}}); let s=await w.seed();
  const record={...w.R.freshRecovery(s,7,Date.now(),'IP_BLOCK'),attempt:1,phase:'PREPARING',source:'test',interruption_kind:'IP_BLOCK'};
  s=await w.h.saveState({...s,connection_recovery:record});
  const prepared=await w.h.prepareRecoveryProxy(s,record,new AbortController().signal);
  assert.equal(prepared.transport_status,'PROBES_UNAVAILABLE');
  assert.match(prepared.probe_before_error,/fixture-egress-down/);
  assert.match(prepared.probe_after_error,/fixture-egress-down/);
  const runtime=await w.h.getProxyRuntime();
  assert.ok(runtime.proxy_diagnostics.last_egress_error_at);
  assert.match(runtime.proxy_diagnostics.last_egress_error,/fixture-egress-down/);
});

test('dynamic delivered CAPTCHA failure enters manual gate immediately without wake re-probe', async t=>{
  const w=fixture(t); const seeded=await w.seed();
  const state=await w.h.saveState({...seeded,status:'AVITO_FAILURE_REPORT_READY',phase:'AVITO_FAILURE_REPORT_READY',blocked_reason:'CAPTCHA_MANUAL_REQUIRED',report:'captcha failure',report_kind:'avito_failure'});
  const result=await w.h.deliverReportToPinnedChat(state,state.report,'avito_failure');
  assert.equal(result.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
  assert.equal(result.phase,'CAPTCHA_MANUAL_WAIT');
  assert.equal(result.manual_gate_kind,'CAPTCHA');
  assert.equal(result.blocked_reason,null);
});
