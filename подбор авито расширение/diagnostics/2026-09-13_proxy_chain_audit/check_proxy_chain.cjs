'use strict';
// Characterize the exact published worker; never contact a live proxy or Avito.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ROOT=path.resolve(process.argv[2]||process.env.AF_SOURCE_ROOT||'');
const OUT=path.resolve(process.argv[3]||'proxy_worker_results.json');
process.env.AF_SOURCE_ROOT=ROOT;
const {loadWorker}=require(path.join(ROOT,'tests/helpers/worker_vm.cjs'));
const cases=[], evidence={}, sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reply=ip=>({ok:true,status:200,headers:{},json:async()=>({ip}),text:async()=>JSON.stringify({ip})});
const diag=w=>vm.runInContext('proxyDiagnosticView()',w.ctx);
const logs=w=>w.local[w.C.STORAGE.logs]||[];
async function run(name,fn){try{const data=await fn();cases.push({name,characterization:'REPRODUCED',...data});}catch(e){cases.push({name,characterization:'TEST_ERROR',error:e.stack});}}
(async()=>{
 await run('successful_ip_probes_still_record_ok_false_awaiting_target',async()=>{
  let count=0;const w=loadWorker({fetch:async()=>reply(++count===1?'198.51.100.10':'198.51.100.11')});
  try{const s=await w.seed();w.tabs.get(7).ip_block=true;
   await w.h.recoverAvitoIpBlockAndReload(s,w.tabs.get(7),1,'audit-offline');
   const rt=await w.h.getProxyRuntime();const r=rt.last_ip_block_recovery;
   assert.equal(count,2);assert.equal(r.ok,false);assert.equal(r.target_status,'PENDING');
   assert.equal(r.probe_before,'198.51.100.10');assert.equal(r.probe_after,'198.51.100.11');
   evidence.pending_proxy={...rt,active_profile:w.P.profileSummary(w.profile)};
   evidence.success_proxy=structuredClone(evidence.pending_proxy);
   Object.assign(evidence.success_proxy.last_ip_block_recovery,{ok:true,target_status:'AVITO_PUBLIC_SURFACE_CONFIRMED'});
   return {mock_ip_requests:count,ip_observations:logs(w).filter(x=>x.type==='PROXY_EGRESS_OBSERVED').length,record:r,finding:'ok=false is target PENDING, not proof of failed IP sampling'};
  }finally{w.dispose();}
 });
 await run('third_attempt_captcha_retains_second_attempt_runtime_record',async()=>{
  let count=0;const w=loadWorker({fetch:async()=>reply(++count%2?'198.51.100.10':'198.51.100.11')});
  try{const s=await w.seed();w.tabs.get(7).ip_block=true;
   const rec=w.R.freshRecovery(s,7);rec.attempt=1;await w.h.saveState({...s,connection_recovery:rec});
   await w.h.recoverAvitoIpBlockAndReload(await w.h.getState(),w.tabs.get(7),1,'audit-second');
   const r2=(await w.h.getProxyRuntime()).last_ip_block_recovery;assert.equal(r2.attempt,2);
   // The surface changes after the earlier observation: this is an explicit fixture assumption.
   w.tabs.get(7).captcha=true;
   await w.h.recoverAvitoIpBlockAndReload(await w.h.getState(),w.tabs.get(7),1,'audit-third');
   const s3=await w.h.getState(),rt3=await w.h.getProxyRuntime();
   assert.equal(s3.avito_ip_block_reload_count,3);assert.match(w.sent.at(-1).report_text,/CAPTCHA_MANUAL_REQUIRED/);
   assert.equal(rt3.last_ip_block_recovery.attempt,2);assert.deepEqual(rt3.last_ip_block_recovery,r2);
   return {state_attempt:s3.avito_ip_block_reload_count,state_phase:s3.phase,popup_record_attempt:rt3.last_ip_block_recovery.attempt,ip_observations:logs(w).filter(x=>x.type==='PROXY_EGRESS_OBSERVED').length,finding:'CAPTCHA thrown before runtime record update; previous attempt survives'};
  }finally{w.dispose();}
 });
 await run('auth_supplied_then_same_profile_reapply_makes_after_apply_false',async()=>{
  const w=loadWorker();try{await w.seed();await w.h.applyProxyProfileInternal(w.profile);
   await new Promise(resolve=>w.chrome.webRequest.onAuthRequired.emit({isProxy:true,requestId:'auth-fixture',type:'main_frame',url:w.tabs.get(7).url,challenger:{host:w.profile.host,port:w.profile.http_port}},r=>{assert.ok(r.authCredentials);resolve();}));
   await sleep(8);const before=await diag(w);assert.equal(before.auth_seen_after_apply,true);
   await w.h.applyProxyProfileInternal(w.profile,'AUDIT_REAPPLY',{}, {preserve_proxy_diagnostics:true});
   w.tabs.get(7).ip_block=true;const after=await diag(w);
   assert.equal(after.auth_seen_after_apply,false);assert.equal(after.last_auth_at,before.last_auth_at);
   return {before:{auth_seen_after_apply:before.auth_seen_after_apply,applied:before.proxy_applied_at,auth:before.last_auth_at},after:{auth_seen_after_apply:after.auth_seen_after_apply,applied:after.proxy_applied_at,auth:after.last_auth_at,status:after.status},finding:'same-profile apply advances timestamp beyond preserved credential-supply evidence'};
  }finally{w.dispose();}
 });
 await run('foreign_direct_pac_misreported_as_proxy_configured',async()=>{
  const w=loadWorker();try{await w.seed();await w.h.applyProxyProfileInternal(w.profile);w.tabs.get(7).ip_block=true;
   const foreign={levelOfControl:'controlled_by_other_extensions',value:{mode:'pac_script',pacScript:{data:'function FindProxyForURL(url,host){return "DIRECT";}'}}};
   w.chrome.proxy.settings.get=(_,cb)=>queueMicrotask(()=>cb(foreign));const d=await diag(w);
   const exact=w.R.pacMatches(foreign,w.P.buildAvitoOnlyPacConfig(w.profile));
   assert.equal(exact,false);assert.equal(d.status,'PROXY_CONFIGURED_AVITO_IP_BLOCK_AUTH_NOT_OBSERVED');
   return {diagnostic_status:d.status,effective_level:d.effective_level,exact_pac_match:exact,actual_fixture_route:'DIRECT',finding:'diagnostic mode check omits ownership and exact PAC'};
  }finally{w.dispose();}
 });
 await run('owned_but_wrong_pac_misreported_as_proxy_configured',async()=>{
  const w=loadWorker();try{await w.seed();await w.h.applyProxyProfileInternal(w.profile);w.tabs.get(7).ip_block=true;
   const wrong={levelOfControl:'controlled_by_this_extension',value:{mode:'pac_script',pacScript:{data:'function FindProxyForURL(url,host){return "DIRECT";}'}}};
   w.chrome.proxy.settings.get=(_,cb)=>queueMicrotask(()=>cb(wrong));const d=await diag(w);
   assert.equal(w.R.pacMatches(wrong,w.P.buildAvitoOnlyPacConfig(w.profile)),false);assert.equal(d.status,'PROXY_CONFIGURED_AVITO_IP_BLOCK_AUTH_NOT_OBSERVED');
   return {diagnostic_status:d.status,effective_level:d.effective_level,actual_fixture_route:'DIRECT',finding:'ownership alone would still not establish route; PAC content must match'};
  }finally{w.dispose();}
 });
 await run('ip_probe_errors_omitted_from_prepared_result',async()=>{
  const w=loadWorker({fetch:async()=>{throw new Error('AUDIT_IP_PROBE_FAILURE');}});try{const s=await w.seed();
   const r=w.R.reserveAttempt(w.R.freshRecovery(s,7));await w.h.saveState({...s,connection_recovery:r});
   const p=await w.h.prepareRecoveryProxy(await w.h.getState(),r,new AbortController().signal);
   const errors=logs(w).filter(x=>x.type==='PROXY_EGRESS_DIAGNOSTIC_UNAVAILABLE');const rt=await w.h.getProxyRuntime();
   assert.equal(errors.length,2);assert.equal(p.probe_before,null);assert.equal(p.probe_after,null);assert.equal(p.ok,true);assert.ok(!('error' in p));
   return {result:p,logged_errors:errors.map(x=>x.error),last_egress_check_at:rt.proxy_diagnostics.last_egress_check_at,last_egress_ip:rt.proxy_diagnostics.last_egress_ip,finding:'diagnostic failures logged but reasons omitted from prepared result and durable IP diagnostic fields'};
  }finally{w.dispose();}
 });
 await run('ip_block_and_captcha_preserved_in_raw_diag_but_status_hides_captcha',async()=>{
  const w=loadWorker();try{await w.seed();await w.h.applyProxyProfileInternal(w.profile);Object.assign(w.tabs.get(7),{ip_block:true,captcha:true});const d=await diag(w);
   assert.equal(d.avito_tab.ip_block,true);assert.equal(d.avito_tab.captcha,true);assert.equal(d.status,'PROXY_CONFIGURED_AVITO_IP_BLOCK_AUTH_NOT_OBSERVED');
   evidence.mixed_diagnostic=d;
   return {status:d.status,ip_block:d.avito_tab.ip_block,captcha:d.avito_tab.captcha,finding:'raw flags retain both; headline status chooses IP block'};
  }finally{w.dispose();}
 });
 await run('captcha_gate_lost_during_report_staging_then_restored_by_wake',async()=>{
  const w=loadWorker();try{const s=await w.seed();w.tabs.get(7).captcha=true;
   const blocked=await w.h.saveState({...s,blocked_reason:'CAPTCHA_MANUAL_REQUIRED'});
   await w.h.deliverReportToPinnedChat(blocked,'CAPTCHA_MANUAL_REQUIRED','avito_failure');
   const after=await w.h.getState();assert.equal(after.manual_gate_kind,null);assert.equal(after.phase,'CHATGPT_CONTINUATION');
   const callsBefore=w.calls.length;await w.h.recoverRuntimeOnWake();const migrated=await w.h.getState();
   assert.equal(migrated.manual_gate_kind,'CAPTCHA');assert.equal(migrated.phase,'CAPTCHA_MANUAL_WAIT');
   return {after_delivery:{phase:after.phase,manual_gate_kind:after.manual_gate_kind},after_wake:{phase:migrated.phase,manual_gate_kind:migrated.manual_gate_kind},wake_mutations:w.calls.slice(callsBefore).filter(c=>['pac','navigate','reload','create'].includes(c[0])),finding:'report staging clears blocked_reason before manualGateKind reads it; later wake re-probes and reinstates gate'};
  }finally{w.dispose();}
 });
 const source_hashes=Object.fromEntries(['service_worker.js','core.js','proxy_manager.js','recovery.js','popup.js'].map(n=>[n,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT,n))).digest('hex')]));
 const report={scope:'OFFLINE_UNMODIFIED_PACKAGED_WORKER_CHROME_AND_NETWORK_DOUBLES',runtime_patch:false,live_network_requests:0,release_acceptance:'NOT_TESTED',source_hashes,cases,test_errors:cases.filter(c=>c.characterization==='TEST_ERROR').length,evidence};
 fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,evidence:undefined},null,2));process.exitCode=report.test_errors?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
