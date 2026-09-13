# v1.0.40 first-gate adapter deadline diagnosis

Date: 2026-09-13  
Historical failed gate: `34747402029`  
A/B diagnostic workflow: `34747859905`

## Preserved failure

The first canonical v1.0.40 gate remains **FAIL**: worktree aggregate `34 PASS / 1 FAIL`; the sole failure was `adapter_identity` at `30.003s` against the offline harness deadline of 30 seconds. Packaging, final-ZIP QA and remote readback were skipped. It must never be relabeled PASS.

## Same-runner A/B

No production runtime changed for this diagnosis. Exact v1.0.39 and the same materialized v1.0.40 candidate were executed alternately on one GitHub runner under a 60-second diagnostic envelope using the exact `check_packaged_adapter_v136.py` probe.

Timings:

- exact v1.0.39: `15.718s`, `0.950s`, `0.951s`, `0.941s` — all PASS;
- materialized v1.0.40: `0.963s`, `1.883s`, `0.957s`, `0.955s` — all PASS.

Machine evidence: `ADAPTER_IDENTITY_AB_2026-09-13.json`.

The baseline was deliberately run first, so the only cold-start observation in this A/B belongs to unchanged v1.0.39, not v1.0.40. v1.0.40 is not systematically slower; all four v1.0.40 observations are below two seconds. The 30.003s first-gate timeout therefore does not demonstrate a production runtime regression. It is an external offline-test envelope failure in the same cold/browser-startup class already observed historically.

## Allowed correction

Production files must remain unchanged. The only allowed correction is test-harness-only: increase the `adapter_identity` group deadline in `tests/run_all_v136.py` from 30 to 45 seconds for materialized v1.0.40. This does not change any extension runtime timeout, browser action, target selection, proxy behavior, capture/report logic or user-visible behavior.

Why 45 seconds: the exact prior release has now shown a same-runner cold start of 15.718s, and the historical v1.0.38 A/B already showed 19.55s under a prior 20-second boundary. A 45-second outer QA envelope provides cold-start headroom while staying bounded and remaining far below the workflow/job timeout. It is not used as evidence of installed performance.

After this test-only correction, the entire worktree suite and a fresh-extracted final ZIP suite must both rerun. No prior PASS may be substituted for either rerun.
