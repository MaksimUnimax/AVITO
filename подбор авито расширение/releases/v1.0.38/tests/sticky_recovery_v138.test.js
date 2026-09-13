'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

if(!process.env.AF_SOURCE_ROOT) throw new Error('AF_SOURCE_ROOT_REQUIRED');
const ROOT=path.resolve(process.env.AF_SOURCE_ROOT);
const {loadWorker}=require(path.join(ROOT,'tests/helpers/worker_vm.cjs'));

function response(payload,status=200){return {ok:status>=200&&status<300,status,headers:{},json:async()=>payload,text:async()=>JSON.stringify(payload)};}

test('Avito recovery endpoint is sticky, not every-request rotation', async t=>{
  let createBody=null;
  const fakeFetch=async (url,options={})=>{
    if(String(url).includes('/dev-api/v2/package/create-proxy/')){
      createBody=JSON.parse(String(options.body||'{}'));
      return response({success:true});
    }
    if(String(url).includes('/dev-api/list/')){
      return response({success:true,list:{data:[{
        id:999,
        ip:'pool.proxy.market',
        http_port:10000,
        socks_port:10999,
        login:'sticky-user',
        password:'sticky-password',
        country:'ru',
        package_id:68507,
        rotation_settings:{rotate:-1,rotate_can_change:false}
      }]}});
    }
    return response({ip:'185.42.12.34'});
  };
  const w=loadWorker({apiKey:'fixture-api-key',fetch:fakeFetch});
  t.after(()=>w.dispose());
  let state=await w.seed();
  const record={...w.R.freshRecovery(state,7,Date.now(),'IP_BLOCK'),attempt:3,phase:'PREPARING',source:'live-v137-ip-block',interruption_kind:'IP_BLOCK'};
  state=await w.h.saveState({...state,connection_recovery:record});

  const returned=await w.h.maybeCreateRecoveryEndpoint(state,record,w.profile,new AbortController().signal);
  assert.ok(createBody,'provider create HTTP request must be emitted');
  assert.equal(createBody.packageId,68507);
  assert.equal(createBody.rotation,-1,'Avito recovery must request Proxy.Market sticky session');
  assert.equal(returned.rotation_settings?.rotate,-1,'reconciled endpoint must be sticky');
  assert.equal(String(returned.id),'999');

  const after=await w.h.getState();
  assert.equal(after.connection_recovery.create.state,'IDENTIFIED');
  assert.equal(String(after.connection_recovery.create.profile_id),'999');
});
