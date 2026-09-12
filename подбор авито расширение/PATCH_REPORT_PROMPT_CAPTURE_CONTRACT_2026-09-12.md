# Patch report — ordinary assistant response capture contract

Status: **BACKPORT CANDIDATE / LIVE UNVERIFIED**

## Live defect

The current live journal showed the exact state:

`writing_block=false + copy_ready=true + copy_mode=semantic_copy_button + payload_extraction_error=writing_block_missing`

The capture loop nevertheless stayed in `PROMPT_WAIT_WRITING_BLOCK` forever. The assistant turn was already final, but the state machine required a writing block unconditionally.

## Root cause

`promptTick()` had an unconditional branch `if (!candidate.writing_block) ... wait`, while `detectCopyReadiness()` could already prove assistant-turn finality with the generic `copy-turn-action-button`. Non-writing-block assistant payload text was also deliberately set to empty. Therefore ordinary assistant responses could never reach the validator even though the preceding validator report explicitly allowed the next command as ordinary text.

## Corrected state machine

- Writing-block capture remains supported.
- Ordinary assistant response is accepted only after the **generic assistant-turn** Copy action is present and enabled.
- A code-block-local `Копировать` control is **not** accepted as assistant finality.
- If exactly one code block exists in the completed ordinary assistant turn, its body is used structurally as the command payload; otherwise the completed assistant-turn body is used.
- The infinite `PROMPT_WAIT_WRITING_BLOCK` state is removed for completed ordinary assistant turns.

## Rules compliance

| Rule | PASS/FAIL | Evidence |
| --- | --- | --- |
| Root cause доказан | PASS | Live state and unconditional `!writing_block` branch match exactly |
| Падающий тест до патча есть | PASS | Regression checker is required to fail against pre-patch `origin/main` |
| Проверяется правильный уровень | PASS | Finality requires generic assistant-turn Copy, not arbitrary local Copy |
| Working baseline не затронут | PASS by scope | Writing-block path remains; patch changes capture/form acceptance only |
| Diff минимален | PASS | ChatGPT capture adapter only, plus test/report/tooling |
| Старые реальные regression-сценарии пройдены | NOT YET | Full historical suite is not present in the current Git tree |
| Конечный билд перепроверен | FAIL | No new installable ZIP produced yet |
| Installed/live E2E пройден | FAIL | Requires exact installed source/build and Chrome run |
| Exact-source rule соблюдён | FAIL for live release | Git main is v1.0.24; live log comes from later content-script 0.6.13 |

## НАРУШЕННЫЕ ПРАВИЛА

Previous code violated:

1. **Не чинить ближайший симптом / весь state machine** — validator allowed ordinary next text, capture state still required writing block.
2. **Проверять правильный уровень** — writing-block presence and arbitrary Copy controls were conflated with assistant-turn finality.
3. **Локальный PASS != live E2E** — previous large regression suite did not include the exact ordinary-response-after-validator-error handoff.
4. **Baseline / protocol contract** — assistant response format was treated as an implicit invariant although validator explicitly permitted ordinary text.

## Release boundary

This Git branch is a **backport candidate against the currently published GitHub source tree**. It is not called live-ready because the repository still publishes v1.0.24 while the installed build that produced the 2026-09-12 log is later. The same fix must be applied to the exact installed source, then the final installable build must pass full installed E2E before release.
