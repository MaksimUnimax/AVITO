'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadWorker}=require('./helpers/worker_vm.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function fixture(t,opts={}){const w=loadWorker(opts);t.after(()=>w.dispose());return w;}
async function seed(w,extra={}){return w.seed({status:'REPORT_DELIVERY_BLOCKED',report:'saved payload',report_kind:'ui_action_plan',report_delivery_id:'receipt-id',report_send_attempted:true,...extra});}
function reconcileReply(state='confirmed',onreply){return (id,m,done,x)=>{if(m.type==='AF_CAPTURE_RECONCILE_REPORT'){const answer={ok:true,state,identity:x.identity,anchor_turn_id:state==='confirmed'?'received-p1':null};if(onreply)onreply(answer,done,x);else x.finish(done,answer);return true;}};}
test('wake includes live failure REPORT_DELIVERY_BLOCKED: reconcile receipt and start next poll, no Send',async t=>{const w=fixture(t,{onMessage:reconcileReply()});await seed(w);await w.h.recoverRuntimeOnWake();const s=await w.h.getState();assert.equal(s.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.equal(s.anchor_turn_id,'received-p1');assert.equal(w.sent.length,0);assert(w.calls.some(x=>x[2]==='AF_CAPTURE_BEGIN_PROMPT_POLL'));assert.equal(w.calls.filter(x=>['reload','navigate','create'].includes(x[0])).length,0);});
test('send intent persists baseline BEFORE dispatch acknowledgement',async t=>{const w=fixture(t);await seed(w,{status:'REPORT_DELIVERY_IN_PROGRESS',report_send_attempted:null});const m={search_id:'test-run',delivery_id:'receipt-id',identity:w.identity,receipt:{baseline_user_turn_ids:['initial-user','older']}};const r=await w.h.commitReportSendIntent(m,{tab:w.tabs.get(1)});assert(r.ok);const s=await w.h.getState();assert.deepEqual([...s.report_send_receipt.baseline_user_turn_ids],['initial-user','older']);assert.equal(s.report_send_attempted,null);assert.equal(w.sent.length,0);});
for(const mismatch of ['tab','conversation','run','delivery','baseline'])test('send intent rejects '+mismatch+' mismatch without modifying receipt',async t=>{const w=fixture(t);await seed(w,{status:'REPORT_DELIVERY_IN_PROGRESS'});let m={search_id:'test-run',delivery_id:'receipt-id',identity:w.identity,receipt:{baseline_user_turn_ids:['initial-user']}};const sender={tab:{...w.tabs.get(1)}};if(mismatch==='tab')sender.tab.id=999;if(mismatch==='conversation')m.identity={...w.identity,conversation_id:'22222222-2222-4222-8222-222222222222'};if(mismatch==='run')m.search_id='other';if(mismatch==='delivery')m.delivery_id='other';if(mismatch==='baseline')m.receipt.baseline_user_turn_ids=[{}];assert.equal((await w.h.commitReportSendIntent(m,sender)).ok,false);assert.equal((await w.h.getState()).report_send_receipt,undefined);});
test('persisted receipt handed to adapter across worker restart with old predecessor removed',async t=>{const w=fixture(t,{onMessage:reconcileReply()});const receipt={baseline_user_turn_ids:['initial-user'],delivery_id:'receipt-id'};await seed(w,{report_send_receipt:receipt});await w.h.recoverRuntimeOnWake();assert.equal((await w.h.getState()).report,null);assert.equal(w.sent.length,0);assert.equal((await w.h.getState()).report_send_receipt,null);});
test('late hydration automatically rechecked without operator or repeat collection',async t=>{let checks=0;const w=fixture(t,{onMessage:(id,m,done,x)=>{if(m.type==='AF_CAPTURE_RECONCILE_REPORT'){checks++;x.finish(done,{ok:true,identity:x.identity,state:checks===1?'empty':'confirmed',anchor_turn_id:checks===1?null:'late-p1'});return true;}}});const s=await seed(w);await w.h.reconcileBlockedReport(s);w.h.scheduleReportAcknowledgement(await w.h.getState(),10);await delay(60);assert.equal((await w.h.getState()).anchor_turn_id,'late-p1');assert.equal(checks,2);assert.equal(w.sent.length,0);});
test('concurrent watchdog/Continue share one read-only reconciliation',async t=>{let checks=0;const w=fixture(t,{onMessage:reconcileReply('confirmed',(a,d,x)=>{checks++;setTimeout(()=>x.finish(d,a),20);})});const s=await seed(w);await Promise.all([w.h.reconcileBlockedReport(s),w.h.reconcileBlockedReport(s),w.h.continueReport()]);assert.equal(checks,1);assert.equal(w.sent.length,0);});
test('ACK budget exhaustion retains result and no retries or Send',async t=>{const w=fixture(t);await seed(w,{report_ack_budget:{deadline_at:Date.now()-1,attempt:12}});await w.h.recoverRuntimeOnWake();assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_RECONCILE_REPORT').length,0);assert.equal((await w.h.getState()).report,'saved payload');assert.equal(w.sent.length,0);});
test('explicit Continue can re-open only ACK budget, never repeat an uncertain Send',async t=>{const w=fixture(t,{onMessage:reconcileReply()});await seed(w,{report_ack_budget:{deadline_at:Date.now()-1,attempt:12}});const r=await w.h.continueReport();assert(r.ok);assert.equal(w.sent.length,0);assert.equal((await w.h.getState()).report,null);});
for(const action of ['stop','new_operation'])test('late reconciliation after '+action+' cannot resurrect old operation',async t=>{let released;const w=fixture(t,{onMessage:reconcileReply('confirmed',(a,d,x)=>{released=()=>x.finish(d,a);})});const s=await seed(w);const p=w.h.reconcileBlockedReport(s).catch(e=>e);while(!released)await delay(1);if(action==='stop')await w.h.stop();else await w.h.saveState({...await w.h.getState(),operation_id:'test-run:new-command',allow_new_operation:true,status:'COMMAND_CAPTURED',report:null});released();await p;assert.equal((await w.h.getState()).status,action==='stop'?'CANCELLED_BY_USER':'COMMAND_CAPTURED');assert.equal(w.sent.length,0);assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_BEGIN_PROMPT_POLL').length,0);});
test('sender in-flight is not reconciled by watchdog/Continue while it owns delivery',async t=>{let release;const w=fixture(t,{onMessage:(id,m,done,x)=>{if(m.type==='AF_CAPTURE_SEND_REPORT'){release=()=>x.finish(done,{ok:true,identity:x.identity,anchor_turn_id:'sent'});return true;}}});const s=await seed(w,{status:'REPORT_READY_FOR_DELIVERY',report_send_attempted:false});const p=w.h.deliverReportToPinnedChat(s,s.report,s.report_kind);while(!release)await delay(1);await w.h.recoverRuntimeOnWake();const r=await w.h.reconcileBlockedReport();assert(r.pending);assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_RECONCILE_REPORT').length,0);release();await p;});
test('new command admitted during poll-start cannot be overwritten by old delivery snapshot',async t=>{const w=fixture(t,{onMessage:(id,m,done,x)=>{if(m.type==='AF_CAPTURE_RECONCILE_REPORT'){x.finish(done,{ok:true,identity:x.identity,state:'confirmed',anchor_turn_id:'received-p1'});return true;}if(m.type==='AF_CAPTURE_BEGIN_PROMPT_POLL'){w.h.getState().then(s=>w.h.saveState({...s,operation_id:'test-run:p2',status:'COMMAND_CAPTURED',allow_new_operation:true})).then(()=>x.finish(done,{ok:true}));return true;}}});await seed(w);await w.h.reconcileBlockedReport();assert.equal((await w.h.getState()).operation_id,'test-run:p2');assert.equal((await w.h.getState()).status,'COMMAND_CAPTURED');});
test('old read request cannot alter a newer operation before context check',async t=>{const w=fixture(t);const old=await seed(w);await w.h.saveState({...old,operation_id:'new',allow_new_operation:true,status:'COMMAND_CAPTURED'});const r=await w.h.reconcileBlockedReport(old);assert(r.ignored);assert.equal(w.calls.length,0);});

test('v132 wake reconciles operator manual Send after pre-click button-missing failure and starts next poll without a second Send',async t=>{
  const w=fixture(t,{onMessage:reconcileReply('confirmed')});
  await seed(w,{report_send_attempted:false,report_delivery_error_code:'PRIMARY_COMPOSER_SEND_BUTTON_MISSING'});
  await w.h.recoverRuntimeOnWake();
  const s=await w.h.getState();
  assert.equal(s.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
  assert.equal(s.anchor_turn_id,'received-p1');
  assert.equal(w.sent.length,0);
  assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_SEND_REPORT').length,0);
  assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_BEGIN_PROMPT_POLL').length,1);
});

test('v132 pre-click staged report keeps bounded read-only reconciliation alive until operator manual Send appears',async t=>{
  let checks=0;
  const w=fixture(t,{onMessage:(id,m,done,x)=>{
    if(m.type==='AF_CAPTURE_RECONCILE_REPORT'){
      checks++;
      x.finish(done,{ok:true,identity:x.identity,state:checks===1?'staged':'confirmed',anchor_turn_id:checks===1?null:'manual-report-turn'});
      return true;
    }
  }});
  const s=await seed(w,{report_send_attempted:false,report_delivery_error_code:'PRIMARY_COMPOSER_SEND_BUTTON_MISSING'});
  await w.h.reconcileBlockedReport(s);
  assert.equal((await w.h.getState()).status,'REPORT_READY_IN_COMPOSER');
  w.h.scheduleReportAcknowledgement(await w.h.getState(),10);
  await delay(80);
  const after=await w.h.getState();
  assert.equal(after.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
  assert.equal(after.anchor_turn_id,'manual-report-turn');
  assert.equal(w.sent.length,0);
  assert.equal(w.calls.filter(x=>x[2]==='AF_CAPTURE_SEND_REPORT').length,0);
});
