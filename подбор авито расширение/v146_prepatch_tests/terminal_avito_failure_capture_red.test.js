'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

const ROOT=path.resolve(process.env.AF_SOURCE_ROOT || path.join(__dirname,'..','releases','v1.0.45','v145_work'));
const {loadWorker}=require(path.join(ROOT,'tests','helpers','worker_vm.cjs'));

test('RED v1.0.45: terminal non-CAPTCHA avito_failure must quiesce capture instead of re-arming assistant form poll', async t=>{
  const worker=loadWorker();
  t.after(()=>worker.dispose());

  const seeded=await worker.seed({
    status:'AVITO_FAILURE_REPORT_READY',
    phase:'AVITO_NAVIGATION',
    blocked_reason:'AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE',
    manual_gate_kind:null,
    report:'Avito Finder: действие на Avito остановлено безопасно.',
    report_kind:'avito_failure',
    report_delivery_id:'test-run:avito_failure:red-v146',
    report_ack_budget:{deadline_at:Date.now()+120000,attempt:0}
  });

  await worker.h.deliverReportToPinnedChat(seeded,seeded.report,'avito_failure');
  const durable=await worker.h.getState();
  const pollCalls=worker.calls.filter(call=>call[0]==='message' && call[2]==='AF_CAPTURE_BEGIN_PROMPT_POLL');
  const stopCalls=worker.calls.filter(call=>call[0]==='message' && call[2]==='AF_CAPTURE_STOP');

  // Live causal observation on v1.0.44 and exact-source proof on v1.0.45:
  // the failure report is delivered, then report delivery currently starts a
  // fresh assistant-form poll. That makes the next ordinary assistant response
  // become ASSISTANT_WRITING_BLOCK_REQUIRED even though the Avito operation is terminal.
  assert.ok(worker.sent.length>=1,'the terminal failure report itself must still be delivered');

  // Desired v1.0.46 contract. These assertions MUST FAIL on exact v1.0.45.
  assert.equal(pollCalls.length,0,
    'RED_EXPECTED: terminal non-CAPTCHA avito_failure incorrectly starts AF_CAPTURE_BEGIN_PROMPT_POLL');
  assert.ok(stopCalls.length>=1,
    'RED_EXPECTED: terminal non-CAPTCHA avito_failure does not stop old prompt capture');
  assert.equal(durable.status,'TERMINAL_REPORT_DELIVERED',
    `RED_EXPECTED: terminal failure remained conversational; actual status=${durable.status}`);
  assert.equal(durable.report,null,
    'RED_EXPECTED: terminal quiescent state must clear transient report payload so explicit new Start is not blocked');
});
