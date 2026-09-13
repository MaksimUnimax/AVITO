# Avito Finder v1.0.40 — dedicated requested tab allocation

Status: `OFFLINE_QA_PASS / LIVE_UNVERIFIED`.

## Live defect

Installed v1.0.39 task `af-20260913075253-v24r` stopped at `COMMAND_CAPTURED` with `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`, recovery=0, cursor unused and cards=0 even though the Writing Block supplied an explicit public Dell URL. The live report does not distinguish zero exact route matches from duplicate exact route matches; that subcase is not guessed.

## Root cause

At the first-target allocation state, v1.0.39 could reuse a unique active/exact/single Avito tab, but when several candidates remained non-uniquely-reusable it terminated. `ensureAvitoTarget()` allocated a new public tab only for zero candidates. Therefore explicit requested-page authority was still discarded when safe reuse was impossible.

## Minimal patch

Only `service_worker.js` behavior changes: on the first user-started binding, with navigation allowed and a valid explicit public requested URL, ambiguous existing Avito tabs are never guessed or mutated; Finder creates one new normal public Avito tab and routes that dedicated run-owned tab to the requested URL. Unique active/exact/single reuse, zero-tab bootstrap, diagnostics, already-bound runs, queue/cursor, report delivery, proxy/recovery and manual CAPTCHA boundaries remain unchanged. `manifest.json` and `avito_content.js` change release identity only.

## RED → GREEN

Exact v1.0.39: RED with `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`. v1.0.40: dedicated-tab regression 5/5 and prior selector contract 5/5. Worktree grouped QA 35/35, Node 370/370. Final ZIP fresh extraction 35/35, Node 370/370.

## Rule compliance

| Rule | Status | Evidence |
|---|---|---|
| 1 root cause/state machine | PASS | first-target allocation boundary proven |
| 2 exact layer | PASS | exact v1.0.39 ensureAvitoTarget RED |
| 3 local != live | PASS | v1.0.40 remains LIVE_UNVERIFIED |
| 4 baseline | PASS | WORK 150/150 and queue semantics untouched |
| 5 ChatGPT↔Finder contract | PASS | capture/validator/report unchanged |
| 6 reproduce before patch | PASS | exact v1.0.39 RED |
| 7 causal chain | PASS | live v1.0.39 → allocation code → RED |
| 8 minimal patch | PASS | service_worker behavior + release identities only |
| 9 same defect scenario | PASS offline / LIVE_PENDING | exact allocation scenario GREEN; installed rerun required |
| 10 prior regressions | PASS | prior selector + full suite |
| 11 final build | PASS | fresh-extract full rerun |
| 12 installed E2E | NOT_RUN | owner Chrome required |
| 13 live FAIL rejects | PASS process | v1.0.39 marked FAIL before v1.0.40 |
| 14 proxy transport isolation | PASS | proxy runtime unchanged |
| 15 bounded waits | PASS | unchanged |
| 16 test catches live bug | PASS | RED on exact v1.0.39 |
| 17 exact source | PASS | exact remote-read v1.0.39 base |
| 18 report | PASS | this report |
| 19 GitHub persistence | PASS after remote readback | exact source/ZIP/QA persisted this cycle |
| 20 full history audit | PASS | PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.md/json + remote readback |

## НАРУШЕННЫЕ ПРАВИЛА

v1.0.39 exposed an incomplete abstraction under Rules 7/9/16: its regression proved unique-exact reuse but not the broader first-allocation invariant when the command has a complete explicit public URL and no existing tab is uniquely reusable. v1.0.40 moves the fix to that allocation boundary and keeps ambiguous existing tabs untouched.

Build SHA-256: `04f9bdc205eaa3578d462005ea15749184c5f7e744bd24a19c43e5a88bc1e017`. Bytes: `495520`. Source files: `150`.
