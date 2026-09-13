'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadWorker}=require('./helpers/worker_vm.cjs');
function fixture(t,onMessage){const w=loadWorker({onMessage});t.after(()=>w.dispose());return w;}
async function seedUncertain(w,extra={}){
  return w.seed({
    status:'START_DELIVERY_UNCERTAIN',phase:'CHATGPT_START_RECONCILIATION',
    anchor_turn_id:null,expected_assistant_turn_id:null,
    start_send_attempted:true,
    start_send_receipt:{schema:2,baseline_user_turn_ids:['previous'],baseline_assistant_turn_ids:['oldassistant'],baseline_visible_user_count:1,baseline_visible_exact_user_count:0,previous_anchor_turn_id:'previous',intent_at:Date.now()},
    start_ack_budget:{deadline_at:Date.now()+120000,attempt:0},
    report:null,...extra
  });
}
test('uncertain start reconciles late exact user turn and starts prompt poll without new Send',async t=>{
  let polls=[];const w=fixture(t,(id,m,done,x)=>{
    if(m.type==='AF_CAPTURE_RECONCILE_START'){x.finish(done,{ok:true,state:'confirmed',receipt_mode:'exact_user_turn',anchor_turn_id:'late-user',expected_assistant_turn_id:null,identity:x.identity});return true;}
    if(m.type==='AF_CAPTURE_BEGIN_PROMPT_POLL'){polls.push(m);x.finish(done,{ok:true});return true;}
  });
  const s=await seedUncertain(w);const r=await w.h.reconcileUncertainStart(s);assert.equal(r.ok,true);const end=await w.h.getState();assert.equal(end.status,'WAITING_FOR_ASSISTANT_WRITING_BLOCK');assert.equal(end.anchor_turn_id,'late-user');assert.equal(end.expected_assistant_turn_id,null);assert.equal(end.start_send_receipt,null);assert.equal(polls.length,1);assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_START_AND_ANCHOR').length,0);
});
test('assistant-first reconciliation binds exact new assistant to prior safe anchor',async t=>{
  let poll=null;const w=fixture(t,(id,m,done,x)=>{
    if(m.type==='AF_CAPTURE_RECONCILE_START'){x.finish(done,{ok:true,state:'confirmed',receipt_mode:'assistant_turn_fallback',anchor_turn_id:'previous',expected_assistant_turn_id:'new-assistant',identity:x.identity});return true;}
    if(m.type==='AF_CAPTURE_BEGIN_PROMPT_POLL'){poll=m;x.finish(done,{ok:true});return true;}
  });
  const s=await seedUncertain(w);await w.h.reconcileUncertainStart(s);const end=await w.h.getState();assert.equal(end.anchor_turn_id,'previous');assert.equal(end.expected_assistant_turn_id,'new-assistant');assert.equal(poll.expected_assistant_turn_id,'new-assistant');
});
test('pressing Start again while receipt pending performs read-only reconciliation and never sends second Ищи',async t=>{
  let reconciles=0;const w=fixture(t,(id,m,done,x)=>{
    if(m.type==='AF_CAPTURE_RECONCILE_START'){reconciles++;x.finish(done,{ok:true,state:'pending',receipt_mode:'pending',identity:x.identity});return true;}
  });
  await seedUncertain(w);const r=await w.h.begin();assert.equal(r.ok,true);const end=await w.h.getState();assert.equal(end.status,'START_DELIVERY_UNCERTAIN');assert.equal(reconciles,1);assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_START_AND_ANCHOR').length,0);assert.equal(end.start_ack_budget.attempt,1);
});
test('worker wake reconciles uncertain start instead of creating a new operation',async t=>{
  let reconciles=0;const w=fixture(t,(id,m,done,x)=>{if(m.type==='AF_CAPTURE_RECONCILE_START'){reconciles++;x.finish(done,{ok:true,state:'pending',receipt_mode:'pending',identity:x.identity});return true;}});
  await seedUncertain(w);await w.h.recoverRuntimeOnWake();const end=await w.h.getState();assert.equal(end.status,'START_DELIVERY_UNCERTAIN');assert.equal(reconciles,1);assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_START_AND_ANCHOR').length,0);
});
test('STOP fences an uncertain start and later wake cannot reconcile or send it',async t=>{
  let reconciles=0;const w=fixture(t,(id,m,done,x)=>{if(m.type==='AF_CAPTURE_RECONCILE_START'){reconciles++;x.finish(done,{ok:true,state:'pending',identity:x.identity});return true;}});
  await seedUncertain(w);await w.h.stop();await w.h.recoverRuntimeOnWake();const end=await w.h.getState();assert.equal(end.status,'CANCELLED_BY_USER');assert.equal(reconciles,0);
});
test('missing pinned chat consumes bounded reconciliation budget and never sends Start',async t=>{
  const wrong={origin:'https://chatgpt.com',chat_path:'/c/22222222-2222-4222-8222-222222222222',conversation_id:'22222222-2222-4222-8222-222222222222'};
  const w=fixture(t,(id,m,done,x)=>{
    if(m.type==='AF_CAPTURE_PING'){x.finish(done,{ok:true,content_script_protocol:'avito_finder_bridge_exact_capture_v1',content_script_version:'0.6.14',identity:wrong});return true;}
  });
  const s=await seedUncertain(w);
  const r=await w.h.reconcileUncertainStart(s);
  const end=await w.h.getState();
  assert.equal(r.ok,false);
  assert.equal(end.status,'START_DELIVERY_UNCERTAIN');
  assert.equal(end.start_ack_budget.attempt,1);
  assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_START_AND_ANCHOR').length,0);
});
