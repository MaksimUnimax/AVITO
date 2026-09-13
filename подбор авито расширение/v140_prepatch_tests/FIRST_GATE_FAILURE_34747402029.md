# v1.0.40 first full gate — historical FAIL

Workflow: `34747402029`  
Branch: `fix/v140-dedicated-requested-tab-allocation-2026-09-13`  
Date: 2026-09-13

Status: **FAIL — preserve permanently; do not relabel PASS.**

Passed before the failure:

- Rule-20 v1.0.40 authority check;
- exact v1.0.39 ZIP/source authority check;
- exact v1.0.39 RED reproducing `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`;
- deterministic v1.0.40 materialization;
- dedicated requested-tab targeted GREEN `5/5`;
- prior v1.0.39 exact-selector contract GREEN `5/5`.

Full worktree aggregate result: `34 PASS / 1 FAIL` plus installed-environment probe executed but not counted as acceptance.

Sole FAIL:

- `adapter_identity` → `test_deadline_exceeded` at `30.003s` against an external group deadline of 30 seconds.

Every subsequently executed regression group passed, including Node, Avito/ChatGPT fixtures, receipts, six cycle scenarios, proxy isolation, seven queue scenarios, Writing Block stability and prompt-form gates. Node aggregate itself passed.

This run did **not** reach packaging, final-ZIP QA, persistence or remote readback. It is not a release gate.

No production runtime change is authorized from this timeout alone. Before any test-harness deadline correction, run same-runner A/B timing of exact v1.0.39 and materialized v1.0.40 adapter identity. If both pass under a wider diagnostic envelope and v1.0.40 is not materially slower, the correction may be test-harness-only; otherwise investigate runtime/package identity.
