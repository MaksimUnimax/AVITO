'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');

const ROOT=path.resolve(process.env.AF_SOURCE_ROOT || path.join(__dirname,'..','releases','v1.0.44','v144_work'));
const {loadWorker}=require(path.join(ROOT,'tests','helpers','worker_vm.cjs'));

function sameIpFetch(){
  return async()=>({
    ok:true,status:200,headers:{},
    json:async()=>({ip:'5.164.230.200'}),
    text:async()=>JSON.stringify({ip:'5.164.230.200'})
  });
}

test('RED v1.0.44: fail-closed same-IP attempt 1 must escalate transport without touching Avito', async t=>{
  const worker=loadWorker({fetch:sameIpFetch()});
  t.after(()=>worker.dispose());
  const state=await worker.seed();
  const result=await worker.h.recoverAvitoIpBlockAndReload(state,worker.tabs.get(7),1,'live-v145-red');
  const durable=await worker.h.getState();
  const avitoRequests=worker.calls.filter(x=>x[0]==='reload'||x[0]==='navigate'||x[0]==='create');

  // v1.0.44 safety gate is expected to hold: no target request on unchanged egress.
  assert.equal(avitoRequests.length,0,'v1.0.44 must not hit Avito on same egress');
  assert.equal(result.avito_network_authority?.egress_change_confirmed,false);
  assert.equal(durable.connection_recovery?.attempt,1,'observed v1.0.44 live failure stops at attempt 1');

  const source=fs.readFileSync(path.join(ROOT,'service_worker.js'),'utf8');
  assert.match(source,/record\.attempt\s*>=\s*2[\s\S]{0,400}change_ip_link/,'provider rotation is gated behind attempt >=2');
  assert.match(source,/record\.attempt\s*<\s*3\)\s*return profile/,'endpoint creation is gated behind attempt >=3');

  // Desired v1.0.45 contract. This assertion MUST FAIL on exact v1.0.44:
  // same-IP attempt 1 must continue a bounded transport-only escalation rather
  // than return to chat before attempt 2 can run.
  assert.ok(Number(durable.connection_recovery?.attempt||0)>=2,
    'RED_EXPECTED: transport escalation did not advance beyond attempt 1');
});
