'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

const ROOT=process.env.AF_SOURCE_ROOT;
if(!ROOT) throw new Error('AF_SOURCE_ROOT_REQUIRED');
const {loadWorker}=require(path.join(ROOT,'tests/helpers/worker_vm.cjs'));

function fixture(t,opts={}) { const w=loadWorker(opts); t.after(()=>w.dispose()); return w; }

test('Avito recovery endpoint is sticky, not every-request rotation', async t=>{
  const w=fixture(t,{apiKey:'fixture-api-key'});
  let state=await w.seed();
  const record={...w.R.freshRecovery(state,7,Date.now(),'IP_BLOCK'),attempt:3,phase:'PREPARING',source:'live-v137-ip-block',interruption_kind:'IP_BLOCK'};
  state=await w.h.saveState({...state,connection_recovery:record});

  let createOptions=null;
  w.P.createProxyInPackage=async (_request,_apiKey,options)=>{
    createOptions=JSON.parse(JSON.stringify(options));
    return {ok:true,status:200,payload:{success:true}};
  };
  w.P.fetchProxyMarketPage=async ()=>({
    list:{data:[{
      id:999,
      ip:'pool.proxy.market',
      http_port:10000,
      socks_port:10999,
      login:'sticky-user',
      password:'sticky-password',
      country:'ru',
      package_id:68507,
      rotation_settings:{rotate:-1,rotate_can_change:false}
    }]}
  });

  const returned=await w.h.maybeCreateRecoveryEndpoint(state,record,w.profile,new AbortController().signal);
  assert.ok(createOptions,'provider endpoint create must be attempted');
  assert.equal(createOptions.rotation,-1,'Avito recovery must request Proxy.Market sticky session');
  assert.equal(returned.rotation_settings?.rotate,-1,'reconciled endpoint must be sticky');
  assert.equal(String(returned.id),'999');

  const after=await w.h.getState();
  assert.equal(after.connection_recovery.create.state,'IDENTIFIED');
  assert.equal(String(after.connection_recovery.create.profile_id),'999');
});
