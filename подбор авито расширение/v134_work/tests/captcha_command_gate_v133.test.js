'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadWorker}=require('./helpers/worker_vm.cjs');

test('CAPTCHA manual user turn re-anchors without reading user text and without starting Avito action', async()=>{
  const w=loadWorker();
  try{
    const state=w.C.makeState({
      search_id:'captcha-run',operation_id:'captcha-run:op',status:'WAITING_FOR_NEXT_ASSISTANT_FORM',phase:'CAPTCHA_MANUAL_WAIT',
      manual_gate_kind:'CAPTCHA',user_started:true,
      current_window_id:2,chatgpt_tab_id:1,chatgpt_window_id:2,chat_origin:w.identity.origin,chat_path:w.identity.chat_path,conversation_id:w.identity.conversation_id,
      anchor_turn_id:'captcha-report-turn',command_mode:'AVITO_UI',ui_action_plan:null,blocked_reason:null
    });
    await w.h.saveState(state);
    const response=await w.h.handleFullText({candidate:{
      run_id:'captcha-run',manual_interruption:true,next_user_turn_id:'captcha-solved-turn',anchor_turn_id:'captcha-report-turn',
      origin:w.identity.origin,chat_path:w.identity.chat_path,conversation_id:w.identity.conversation_id,
      prompt_text:'',payload_extracted:false,payload_bytes:0
    }},{tab:{...w.tabs.get(1)}});
    assert.equal(response.ok,true);
    assert.equal(response.data.reanchored,true);
    assert.equal(response.data.continuation_anchor_turn_id,'captcha-solved-turn');
    const after=await w.h.getState();
    assert.equal(after.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
    assert.equal(after.phase,'CAPTCHA_MANUAL_WAIT');
    assert.equal(after.manual_gate_kind,'CAPTCHA');
    assert.equal(after.anchor_turn_id,'captcha-solved-turn');
    assert.equal(after.assistant_turn_id,null);
    assert.equal(w.calls.filter(x=>x[0]==='navigate'||x[0]==='reload').length,0);
    const logs=w.local[w.C.STORAGE.logs]||[];
    const gate=logs.find(x=>x.type==='CAPTCHA_MANUAL_USER_TURN_REANCHORED');
    assert.ok(gate);
    assert.equal(gate.user_text_read,false);
  } finally { w.dispose(); }
});


test('v1.0.32 waiting state migrates back into CAPTCHA manual gate from visible CAPTCHA without navigation', async()=>{
  const w=loadWorker();
  try{
    const tab=w.tabs.get(7); tab.captcha=true;
    await w.h.saveState(w.C.makeState({
      search_id:'legacy-captcha-run',operation_id:'legacy-captcha-run:validation',status:'WAITING_FOR_NEXT_ASSISTANT_FORM',phase:'CHATGPT_CONTINUATION',
      manual_gate_kind:null,user_started:true,current_window_id:2,avito_tab_id:7,
      chatgpt_tab_id:1,chatgpt_window_id:2,chat_origin:w.identity.origin,chat_path:w.identity.chat_path,conversation_id:w.identity.conversation_id,
      anchor_turn_id:'validator-report-turn',blocked_reason:null
    }));
    await w.h.recoverRuntimeOnWake();
    const after=await w.h.getState();
    assert.equal(after.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
    assert.equal(after.phase,'CAPTCHA_MANUAL_WAIT');
    assert.equal(after.manual_gate_kind,'CAPTCHA');
    assert.equal(w.calls.filter(x=>x[0]==='navigate'||x[0]==='reload').length,0);
    const logs=w.local[w.C.STORAGE.logs]||[];
    assert.ok(logs.some(x=>x.type==='CAPTCHA_MANUAL_GATE_MIGRATED_FROM_VISIBLE_PAGE' && x.user_text_read===false));
  } finally { w.dispose(); }
});
