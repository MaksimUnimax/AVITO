'use strict';
process.env.AF_SOURCE_ROOT='/mnt/data/v130_compare';
const path=require('node:path');
const {loadWorker}=require(path.resolve('/mnt/data/v131_clean/tests/helpers/worker_vm.cjs'));
const TARGET='https://www.avito.ru/yuzhno-sahalinsk/nastolnye_kompyutery/dell_vostro_3470_4750223208';
(async()=>{
 const w=loadWorker();
 try {
  w.chrome.tabs.create=(props,done)=>{
   const tab={id:88,windowId:2,openerTabId:7,active:true,url:'about:blank',pendingUrl:'about:blank',status:'loading',time_origin:Date.now()};
   w.tabs.set(tab.id,tab);w.calls.push(['create',tab.id,props.url]);queueMicrotask(()=>done(structuredClone(tab)));
  };
  const s=await w.seed({status:'AVITO_TAB_ACTIVE'});
  const cp={kind:'assistant_explicit_public_url_queue',parent_tab_id:7,parent_window_id:2,parent_url:w.tabs.get(7).url,candidates:[{href:TARGET}],cursor:0,batch_size:1,card_gap_ms:0,details:[],failed:[],cards_closed:0,status:'running'};
  const pending=w.h.runSequentialCardBatch(s,w.tabs.get(7),cp).catch(e=>({error:String(e.message||e)}));
  await new Promise(r=>setTimeout(r,900));
  const beforeStop={calls:structuredClone(w.calls),state:await w.h.getState(),child:structuredClone(w.tabs.get(88))};
  await w.h.stop();
  const result=await Promise.race([pending,new Promise(r=>setTimeout(()=>r({error:'did_not_settle_after_stop'}),2500))]);
  const targetDispatches=beforeStop.calls.filter(x=>(x[0]==='navigate'||x[0]==='create')&&x[2]===TARGET);
  const createCall=beforeStop.calls.find(x=>x[0]==='create');
  const out={source_version:'1.0.30',simulated_chrome_create_return:{url:'about:blank',pendingUrl:'about:blank',status:'loading'},requested_create_url:createCall?.[2]||null,target_dispatch_count_after_create:targetDispatches.filter(x=>x[0]==='navigate').length,child_url:beforeStop.child?.url||null,child_pending_url:beforeStop.child?.pendingUrl||null,durable_stage:beforeStop.state?.sequential_review?.in_flight?.stage||null,result_after_stop:result,conclusion:'v1.0.30 skipped tabs.update because pendingUrl was truthy, leaving owned child on about:blank until readiness timeout'};
  console.log(JSON.stringify(out,null,2));
 } finally {w.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
