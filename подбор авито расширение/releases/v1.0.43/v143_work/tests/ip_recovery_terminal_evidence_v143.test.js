'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const SOURCE_ROOT=process.env.AF_SOURCE_ROOT ? path.resolve(process.env.AF_SOURCE_ROOT) : path.resolve(__dirname,'..');
process.env.AF_SOURCE_ROOT=SOURCE_ROOT;
const {loadWorker}=require(path.join(SOURCE_ROOT,'tests/helpers/worker_vm.cjs'));

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

test('terminal exhaustion report preserves measured probe and endpoint evidence', async t=>{
  const w=fixture(t); let s=await w.seed();
  const rec=recoveryState(w.R.freshRecovery(s,7,Date.now(),'IP_BLOCK'));
  s=await w.h.saveState({...s,phase:'AVITO_NAVIGATION',connection_recovery:rec,avito_ip_block_reload_count:4});
  const report=w.ctx.avitoRuntimeFailureReport(s,'AVITO_IP_BLOCK_RECOVERY_EXHAUSTED');
  assert.match(report,/31\.131\.200\.254\s*(?:→|->)\s*31\.131\.200\.254/u);
  assert.match(report,/без подтверждённой смены IP/iu);
  assert.match(report,/API_KEY_UNAVAILABLE/u);
  assert.match(report,/ACKNOWLEDGED/u);
  assert.match(report,/PROBES_COMPLETE/u);
  assert.doesNotMatch(report,/fixture-password|fixture-user|api_key\s*[:=]/iu);
});

test('terminal exhaustion report preserves partial-probe and unresolved-create evidence', async t=>{
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
    create:{state:'DISPATCHED_OUTCOME_UNKNOWN',attempt:3},
    provider_rotation:null
  });
  s=await w.h.saveState({...s,phase:'AVITO_NAVIGATION',connection_recovery:rec,avito_ip_block_reload_count:4});
  const report=w.ctx.avitoRuntimeFailureReport(s,'AVITO_IP_BLOCK_RECOVERY_EXHAUSTED');
  assert.match(report,/PROXY_EGRESS_DIAGNOSTIC_TIMEOUT/u);
  assert.match(report,/DISPATCHED_OUTCOME_UNKNOWN/u);
  assert.match(report,/PROBES_PARTIAL/u);
});
