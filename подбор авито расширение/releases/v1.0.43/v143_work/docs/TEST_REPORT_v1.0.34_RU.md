# Avito Finder v1.0.34 — test report

## Итог

Версия runtime: **1.0.34**  
ChatGPT adapter protocol: **0.6.17**  
Avito DOM adapter: **1.0.34**

### Выбранная cross-layer матрица

- сценариев: **128**
- PASS: **128**
- FAIL: **0**
- блоков выполнения: **13**

Подробности: `docs/SCENARIO_MATRIX_128_v1.0.34_RU.md` и `qa/v134/SCENARIO_MATRIX_128_v1.0.34.json`.

### Полный Node regression

`node --test tests/*.test.js`

- tests: **346**
- pass: **346**
- fail: **0**
- skipped: **0**
- cancelled: **0**

### Focused queue/navigation Node

- tests: **30**
- pass: **30**
- fail: **0**

Покрытие включает direct target child creation, отсутствие normal about:blank lifecycle, `pendingUrl` target semantics, adoption exact owned child after restart, ambiguity stop, legacy about:blank migration, одинаковый lifecycle DIRECT/PROXY и card-gap persistence.

### Focused recovery/proxy/network Node

- tests: **120**
- pass: **120**
- fail: **0**

Покрытие включает 429/rate-limit, IP-block, provider rotation, bounded retry budgets, proxy auth/config/profile/data saver, uncertain report delivery, endpoint-create ambiguity и startup recovery without mutation replay.

## Браузерные/DOM блоки выбранной матрицы

- Writing Block body capture/finality: **12/12 PASS**
- Start receipt: **8/8 PASS**
- ChatGPT DOM adapter: **11/11 PASS**
- Avito DOM adapter: **16/16 PASS**
- Rich composer/report lifecycle: **29/29 PASS**
- Sent-message receipt: **25/25 PASS**

## Worker/parser блоки выбранной матрицы

- parser/validator: **12/12 PASS**
- Worker payload ownership/supersede: **8/8 PASS**

## Сквозные queue/recovery циклы

1. six_details_two_batches — PASS; cursor=6; reports=2.
2. rate_limit_mid_queue_restart_direct_route — PASS; cursor=3; reports=1.
3. manual_captcha_same_child_resume — PASS; cursor=3; reports=2.
4. restart_during_persisted_gap — PASS; cursor=3.
5. stop_during_late_detail_response — PASS; final `CANCELLED_BY_USER`; reports=0.
6. removed_listing_is_negative_observation — PASS; cursor=3.
7. thirty_detail_large_report — PASS; cursor=30; report length=233804 chars.

## Current-live-defect regression

Critical scenario `B01-S02` starts with an incomplete Writing Block whose toolbar/Copy control is already ready and whose missing tail arrives later. v1.0.34 output:

- commands emitted before tail: **0**;
- commands emitted after final body stabilizes: **1**;
- emitted body contains final `Шаги: ... пакетом 6`: **true**;
- status: **PASS**.

Worker scenario `B03-S04` then verifies the migration path in which an older partial body had already staged an unsent validation report: the strictly larger candidate from the same assistant turn safely supersedes it only after exact Finder-owned stage proof. PASS.

## Secondary defects discovered while testing v1.0.34

1. ChatGPT adapter/Worker version handshake mismatch (`0.6.17` vs `0.6.16`) — found by Block 03, fixed, block rerun 8/8 PASS.
2. Avito adapter still reporting `1.0.33` while manifest was `1.0.34` — found by Avito DOM block, fixed, rerun 16/16 PASS.
3. `policy_static.test.js` source slice incorrectly included a newly adjacent composer-mutating handler and produced a false static failure. The slice was narrowed to the actual `AF_CAPTURE_RECONCILE_REPORT` handler; invariant remains that reconciliation itself is read-only. Full Node rerun 346/346 PASS.

## Boundaries

These tests do not claim an installed unpacked extension in the assistant environment. Browser scenarios use real Chromium with production JS and synthetic DOM/Chrome API doubles; provider calls are zero in the scenario matrix. Live acceptance is the next run in the user's installed Chrome.
