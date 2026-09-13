# Avito Finder v1.0.39 — exact requested tab disambiguation

Status: `OFFLINE_QA_PASS / LIVE_UNVERIFIED`.

## Root cause

Installed v1.0.38 task `af-20260913062414-29ps` stopped twice at `COMMAND_CAPTURED` with `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`, recovery=0 and mutations=0. `ensureAvitoTarget` already knew the exact requested Dell URL, but `selectVisibleAvitoTab(windowId)` discarded that evidence and rejected every multiple-Avito-tab state before routing.

## Patch

Only `service_worker.js` behavior changes: preserve unique active-Avito preference; otherwise, when several Avito tabs exist, bind only if exactly one existing candidate already matches the normalized requested public route. Zero matches and duplicate exact matches remain terminal ambiguity. No tab is navigated merely to resolve ambiguity. `manifest.json` and `avito_content.js` change only release identity to 1.0.39. Queue/cursor, target dispatch, proxy/recovery, capture/report and CAPTCHA boundaries are unchanged.

## RED → GREEN

Exact v1.0.38: RED with `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`. v1.0.39: 5/5 targeted PASS. Full worktree 35/35, Node 369/369. Final ZIP fresh extraction 35/35, Node 369/369.

## Rule compliance

| Rule | Status | Evidence |
|---|---|---|
| 1 root cause/state machine | PASS | live fail → selector ignoring requestedUrl |
| 2 exact layer | PASS | tests actual tab selector, not proxy/IP |
| 3 local != live | PASS | release remains LIVE_UNVERIFIED |
| 4 baseline | PASS | queue/cursor/proxy/capture untouched |
| 5 ChatGPT↔Finder contract | PASS | unchanged |
| 6 reproduce before patch | PASS | exact v1.0.38 RED |
| 7 causal chain | PASS | live observation → code → RED |
| 8 minimal patch | PASS | service_worker behavior + two version identity files |
| 9 same defect scenario | PASS offline | 5/5 exact selector scenarios |
| 10 prior regressions | PASS | full suite 35/35 + 369/369 |
| 11 final build | PASS | fresh-extract rerun |
| 12 installed E2E | NOT_RUN | owner Chrome required |
| 13 live FAIL rejects | PASS process | v1.0.38 remained unaccepted |
| 14 proxy transport isolation | PASS | proxy files byte-identical |
| 15 bounded waits | PASS | unchanged |
| 16 test catches live bug | PASS | RED on v1.0.38 |
| 17 exact source | PASS | base v1.0.38 remote-verified authority |
| 18 report | PASS | this report |
| 19 GitHub persistence | PASS after remote readback/merge | source ZIP QA persisted in this release cycle |
| 20 full history audit | PASS | PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md/json |

## НАРУШЕННЫЕ ПРАВИЛА

Previous v1.0.38 behavior violated Rule 2/7/16 for this newly exposed state: exact requested-route evidence was available but not consumed by the target selector, and no permanent regression covered unique-exact-match disambiguation. This patch adds that regression while preserving ambiguity for zero/duplicate matches.

Build SHA-256: `a4a0ae626de4692c62cd76d87be19e34749b488e76afa2764828a025db08bb98`. Bytes: `492784`. Source files: `148`.
