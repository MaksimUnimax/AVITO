'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

const ROOT=path.resolve(process.env.AF_SOURCE_ROOT || path.join(__dirname,'..','releases','v1.0.46','v146_work'));
const {loadWorker}=require(path.join(ROOT,'tests','helpers','worker_vm.cjs'));

function messageCalls(worker,type){return worker.calls.filter(call=>call[0]==='message' && call[2]===type);}

async function seedReport(worker,{kind='avito_failure',blockedReason='AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE',status='AVITO_FAILURE_REPORT_READY',manualGateKind=null}={}){
  return worker.seed({
    status,
    phase:'AVITO_FAILURE',
    blocked_reason:blockedReason,
    manual_gate_kind:manualGateKind,
    report:`fixture report ${kind}`,
    report_kind:kind,
    report_delivery_id:`test-run:${kind}:${Date.now()}`,
    report_ack_budget:{deadline_at:Date.now()+120000,attempt:0}
  });
}

test('terminal non-CAPTCHA avito_failure quiesces prompt capture after confirmed delivery',async t=>{
  const worker=loadWorker();t.after(()=>worker.dispose());
  const state=await seedReport(worker);
  await worker.h.deliverReportToPinnedChat(state,state.report,'avito_failure');
  const durable=await worker.h.getState();
  assert.equal(durable.status,'TERMINAL_REPORT_DELIVERED');
  assert.equal(durable.phase,'CHATGPT_TERMINAL_REPORT');
  assert.equal(durable.report,null);
  assert.equal(durable.report_kind,null);
  assert.equal(durable.user_started,false);
  assert.equal(messageCalls(worker,'AF_CAPTURE_BEGIN_PROMPT_POLL').length,0);
  assert.equal(messageCalls(worker,'AF_CAPTURE_STOP').length,1);
  assert.equal(worker.sent.length,1,'the terminal failure report is still delivered exactly once');
});

test('terminal avito_failure does not require a continuation anchor to quiesce after confirmed send',async t=>{
  const worker=loadWorker({onMessage(id,msg,done,{finish,identity,sent}){
    if(msg.type==='AF_CAPTURE_SEND_REPORT'){
      sent.push(msg);finish(done,{ok:true,identity,anchor_turn_id:null});return true;
    }
    return false;
  }});t.after(()=>worker.dispose());
  const state=await seedReport(worker);
  await worker.h.deliverReportToPinnedChat(state,state.report,'avito_failure');
  const durable=await worker.h.getState();
  assert.equal(durable.status,'TERMINAL_REPORT_DELIVERED');
  assert.equal(messageCalls(worker,'AF_CAPTURE_BEGIN_PROMPT_POLL').length,0);
  assert.equal(messageCalls(worker,'AF_CAPTURE_STOP').length,1);
});

test('CAPTCHA avito_failure preserves manual continuation and prompt polling',async t=>{
  const worker=loadWorker();t.after(()=>worker.dispose());
  const state=await seedReport(worker,{blockedReason:'CAPTCHA_MANUAL_REQUIRED'});
  await worker.h.deliverReportToPinnedChat(state,state.report,'avito_failure');
  const durable=await worker.h.getState();
  assert.equal(durable.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
  assert.equal(durable.manual_gate_kind,'CAPTCHA');
  assert.equal(messageCalls(worker,'AF_CAPTURE_BEGIN_PROMPT_POLL').length,1);
  assert.equal(messageCalls(worker,'AF_CAPTURE_STOP').length,0);
});

test('validation_error preserves v1.0.35 continuation semantics',async t=>{
  const worker=loadWorker();t.after(()=>worker.dispose());
  const state=await seedReport(worker,{kind:'validation_error',blockedReason:'ASSISTANT_WRITING_BLOCK_REQUIRED',status:'VALIDATION_ERROR_REPORT_READY'});
  await worker.h.deliverReportToPinnedChat(state,state.report,'validation_error');
  const durable=await worker.h.getState();
  assert.equal(durable.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
  assert.equal(messageCalls(worker,'AF_CAPTURE_BEGIN_PROMPT_POLL').length,1);
  assert.equal(messageCalls(worker,'AF_CAPTURE_STOP').length,0);
});

test('reconciled terminal non-CAPTCHA avito_failure also quiesces instead of re-arming prompt poll',async t=>{
  const worker=loadWorker({onMessage(id,msg,done,{finish,identity}){
    if(msg.type==='AF_CAPTURE_RECONCILE_REPORT'){
      finish(done,{ok:true,state:'confirmed',anchor_turn_id:'user-reconciled',identity});return true;
    }
    return false;
  }});t.after(()=>worker.dispose());
  const state=await seedReport(worker,{status:'REPORT_DELIVERY_UNCERTAIN'});
  const result=await worker.h.reconcileBlockedReport(state);
  const durable=await worker.h.getState();
  assert.equal(result.ok,true);
  assert.equal(durable.status,'TERMINAL_REPORT_DELIVERED');
  assert.equal(durable.report,null);
  assert.equal(messageCalls(worker,'AF_CAPTURE_BEGIN_PROMPT_POLL').length,0);
  assert.equal(messageCalls(worker,'AF_CAPTURE_STOP').length,1);
});

test('quiescent terminal state stays inert on runtime wake',async t=>{
  const worker=loadWorker();t.after(()=>worker.dispose());
  const state=await seedReport(worker);
  await worker.h.deliverReportToPinnedChat(state,state.report,'avito_failure');
  const beforePolls=messageCalls(worker,'AF_CAPTURE_BEGIN_PROMPT_POLL').length;
  await worker.h.recoverRuntimeOnWake();
  const durable=await worker.h.getState();
  assert.equal(durable.status,'TERMINAL_REPORT_DELIVERED');
  assert.equal(messageCalls(worker,'AF_CAPTURE_BEGIN_PROMPT_POLL').length,beforePolls);
});
