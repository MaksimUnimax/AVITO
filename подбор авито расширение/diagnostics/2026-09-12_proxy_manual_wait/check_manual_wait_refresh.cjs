'use strict';
// Characterization only: actual packaged worker, offline Chrome API doubles.
// This does NOT test a live proxy, solve CAPTCHA, or patch production code.
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {loadWorker} = require(path.join(process.env.AF_SOURCE_ROOT, 'tests/helpers/worker_vm.cjs'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  let networkCalls = 0;
  const w = loadWorker({fetch: async () => { networkCalls++; throw new Error('UNEXPECTED_NETWORK_CALL'); }});
  const result = {scope:'OFFLINE_ACTUAL_PACKAGED_WORKER_WITH_CHROME_API_DOUBLES',kind:'STATE_CHARACTERIZATION_NOT_FIX_ACCEPTANCE',cases:[]};
  try {
    await sleep(20);
    await w.seed({status:'WAITING_FOR_NEXT_ASSISTANT_FORM',phase:'CAPTCHA_MANUAL_WAIT',manual_gate_kind:'CAPTCHA',last_route_context:null});
    const before = w.calls.length;
    for (const [index, statusCode] of [429,403].entries()) {
      const event = {type:'main_frame',tabId:7,requestId:String(100+index),url:w.tabs.get(7).url,statusCode,fromCache:false};
      w.chrome.webRequest.onBeforeRequest.emit(event);
      w.chrome.webRequest.onCompleted.emit(event);
      w.chrome.tabs.onUpdated.emit(7,{status:'complete'},w.tabs.get(7));
      await sleep(600);
      const state = await w.h.getState();
      const evidence = await w.h.networkEvidenceForTab(7);
      assert.equal(evidence.status_code,statusCode);
      assert.equal(state.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');
      assert.equal(state.phase,'CAPTCHA_MANUAL_WAIT');
      assert.equal(state.manual_gate_kind,'CAPTCHA');
      result.cases.push({http_status:statusCode,network_evidence_recorded:true,status_after:state.status,phase_after:state.phase});
    }
    await w.h.recoverRuntimeOnWake();
    const state = await w.h.getState();
    const forbidden = w.calls.slice(before).filter(c=>['pac','proxy_clear','navigate','reload','create'].includes(c[0]) || (c[0]==='message' && c[2]==='AF_EXECUTE_AVITO_UI_PLAN'));
    assert.equal(forbidden.length,0);
    assert.equal(networkCalls,0);
    assert.equal(state.phase,'CAPTCHA_MANUAL_WAIT');
    result.result='OBSERVED_WAIT_STATE_DOES_NOT_RESTART_ON_REFRESH';
    result.automatic_navigation_or_proxy_mutations=forbidden;
    result.network_calls=networkCalls;
    result.installed_user_chrome='NOT_TESTED';
    result.actual_proxy_route='NOT_TESTED';
    fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
  } finally {w.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
