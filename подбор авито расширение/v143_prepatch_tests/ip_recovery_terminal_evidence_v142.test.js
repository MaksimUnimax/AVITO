'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
process.env.AF_SOURCE_ROOT=path.resolve(__dirname,'../releases/v1.0.42/v142_work');
const {loadWorker}=require('../releases/v1.0.42/v142_work/tests/helpers/worker_vm.cjs');

function fixture(t,opts={}) { const w=loadWorker(opts); t.after(()=>w.dispose()); return w; }

function recoveryState(base, overrides={}) {
  return {
    ...base,
    attempt:4,
    phase:'AWAITING_FRESH_DOCUMENT',
    interruption_kind:'IP_BLOCK',
    source:'installed_live_reproduction',
    prepared:{
      transport_status:'PROBES_COMPLETE',
      probe_before:'31.131.200.254',
      probe_after:'31.131.200.254',
      probe_ip_changed:false,
      endpoint_create:{state:'SKIPPED',reason:'API_KEY_UNAVAILABLE',attempt:3},
      avito_exit_ip_verified:false
    },
    create:{state:'SKIPPED',reason:'API_KEY_UNAVAILABLE',attempt:3},
    provider_rotation:{state:'ACKNOWLEDGED',attempt:4,ip_change_proven:false},
    ...overrides
  };
}

test('RED: terminal exhaustion report must preserve measured probe and endpoint evidence', async t=>{
  const w=fixture(t); let s=await w.seed();
  const rec=recoveryState(w.R.freshRecovery(s,7,Date.now(),'IP_BLOCK'));
  s=await w.h.saveState({...s,phase:'AVITO_NAVIGATION',connection_recovery:rec,avito_ip_block_reload_count:4});
  assert.equal(typeof w.ctx.avitoRuntimeFailureReport,'function','runtime failure formatter must be callable in exact worker VM');
  const report=w.ctx.avitoRuntimeFailureReport(s,'AVITO_IP_BLOCK_RECOVERY_EXHAUSTED');
  assert.match(report,/31\.131\.200\.254\s*(?:→|->)\s*31\.131\.200\.254/u,'report must expose before/after measured egress');
  assert.match(report,/IP[^\n]{0,40}(?:не измен|без подтверждённой смены|unchanged)/iu,'report must say the measured egress did not change');
  assert.match(report,/API_KEY_UNAVAILABLE/u,'report must preserve endpoint-create skip reason');
  assert.match(report,/provider[^\n]{0,60}ACKNOWLEDGED|rotation[^\n]{0,60}ACKNOWLEDGED/iu,'report must preserve provider-rotation acknowledgement without claiming IP proof');
});

test('RED: terminal exhaustion report must distinguish unresolved create from generic exhaustion', async t=>{
  const w=fixture(t); let s=await w.seed();
  const rec=recoveryState(w.R.freshRecovery(s,7,Date.now(),'IP_BLOCK'),{
    prepared:{
      transport_status:'PROBES_PARTIAL',
      probe_before:'31.131.200.254',
      probe_after:null,
      probe_after_error:'PROXY_EGRESS_DIAGNOSTIC_TIMEOUT',
      probe_ip_changed:false,
      endpoint_create:{state:'DISPATCHED_OUTCOME_UNKNOWN',attempt:3},
      avito_exit_ip_verified:false
    },
    create:{state:'DISPATCHED_OUTCOME_UNKNOWN',attempt:3}
  });
  s=await w.h.saveState({...s,phase:'AVITO_NAVIGATION',connection_recovery:rec,avito_ip_block_reload_count:4});
  const report=w.ctx.avitoRuntimeFailureReport(s,'AVITO_IP_BLOCK_RECOVERY_EXHAUSTED');
  assert.match(report,/PROXY_EGRESS_DIAGNOSTIC_TIMEOUT/u,'report must expose the egress diagnostic failure');
  assert.match(report,/DISPATCHED_OUTCOME_UNKNOWN/u,'report must expose unresolved endpoint-create outcome');
});
