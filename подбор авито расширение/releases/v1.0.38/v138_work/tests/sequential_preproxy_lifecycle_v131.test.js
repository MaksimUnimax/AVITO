"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {loadWorker}=require('./helpers/worker_vm.cjs');
const C=require('../core.js');
const TARGET='https://www.avito.ru/yuzhno-sahalinsk/nastolnye_kompyutery/dell_vostro_3470_4750223208';
function cp(w,extra={}){return {kind:'assistant_explicit_public_url_queue',parent_tab_id:7,parent_window_id:2,parent_url:w.tabs.get(7).url,candidates:[{href:TARGET}],cursor:0,batch_size:1,card_gap_ms:0,details:[],failed:[],cards_closed:0,status:'running',...extra};}
function fixture(t,opts={}){const w=loadWorker(opts);t.after(()=>w.dispose());return w;}

test('new sequential item creates child directly at target URL; no about:blank trampoline',async t=>{
  const w=fixture(t);const s=await w.seed({status:'AVITO_TAB_ACTIVE'});const r=await w.h.runSequentialCardBatch(s,w.tabs.get(7),cp(w));
  assert.equal(r.checkpoint.cursor,1);
  const creates=w.calls.filter(x=>x[0]==='create');assert.equal(creates.length,1);assert.equal(creates[0][2],TARGET);
  assert.equal(w.calls.some(x=>x[0]==='create'&&x[2]==='about:blank'),false);
  assert.equal(w.calls.filter(x=>x[0]==='navigate'&&x[2]===TARGET).length,0,'normal lifecycle needs no second tabs.update');
});

test('returned target pendingUrl is navigation-in-progress and is not redispatched',async t=>{
  const w=fixture(t);const baseCreate=w.chrome.tabs.create;
  w.chrome.tabs.create=(props,done)=>{const id=77,tab={id,windowId:2,openerTabId:7,active:true,url:'about:blank',pendingUrl:TARGET,status:'loading',time_origin:Date.now()};w.tabs.set(id,tab);w.calls.push(['create',id,props.url]);queueMicrotask(()=>done(structuredClone(tab)));queueMicrotask(()=>{tab.url=TARGET;tab.pendingUrl=null;tab.status='complete';w.chrome.tabs.onUpdated.emit(id,{url:TARGET,status:'complete'},structuredClone(tab));});};
  const s=await w.seed({status:'AVITO_TAB_ACTIVE'});const r=await w.h.runSequentialCardBatch(s,w.tabs.get(7),cp(w));assert.equal(r.checkpoint.cursor,1);
  assert.equal(w.calls.filter(x=>x[0]==='create'&&x[2]===TARGET).length,1);assert.equal(w.calls.filter(x=>x[0]==='navigate').length,0);w.chrome.tabs.create=baseCreate;
});

test('usable target DOM while tab is loading satisfies sequential readiness like pre-proxy contract',async t=>{
  const w=fixture(t,{probe:(details,tab,probe)=>({...probe,href:TARGET,ready_state:'interactive',body_present:true})});
  const tab={id:55,windowId:2,openerTabId:7,active:true,url:TARGET,status:'loading',time_origin:Date.now()};w.tabs.set(55,tab);
  const ready=await w.ctx.__AF_TEST_EXPORTS.readiness.waitForSequentialCardReady?.(55,2,TARGET,2000,null);
  // Function is also tested through queue below if not separately exported.
  if(ready) assert.equal(ready.id,55);
  else {const s=await w.seed({status:'AVITO_TAB_ACTIVE'});const q=cp(w,{in_flight:{child_tab_id:55,cursor:0,href:TARGET,stage:'TARGET_NAVIGATION_DISPATCHED'}});const r=await w.h.runSequentialCardBatch(s,w.tabs.get(7),q);assert.equal(r.checkpoint.cursor,1);}
});

test('crash after tabs.create before child id persistence adopts exactly one owned exact-target tab',async t=>{
  const w=fixture(t);w.tabs.set(61,{id:61,windowId:2,openerTabId:7,active:true,url:'about:blank',pendingUrl:TARGET,status:'loading',time_origin:Date.now()});
  let q=cp(w,{in_flight:{child_tab_id:null,cursor:0,href:TARGET,started_at:Date.now(),stage:'TARGET_TAB_CREATE_INTENT'}});const s=await w.seed({status:'AVITO_TAB_ACTIVE',sequential_review:q});
  // settle the adopted pending target so the read can finish
  queueMicrotask(()=>{const tab=w.tabs.get(61);tab.url=TARGET;tab.pendingUrl=null;tab.status='complete';w.chrome.tabs.onUpdated.emit(61,{url:TARGET,status:'complete'},structuredClone(tab));});
  const r=await w.h.runSequentialCardBatch(s,w.tabs.get(7),q);assert.equal(r.checkpoint.cursor,1);assert.equal(w.calls.filter(x=>x[0]==='create').length,0);assert.ok(w.calls.some(x=>x[0]==='close'&&x[1]===61));
});

test('ambiguous owned target tabs pause safely and never create/navigate a third tab',async t=>{
  const w=fixture(t);for(const id of [61,62])w.tabs.set(id,{id,windowId:2,openerTabId:7,active:false,url:TARGET,status:'complete'});
  let q=cp(w,{in_flight:{child_tab_id:null,cursor:0,href:TARGET,started_at:Date.now(),stage:'TARGET_TAB_CREATE_INTENT'}});const s=await w.seed({status:'AVITO_TAB_ACTIVE',sequential_review:q});const r=await w.h.runSequentialCardBatch(s,w.tabs.get(7),q);
  assert.equal(r.checkpoint.cursor,0);assert.match(r.blocked_reason,/TARGET_TAB_AMBIGUOUS/);assert.equal(w.calls.filter(x=>x[0]==='create'||x[0]==='navigate').length,0);
});

test('legacy persisted owned about:blank tab migrates once without creating another child',async t=>{
  const w=fixture(t);w.tabs.set(63,{id:63,windowId:2,openerTabId:7,active:true,url:'about:blank',pendingUrl:'about:blank',status:'loading'});
  let q=cp(w,{in_flight:{child_tab_id:63,cursor:0,href:TARGET,started_at:Date.now(),stage:'CREATED'}});const s=await w.seed({status:'AVITO_TAB_ACTIVE',sequential_review:q});const r=await w.h.runSequentialCardBatch(s,w.tabs.get(7),q);
  assert.equal(r.checkpoint.cursor,1);assert.equal(w.calls.filter(x=>x[0]==='create').length,0);assert.equal(w.calls.filter(x=>x[0]==='navigate'&&x[1]===63&&x[2]===TARGET).length,1);
});

test('proxy ON and DIRECT use identical target-tab creation lifecycle',async t=>{
  async function run(direct){const w=loadWorker();try{const s=await w.seed({status:'AVITO_TAB_ACTIVE'});if(direct)await w.h.saveProxyRuntime({...await w.h.getProxyRuntime(),mode:'direct'});const r=await w.h.runSequentialCardBatch(s,w.tabs.get(7),cp(w));assert.equal(r.checkpoint.cursor,1);return w.calls.filter(x=>['create','navigate'].includes(x[0])).map(x=>[x[0],x[2]]);}finally{w.dispose();}}
  assert.deepEqual(await run(false),await run(true));
});

test('explicit queue path contains no normal about:blank child create primitive',()=>{
  const fs=require('node:fs'),path=require('node:path');const worker=fs.readFileSync(path.join(__dirname,'..','service_worker.js'),'utf8');
  const a=worker.indexOf('async function runSequentialCardBatch'),b=worker.indexOf('async function runExplicitListingQueue',a);const branch=worker.slice(a,b);
  assert.doesNotMatch(branch,/tabsCreate\(\{\s*url\s*:\s*['"]about:blank['"]/);assert.match(branch,/ensureSequentialOwnedTargetTab/);
});
