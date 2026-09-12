'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const source=path.resolve(process.argv[2]||'');
if(!source) throw new Error('SOURCE_ROOT_REQUIRED');
process.env.AF_SOURCE_ROOT=source;
const {loadWorker}=require(path.join(source,'tests/helpers/worker_vm.cjs'));

(async()=>{
  const timeline=[];
  const w=loadWorker({
    fetch:async(url)=>{
      const u=String(url);
      if(u==='https://rotate.proxy.market/change/abc'){
        timeline.push('provider-change');
        return {ok:true,status:204,discard(){}};
      }
      if(u.includes('api.ipify.org')){
        timeline.push('egress-probe');
        return {ok:true,status:200,json:async()=>({ip:'185.42.12.34'}),text:async()=>'{}'};
      }
      throw new Error('UNEXPECTED_FETCH:'+u);
    },
    onReload:()=>timeline.push('avito-reload')
  });
  try{
    let state=await w.seed();
    const profile=w.P.normalizeProxyMarketRecord({
      id:123,ip:'pool.proxy.market',http_port:10000,login:'fixture-user',password:'fixture-password',country:'ru',package_id:68507,
      rotation_settings:{rotate:0,rotate_can_change:true,change_ip_link:'https://rotate.proxy.market/change/abc'}
    });
    await w.h.savePersistedProxyProfiles([profile]);
    await w.h.saveProxySecret({profiles:[profile],active_profile_id:profile.id,api_key:'',package_id:68507});
    await w.h.saveProxyRuntime({mode:'proxy',profiles:[w.P.profileSummary(profile)],selected_profile_id:profile.id,data_saver_enabled:true});
    state=await w.h.getState();
    await w.h.recoverAvitoIpBlockAndReload(state,w.tabs.get(7),1,'live_ip_block_first_attempt');
    assert.equal(timeline.filter(x=>x==='provider-change').length,1,'timeline='+timeline.join(','));
    assert.ok(timeline.indexOf('provider-change')>=0 && timeline.indexOf('provider-change')<timeline.indexOf('avito-reload'),'timeline='+timeline.join(','));
    assert.equal(w.calls.filter(x=>x[0]==='reload').length,1);
    console.log(JSON.stringify({status:'PASS',timeline,provider_change_calls:1,reload_calls:1}));
  }finally{w.dispose();}
})().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
