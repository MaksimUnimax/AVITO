'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadWorker}=require('./helpers/worker_vm.cjs');

test('completed non-Writing-Block assistant turn yields one same-chat format report and no Avito action', async()=>{
  const w=loadWorker();
  try{
    const state=w.C.makeState({
      search_id:'form-run',status:'WAITING_FOR_NEXT_ASSISTANT_FORM',phase:'CHATGPT_CAPTURE',user_started:true,
      current_window_id:2,chatgpt_tab_id:1,chatgpt_window_id:2,chat_origin:w.identity.origin,chat_path:w.identity.chat_path,conversation_id:w.identity.conversation_id,
      anchor_turn_id:'anchor-1',blocked_reason:null
    });
    await w.h.saveState(state);
    const response=await w.h.handlePromptFormError({candidate:{
      run_id:'form-run',anchor_turn_id:'anchor-1',assistant_turn_id:'assistant-code',
      origin:w.identity.origin,chat_path:w.identity.chat_path,conversation_id:w.identity.conversation_id,
      assistant_finality_confirmed:true,rejection_reason:'ASSISTANT_WRITING_BLOCK_REQUIRED'
    }},{tab:{...w.tabs.get(1)}});
    assert.equal(response.ok,true);
    assert.equal(response.data.accepted,true);
    assert.equal(response.data.reason,'ASSISTANT_WRITING_BLOCK_REQUIRED');
    assert.equal(w.calls.filter(x=>x[0]==='navigate'||x[0]==='reload').length,0);
    const logs=w.local[w.C.STORAGE.logs]||[];
    assert.ok(logs.some(x=>x.type==='ASSISTANT_WRITING_BLOCK_REQUIRED' && x.avito_mutated===false));
    const reportCalls=w.calls.filter(x=>x[0]==='message' && x[2]==='AF_CAPTURE_SEND_REPORT');
    assert.ok(reportCalls.length>=1,w.calls);
  } finally { w.dispose(); }
});
