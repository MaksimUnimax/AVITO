"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),test=require("node:test");
const root=path.join(__dirname,"..");
const worker=fs.readFileSync(path.join(root,"service_worker.js"),"utf8");
const avito=fs.readFileSync(path.join(root,"avito_content.js"),"utf8");
const recovery=require(path.join(root,"recovery.js"));
test("429 is recoverable from main-frame readiness, sequential detail and visible UI result",()=>{
  assert.match(worker,/post_navigation_rate_limit[\s\S]{0,180}RATE_LIMIT/);
  assert.match(worker,/signal === 'RATE_LIMIT' \|\| signal === 'IP_BLOCK' \|\| signal === 'PROXY_TRANSPORT'/);
  assert.match(worker,/uiPlanInterruption = Recovery\.interruption/);
  assert.match(worker,/\['IP_BLOCK','RATE_LIMIT','PROXY_TRANSPORT'\]\.includes\(uiPlanInterruption\)/);
});
test("rate-limit page is classified by both worker probe and Avito adapter",()=>{
  assert.match(worker,/publicPageInterruptionProbe/);
  assert.match(avito,/return \"AVITO_RATE_LIMIT\"/);
  assert.match(avito,/block === \"AVITO_RATE_LIMIT\" \? \"rate_limit\"/);
});
test("rate-limit retry is bounded and cancellable, never a tight reload loop",()=>{
  assert.equal(recovery.MAX_ATTEMPTS,4);
  assert.equal(recovery.RATE_LIMIT_RECOVERY_BUDGET_MS,120000);
  assert.ok(recovery.RATE_LIMIT_BACKOFF_MS.every(ms=>ms>=10000));
  const start=worker.indexOf('async function persistRateLimitBackoff');
  const end=worker.indexOf('async function performReservedConnectionRecoveryInsideLane',start);
  const fn=worker.slice(start,end);
  assert.match(fn,/RATE_LIMIT_BACKOFF/);
  assert.match(fn,/scheduleRateLimitRecoveryAlarm/);
  assert.match(fn,/resume_after/);
  const performStart=worker.indexOf('async function performReservedConnectionRecoveryInsideLane');
  const performEnd=worker.indexOf('async function recoverAvitoConnectionAndReload',performStart);
  const perform=worker.slice(performStart,performEnd);
  assert.match(perform,/AbortController/);
  assert.match(perform,/AVITO_RECOVERY_DEADLINE_EXCEEDED/);
});
