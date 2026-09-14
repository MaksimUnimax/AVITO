const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const source = process.env.AF_V143_SOURCE || path.join(repo, 'подбор авито расширение', 'releases', 'v1.0.43', 'v143_work', 'service_worker.js');
const worker = fs.readFileSync(source, 'utf8');

function between(startNeedle, endNeedle) {
  const start = worker.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = worker.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing ${endNeedle}`);
  return worker.slice(start, end);
}

test('exact v1.0.43 rate-limit recovery must not issue a fresh Avito request without proven egress change', () => {
  const fn = between('async function performReservedConnectionRecoveryInsideLane', '\nasync function recoverAvitoConnectionAndReload');
  assert.match(fn, /COOLDOWN_SAME_ROUTE/);
  assert.match(fn, /probe_ip_changed:false/);
  assert.match(fn, /AVITO_RECOVERY_FRESH_DOCUMENT_REQUESTED/);
  assert.ok(
    !(/probe_ip_changed:false/.test(fn) && /(tabsReload\(|tabsUpdate\()/.test(fn) && /AVITO_RECOVERY_FRESH_DOCUMENT_REQUESTED/.test(fn)),
    'BROKEN_V143: HTTP_429/RATE_LIMIT with probe_ip_changed=false can reach tabsReload/tabsUpdate and AVITO_RECOVERY_FRESH_DOCUMENT_REQUESTED'
  );
});

test('all intentional Avito navigation after a network block must cross one common request-authority gate', () => {
  assert.match(
    worker,
    /canIssueAvitoNetworkRequest|assertAvitoNetworkRequestAuthorized/,
    'BROKEN_V143: no central Avito network request authority gate exists'
  );
});

test('blocked recovery must fail closed when probes are unavailable, partial, timed out, same-IP, or unproven', () => {
  assert.match(
    worker,
    /AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE/,
    'BROKEN_V143: no fail-closed suppression reason exists for unproven egress recovery'
  );
});
