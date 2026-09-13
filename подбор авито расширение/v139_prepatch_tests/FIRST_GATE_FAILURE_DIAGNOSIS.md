# v1.0.39 first full-gate failure diagnosis

Date: 2026-09-13
Runtime patch was not changed during this diagnosis.

## First build gate

Workflow: `34743154320`, job `103686187424`.

Passed before failure:

- Rule-20 authority check;
- exact v1.0.38 source/hash/readback check;
- exact v1.0.38 RED reproducing `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`;
- deterministic minimal materialization;
- targeted v1.0.39 GREEN `5/5`.

Full worktree suite ended `33 PASS / 2 FAIL`:

1. `adapter_identity`: `test_deadline_exceeded`, measured `20.003s`, configured deadline `20s`;
2. `node`: exit `1`.

Final ZIP/persistence/readback were correctly skipped. This run remains a historical FAIL.

## A/B diagnostic

Workflow: `34743603061`, job `103687345882`, SUCCESS. No production runtime files changed.

### Node

Same command as `run_all_v136.py`: `node --test tests/*.test.js`.

- exact v1.0.38: exit 0, `368/368 PASS`;
- temporary v1.0.39: exit 1, `368 PASS / 1 FAIL`;
- sole failure: `tests/visible_tab_exact_request_disambiguation_v139.test.js` throws `SOURCE_PATH_REQUIRED` because the standalone RED helper required argv[2], while aggregate Node invokes every `tests/*.test.js` without custom arguments.

Classification: **test integration defect, not runtime regression**.

Correction allowed: when no argv[2] is supplied, release copy resolves `../service_worker.js`; explicit source argument remains supported for exact-v1.0.38 RED.

### Adapter identity

Same `check_packaged_adapter_v136.py`, same GitHub runner, same 20-second external limit, four repeats each:

- v1.0.38: `19.55s`, `0.96s`, `0.95s`, `0.75s`, all exit 0;
- v1.0.39: `2.39s`, `1.20s`, `0.77s`, `0.89s`, all exit 0.

The cold first run of the unchanged v1.0.38 authority consumed 97.75% of the old deadline. The first full-gate `20.003s` timeout therefore cannot be attributed to the v1.0.39 selector patch. The adapter invariant is identity correctness, not sub-20-second startup performance.

Classification: **existing harness deadline has inadequate cold-run margin**.

Correction allowed: adapter identity group deadline `20s → 30s`. This is not a retry-until-green and not a runtime timeout change. All other group deadlines remain unchanged.

## Runtime scope remains unchanged

Production behavior remains limited to:

- `service_worker.js`: unique exact requested-route tab disambiguation;
- `manifest.json`: version identity only;
- `avito_content.js`: adapter version identity only.

No queue/cursor, navigation dispatch, proxy/recovery, CAPTCHA, ChatGPT capture or report-delivery behavior is changed by these test-only corrections.
