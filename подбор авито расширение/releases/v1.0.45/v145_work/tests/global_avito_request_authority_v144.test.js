const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourceRoot = process.env.AF_SOURCE_ROOT || path.resolve(__dirname, '..');
const workerPath = path.join(sourceRoot, 'service_worker.js');
const recoveryPath = path.join(sourceRoot, 'recovery.js');
const worker = fs.readFileSync(workerPath, 'utf8');
delete require.cache[require.resolve(recoveryPath)];
const Recovery = require(recoveryPath);

function between(startNeedle, endNeedle) {
  const start = worker.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = worker.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing ${endNeedle}`);
  return worker.slice(start, end);
}

function stateFor(authority, prepared = {}) {
  return {
    search_id: 'af-v144-test',
    operation_id: 'op-v144-test',
    avito_network_authority: authority,
    connection_recovery: { prepared }
  };
}

test('blocked egress is fail-closed until complete measured IP change advances epoch', () => {
  const blocked = Recovery.beginBlockedEgressEpoch(null, 'RATE_LIMIT', 1, 1000);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.egress_change_confirmed, false);
  assert.equal(Recovery.avitoRequestAuthority(stateFor(blocked)).allowed, false);

  const matrix = [
    ['PROBES_UNAVAILABLE', { transport_status: 'PROBES_UNAVAILABLE', probe_ip_changed: false }],
    ['TRANSPORT_PARTIAL', { transport_status: 'PROBES_PARTIAL', probe_before: '1.1.1.1', probe_ip_changed: false }],
    ['PROBE_TIMEOUT', { transport_status: 'PROBES_UNAVAILABLE', probe_before_error: 'EGRESS_PROBE_TIMEOUT', probe_after_error: 'EGRESS_PROBE_TIMEOUT', probe_ip_changed: false }],
    ['PROVIDER_ROTATION_ACK_WITHOUT_IP_CHANGE', { transport_status: 'PROBES_COMPLETE', probe_before: '1.1.1.1', probe_after: '1.1.1.1', probe_ip_changed: false, provider_rotation: { state: 'ACK' } }],
    ['ENDPOINT_CREATED_BUT_SAME_EGRESS', { transport_status: 'PROBES_COMPLETE', probe_before: '1.1.1.1', probe_after: '1.1.1.1', probe_ip_changed: false, endpoint_create: { state: 'CREATED' } }],
    ['SPOOFED_FLAG_WITHOUT_COMPLETE_PROBES', { transport_status: 'PROBES_UNAVAILABLE', probe_before: '1.1.1.1', probe_after: '2.2.2.2', probe_ip_changed: true }],
  ];

  for (const [name, prepared] of matrix) {
    const evidence = Recovery.applyAvitoEgressEvidence(blocked, prepared, 2000);
    const authority = Recovery.avitoRequestAuthority(stateFor(evidence, prepared));
    assert.equal(authority.allowed, false, `${name} must fail closed`);
    assert.equal(authority.reason, 'AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE', name);
    assert.equal(authority.egress_change_confirmed, false, name);
    assert.ok(authority.egress_epoch <= authority.blocked_egress_epoch, name);
  }

  const prepared = {
    transport_status: 'PROBES_COMPLETE',
    probe_before: '1.1.1.1',
    probe_after: '2.2.2.2',
    probe_ip_changed: true
  };
  const evidence = Recovery.applyAvitoEgressEvidence(blocked, prepared, 3000);
  const authority = Recovery.avitoRequestAuthority(stateFor(evidence, prepared));
  assert.equal(authority.allowed, true);
  assert.equal(authority.reason, 'EGRESS_CHANGE_CONFIRMED');
  assert.equal(authority.egress_change_confirmed, true);
  assert.ok(authority.egress_epoch > authority.blocked_egress_epoch);
});

test('provider ACK, profile identity and elapsed backoff are not request authority', () => {
  const blocked = Recovery.beginBlockedEgressEpoch(null, 'RATE_LIMIT', 2, 1000);
  const prepared = {
    strategy: 'PROVIDER_ROTATION_ACK',
    transport_status: 'PROBES_UNAVAILABLE',
    probe_ip_changed: false,
    provider_rotation: { state: 'ACK', profile_id: 'new-profile' },
    endpoint_create: { state: 'CREATED', endpoint_id: 'new-endpoint' },
    retry_after_elapsed: true,
    fresh_document: true
  };
  const evidence = Recovery.applyAvitoEgressEvidence(blocked, prepared, 999999);
  const authority = Recovery.avitoRequestAuthority(stateFor(evidence, prepared));
  assert.equal(authority.allowed, false);
  assert.equal(authority.reason, 'AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE');
});

test('common low-level Avito navigation primitives are guarded by one request authority assertion', () => {
  assert.match(worker, /async function assertAvitoNetworkRequestAuthorized\(/);
  assert.match(worker, /AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE/);

  const wrappers = between('const tabsQuery =', '\nconst tabsSend =');
  assert.match(wrappers, /tabsUpdate = async[\s\S]*assertAvitoNetworkRequestAuthorized\('tabs\.update'/);
  assert.match(wrappers, /tabsReload = async[\s\S]*assertAvitoNetworkRequestAuthorized\('tabs\.reload'/);
  assert.match(wrappers, /tabsCreate = async[\s\S]*assertAvitoNetworkRequestAuthorized\('tabs\.create'/);
  assert.equal((worker.match(/=> chrome\.tabs\.update\(/g) || []).length, 1, 'all chrome.tabs.update calls must flow through guarded wrapper');
  assert.equal((worker.match(/=> chrome\.tabs\.reload\(/g) || []).length, 1, 'all chrome.tabs.reload calls must flow through guarded wrapper');
  assert.equal((worker.match(/=> chrome\.tabs\.create\(/g) || []).length, 1, 'all chrome.tabs.create calls must flow through guarded wrapper');
});

test('network block closes authority before rate-limit backoff can return', () => {
  const fn = between('async function recoverAvitoConnectionAndReload', '\nasync function resumePersistedConnectionRecovery');
  const closeIndex = fn.indexOf('avito_network_authority:Recovery.beginBlockedEgressEpoch');
  const backoffIndex = fn.indexOf("if(interruptionKind==='RATE_LIMIT')");
  assert.ok(closeIndex >= 0, 'blocked epoch must be persisted at recovery entry');
  assert.ok(backoffIndex >= 0, 'rate-limit backoff branch missing');
  assert.ok(closeIndex < backoffIndex, 'request authority must close before RATE_LIMIT backoff can return');
});

test('RATE_LIMIT no longer gets same-route retry authority and measured evidence is persisted before fresh request', () => {
  const fn = between('async function performReservedConnectionRecoveryInsideLane', '\nasync function recoverAvitoConnectionAndReload');
  assert.doesNotMatch(fn, /COOLDOWN_SAME_ROUTE/);
  assert.match(fn, /const prepared=await prepareRecoveryProxy/);
  assert.match(fn, /Recovery\.applyAvitoEgressEvidence/);
  assert.match(fn, /AVITO_RECOVERY_FRESH_DOCUMENT_REQUESTED/);

  const evidenceIndex = fn.indexOf('Recovery.applyAvitoEgressEvidence');
  const reloadIndex = fn.indexOf('tabsReload(');
  const updateIndex = fn.indexOf('tabsUpdate(');
  assert.ok(evidenceIndex >= 0);
  assert.ok(reloadIndex > evidenceIndex, 'reload must be downstream of persisted egress evidence');
  assert.ok(updateIndex > evidenceIndex, 'navigation must be downstream of persisted egress evidence');
});

test('unblocked normal operation remains allowed', () => {
  const authority = Recovery.avitoRequestAuthority({ search_id: 'normal' });
  assert.equal(authority.allowed, true);
  assert.equal(authority.reason, 'NO_BLOCKED_EGRESS');
});
