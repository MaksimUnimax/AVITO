# PRE-PATCH FULL HISTORY AUDIT — Avito Finder v1.0.41 gate

**Date:** 2026-09-13  
**Status:** `FULL_HISTORY_AUDIT=PASS`  
**Target patch:** v1.0.41 — IP-block firewall classifier/recovery restoration.  
**Installed target authority:** exact v1.0.40.  
**Main HEAD at branch creation:** `f5730d833476d730bb734a72e62733c0bb5283e3`.

## 1. Full-history authority inherited without narrowing

This gate incorporates the previous exhaustive authorities in full:

- `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md/json` — exhaustive v0.1.0–v1.0.38 authority;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.md/json` — full composite audit through exact v1.0.39, its installed live FAIL, and the v1.0.40 permitted allocation correction.

The inherited audit already covers 61 archival variants, 56 unique archived pre-1.0 versions, 60 exact historical runtimes, 54 unambiguous adjacent runtime diffs, reachable Git history/refs/PRs, critical state-machine evolution, defect→regression chains and explicit source gaps. No historical row or source gap is replaced by assumption here.

## 2. Current exact runtime and post-release delta

v1.0.40 release merge: `91cdd5504392a6509e06b559d68d3576e728263e`.

Current main at branch creation: `f5730d833476d730bb734a72e62733c0bb5283e3`.

Git compare is `ahead_by=10`, `behind_by=0`. Post-release changes are documentation/evidence/receipts only: `AGENTS.md`, progress/version docs, release receipts and live-evidence JSON. No `core.js`, `service_worker.js`, `avito_content.js`, `proxy_manager.js`, queue/navigation/capture code or other executable runtime changed after the verified v1.0.40 release. Therefore exact installed v1.0.40 remains the correct RED target.

## 3. New installed live FAIL

Task `af-20260913103028-k9qv`, Dell listing `4750223208`.

Visible Avito page:

- heading: `Доступ ограничен: проблема с IP`;
- helper text says to press `Продолжить` **for a later CAPTCHA step**;
- visible control: `Продолжить`;
- no CAPTCHA challenge is currently visible;
- cards read: 0;
- baseline remains 150/150.

Finder previously reported the page as `BLOCKED_LOGIN_OR_CAPTCHA`. The owner correctly identified that the visible provider state is an IP-block/firewall landing page, not an actual CAPTCHA challenge.

Superseding evidence: `live_evidence/2026-09-13/V140_IP_BLOCK_MISCLASSIFIED_AS_CAPTCHA_LIVE_FAIL_2026-09-13.json`.

Earlier records that treated the combined Finder status as proof of a real CAPTCHA are retained for history but superseded for causal interpretation.

## 4. Historical contract proving reload is expected

`AVITO_FINDER_v1.0.24_UI_PLAN_IP_BLOCK_RECOVERY_2026-09-08.md` is explicit authority for the required behavior:

`AVITO_IP_BLOCK during collection -> do not immediately report -> enter bounded shared recovery -> verify/rotate connection as permitted -> tabs.reload(..., bypassCache) -> retry the same plan`.

The current v1.0.40 worker still contains that recovery/reload machinery and a bounded IP-block recovery path. The regression is therefore not “refresh code was deleted”; the page is being routed away from the IP-block recovery state before that code can run.

## 5. Exact causal chain

Exact v1.0.40 `core.js` `publicPageInterruptionProbe()`:

- `captcha` becomes true for broad visible text matching `/captcha|капч|.../`;
- `ip_block` becomes true for `Доступ ограничен: проблема с IP`.

On the live firewall landing page, the phrase `для решения капчи` makes **both flags true** even though no challenge is visible.

Exact v1.0.40 `avito_content.js` `detectBlock()` checks in this order:

1. `probe.captcha` -> `BLOCKED_LOGIN_OR_CAPTCHA`;
2. rate limit;
3. `probe.ip_block` -> `AVITO_IP_BLOCK`.

Exact worker recovery treats CAPTCHA as manual and automatic IP recovery only as IP-block. Consequently:

`IP firewall helper mentions CAPTCHA -> broad text regex sets captcha=true -> adapter/manual gate wins -> IP recovery/reload is skipped -> firewall page stays open`.

## 6. Why the existing regression suite missed it

`tests/ip_block_refresh_resilience.test.js` already asserts the intended worker contract, including that IP recovery requires:

`interruption.ip_block === true && interruption.captcha !== true`.

But the test is structural/static. It does **not** feed the real firewall DOM/text containing `для решения капчи` through `publicPageInterruptionProbe()`.

Therefore it can remain green while the live classifier produces `ip_block=true, captcha=true`. This is exactly the wrong-layer test failure prohibited by Rules 2 and 16.

The CAPTCHA tests also validate the manual gate state machine but do not prove that a mere textual mention of a future CAPTCHA on an IP-block landing page is an actual challenge.

## 7. Historical origin boundary

The broad CAPTCHA-first classification is not new in v1.0.40. Exact available v1.0.36/v1.0.37 sources already contain the same family of broad CAPTCHA text matching / CAPTCHA-first classification. Therefore this audit does not falsely assign the defect to the v1.0.40 allocation patch.

The relevant regression is a long-lived classifier gap exposed by the current provider DOM/state and missed by tests. v1.0.40 is the installed target that must be corrected.

## 8. Permitted v1.0.41 correction

The patch may change only the interruption-classification boundary plus release identity/tests needed to prove it.

Required invariant:

- an IP-block firewall page must remain `AVITO_IP_BLOCK` when it merely **mentions** a future CAPTCHA but no CAPTCHA challenge is visibly present;
- a real visible CAPTCHA challenge remains `BLOCKED_LOGIN_OR_CAPTCHA` and manual;
- no automatic CAPTCHA solving/clicking is added;
- existing bounded IP recovery/reload is reused unchanged;
- proxy remains transport-only;
- queue/cursor, target-tab lifecycle, ChatGPT capture/validator/report delivery and baseline remain unchanged.

A blind `ip_block`-always-wins reorder is not sufficient unless the RED/GREEN suite also proves a genuine CAPTCHA challenge on an IP-block-related surface still stays manual.

## 9. Required RED before runtime change

Against exact v1.0.40 source, a new regression must prove at minimum:

1. the actual firewall landing fixture (`Доступ ограничен: проблема с IP` + `для решения капчи` + `Продолжить`, no challenge) is currently misclassified as CAPTCHA/manual — RED;
2. expected correct classification is `AVITO_IP_BLOCK`;
3. the same classification is what allows the existing bounded recovery/reload branch to run;
4. a genuine CAPTCHA fixture remains CAPTCHA/manual;
5. no CAPTCHA fixture can invoke proxy rotation/reload.

Only after this RED is persisted may runtime change.

## 10. Rule-20 verdict

`FULL_HISTORY_AUDIT=PASS`.

Reason: complete prior historical authority is inherited without selection; all changes from the verified v1.0.40 release merge to the current main HEAD were compared and found non-runtime; the new installed live FAIL is reconciled against exact v1.0.40 runtime, the older v1.0.24 recovery contract and the existing v1.0.40 tests; the test gap and long-lived classifier origin boundary are explicit. No runtime has been modified during this audit.

This PASS authorizes creation of the v1.0.41 RED only. It does not accept a patch until final ZIP QA and installed Chrome E2E pass.
