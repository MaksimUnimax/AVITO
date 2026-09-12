'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {loadWorker}=require('./helpers/worker_vm.cjs');
const p1='https://www.avito.ru/all/nastolnye_kompyutery?q=computer&s=104';
const p2=p1+'&p=2';
const context=url=>({url,page_kind:'search_results',city:'',query:'computer',dialog_open:false,login_popup:false});
const parsed=url=>({mode:'AVITO_UI',ui_action_plan:{page_url:url,timing_profile:'CONTROL_VISIBLE',steps:[{type:'COLLECT_LISTINGS',limit:30}],plan_fingerprint:'p2'},page_url:url});
test('assistant p1 to p2 navigation persists intent before navigation and collects p2 instead of manual-change report',async()=>{
 let beforeNav;const w=loadWorker({onNavigate(t,ctx){beforeNav=w.local[w.C.STORAGE.state]?.command_navigation_intent;}});
 try {const state=await w.seed({last_route_context:context(p1)});w.tabs.get(7).url=p1;
 const command=w.C.parseCommandForm('Режим:\nAVITO_UI\nСтраница:\n'+p2+'\nСобери до 30 видимых объявлений.');
 assert.equal(command.valid,true,JSON.stringify(command));await w.h.queueAvitoTask(state,command);
 assert.equal(beforeNav?.requested_url,p2);assert.equal(beforeNav?.operation_id,w.R.operationKey(state));
 assert.equal(w.sent.length,1);assert.equal(w.sent[0].delivery_id.includes('ui_action_plan'),true);assert.match(w.sent[0].report_text,/COLLECT_LISTINGS/);
 assert.equal((await w.h.getState()).command_navigation_intent,null);
 }finally{w.dispose();}
});
for(const kind of ['missing_intent','wrong_operation','wrong_tab','wrong_url'])test('unrequested route change remains reported: '+kind,async()=>{
 const w=loadWorker();try {let s=await w.seed({status:'AVITO_TAB_ACTIVE',last_route_context:context(p1)});w.tabs.get(7).url=p2;
 let intent={operation_id:w.R.operationKey(s),tab_id:7,requested_url:p2,from_url:p1};if(kind==='missing_intent')intent=null;if(kind==='wrong_operation')intent.operation_id='stale';if(kind==='wrong_tab')intent.tab_id=9;if(kind==='wrong_url')intent.requested_url=p1;
 s=await w.h.saveState({...s,command_navigation_intent:intent});const r=await w.ctx.__AF_TEST_EXPORTS.optionalLogin.preflightRouteContext(s,w.tabs.get(7));
 assert.equal(r.changed,true);assert.equal(w.sent.length,1);assert.match(w.sent[0].report_text,/VISIBLE_AVITO_CONTEXT_CHANGED/);
 }finally{w.dispose();}
});
test('matched navigation intent is one-shot, subsequent manual change still reported',async()=>{
 const w=loadWorker();try {let s=await w.seed({status:'AVITO_TAB_ACTIVE',last_route_context:context(p1)});w.tabs.get(7).url=p2;
 s=await w.h.saveState({...s,command_navigation_intent:{operation_id:w.R.operationKey(s),tab_id:7,requested_url:p2}});
 const r=await w.ctx.__AF_TEST_EXPORTS.optionalLogin.preflightRouteContext(s,w.tabs.get(7));assert.equal(r.changed,false);assert.equal(r.state.command_navigation_intent,null);assert.equal(w.sent.length,0);
 w.tabs.get(7).url=p1;const second=await w.ctx.__AF_TEST_EXPORTS.optionalLogin.preflightRouteContext(r.state,w.tabs.get(7));assert.equal(second.changed,true);assert.equal(w.sent.length,1);
 }finally{w.dispose();}
});
test('expected navigation cannot bypass optional login overlay',async()=>{
 const w=loadWorker({onMessage(id,msg,done,{finish}){if(msg.type==='AF_GET_ROUTE_CONTEXT'){finish(done,{ok:true,context:{...context(p2),login_popup:true}});return true;}}});
 try {let s=await w.seed({status:'AVITO_TAB_ACTIVE',last_route_context:context(p1)});w.tabs.get(7).url=p2;
 s=await w.h.saveState({...s,command_navigation_intent:{operation_id:w.R.operationKey(s),tab_id:7,requested_url:p2}});const r=await w.ctx.__AF_TEST_EXPORTS.optionalLogin.preflightRouteContext(s,w.tabs.get(7));
 assert.equal(r.changed,true);assert.match(w.sent[0].report_text,/OPTIONAL_LOGIN_POPUP_OBSERVED/);
 }finally{w.dispose();}
});
test('pending CAPTCHA does not consume the intended navigation record',async()=>{
 const w=loadWorker({onMessage(id,msg,done,{finish}){if(msg.type==='AF_GET_ROUTE_CONTEXT'){finish(done,{ok:true,context:{...context(p2),page_kind:'captcha'}});return true;}}});
 try {let s=await w.seed({status:'AVITO_TAB_ACTIVE',last_route_context:context(p1)});w.tabs.get(7).url=p2;
 s=await w.h.saveState({...s,command_navigation_intent:{operation_id:w.R.operationKey(s),tab_id:7,requested_url:p2}});const r=await w.ctx.__AF_TEST_EXPORTS.optionalLogin.preflightRouteContext(s,w.tabs.get(7));assert.equal(r.changed,false);assert.ok(r.state.command_navigation_intent);assert.equal(w.sent.length,0);
 }finally{w.dispose();}
});
