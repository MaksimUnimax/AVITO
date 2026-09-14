'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');

const ROOT=path.resolve(process.env.AF_SOURCE_ROOT || path.join(__dirname,'..','releases','v1.0.45','v145_work'));
const {loadWorker}=require(path.join(ROOT,'tests','helpers','worker_vm.cjs'));
const A='5.164.230.200',B='91.201.88.41';

function ipSequence(values){
  let i=0;
  return async()=>{
    const ip=values[Math.min(i++,values.length-1)];
    return {ok:true,status:200,headers:{},json:async()=>({ip}),text:async()=>JSON.stringify({ip})};
  };
}
function avitoRequests(w){return w.calls.filter(x=>x[0]==='reload'||x[0]==='navigate'||x[0]==='create');}

for(const [name,seq,attempt] of [
  ['attempt 2 can prove new egress without an intervening Avito request',[A,A,A,B],2],
  ['attempt 3 is reachable without an intervening Avito request',[A,A,A,A,A,B],3]
]) test(name,async t=>{
  const w=loadWorker({fetch:ipSequence(seq)});t.after(()=>w.dispose());
  const s=await w.seed();
  const r=await w.h.recoverAvitoIpBlockAndReload(s,w.tabs.get(7),1,'v145-green');
  assert.equal(r.connection_recovery?.attempt,attempt);
  assert.equal(r.avito_network_authority?.egress_change_confirmed,true);
  assert.equal(r.avito_network_authority?.probe_before,A);
  assert.equal(r.avito_network_authority?.probe_after,B);
  assert.equal(avitoRequests(w).length,1,'exactly one target request is allowed only after proof');
  assert.equal(avitoRequests(w)[0][0],'reload');
  const escalations=(w.local[w.C.STORAGE.logs]||[]).filter(x=>x.type==='AVITO_RECOVERY_ESCALATED_WITHOUT_TARGET_REQUEST');
  assert.equal(escalations.length,attempt-1);
  assert.ok(escalations.every(x=>x.target_requests_issued===0));
});

test('unchanged egress exhausts bounded transport recovery with zero Avito requests',async t=>{
  const w=loadWorker({fetch:ipSequence([A,A,A,A,A,A,A,A,A,A])});t.after(()=>w.dispose());
  const s=await w.seed();
  const r=await w.h.recoverAvitoIpBlockAndReload(s,w.tabs.get(7),1,'v145-green-same');
  assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
  assert.equal(r.connection_recovery?.attempt,4);
  assert.notEqual(r.avito_network_authority?.egress_change_confirmed,true);
  assert.equal(avitoRequests(w).length,0);
  assert.ok((w.local[w.C.STORAGE.logs]||[]).filter(x=>x.type==='AVITO_RECOVERY_ESCALATED_WITHOUT_TARGET_REQUEST').length>=3);
});

test('RATE_LIMIT after backoff uses the same transport-only escalation before target retry',async t=>{
  const w=loadWorker({fetch:ipSequence([A,A,A,B]),rateLimitBackoffMs:0});t.after(()=>w.dispose());
  const s=await w.seed();
  const r=await w.h.recoverAvitoConnectionAndReload(s,w.tabs.get(7),1,'v145-rate',null,'RATE_LIMIT');
  assert.equal(r.connection_recovery?.attempt,2);
  assert.equal(r.avito_network_authority?.egress_change_confirmed,true);
  assert.equal(avitoRequests(w).length,1);
  assert.equal(avitoRequests(w)[0][0],'reload');
});

test('production source keeps attempt-2 provider rotation and attempt-3 endpoint creation behind transport escalation',()=>{
  const source=fs.readFileSync(path.join(ROOT,'service_worker.js'),'utf8');
  assert.match(source,/record\.attempt\s*>=\s*2[\s\S]{0,500}change_ip_link/);
  assert.match(source,/record\.attempt\s*<\s*3\)\s*return profile/);
  assert.match(source,/AVITO_RECOVERY_ESCALATED_WITHOUT_TARGET_REQUEST/);
  assert.match(source,/Recovery\.reserveAttempt\(current\.connection_recovery,Date\.now\(\)\)/);
});
