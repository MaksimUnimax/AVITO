# Avito Finder v1.0.42 — отчёт патча Writing Block capture stability

**Дата:** 2026-09-13  
**Ветка:** `fix/v142-writing-block-payload-oscillation-2026-09-13`  
**База:** exact v1.0.41  
**Статус инженерных branch-gates:** `PASS`  
**Installed owner-Chrome acceptance:** `NOT_RUN / LIVE_UNVERIFIED`  
**Итоговый статус до installed E2E:** `NOT READY / LIVE UNVERIFIED`

## 1. Живой дефект

В установленной v1.0.41 один и тот же видимый Writing Block с готовой локальной Copy-кнопкой мог бесконечно чередоваться между двумя состояниями:

- `PROMPT_EMPTY_WRITING_BLOCK_IGNORED`, `payload_bytes=0`, `WRITING_BLOCK_LOCAL_BODY_UNAVAILABLE`;
- затем тот же блок снова давал полный payload (`2447` bytes) и запускал `PROMPT_DOM_STABILITY_STARTED`.

Цикл повторялся больше минуты и прекращался только после ручного user-turn. Команда до Worker не доходила.

Корректное causal evidence сохранено в:

`live_evidence/2026-09-13/V141_WRITING_BLOCK_PAYLOAD_EXTRACTION_OSCILLATION_LIVE_FAIL_2026-09-13.json`.

## 2. Доказанная первопричина

Exact v1.0.41 `chatgpt_content.js` после неудачного `confirmLocalWritingBlockCopyAndExtract()` выполнял:

`empty/unavailable local payload -> PROMPT_EMPTY_WRITING_BLOCK_IGNORED -> candidateFirstSeen = null -> next non-empty observation becomes structuralChanged -> restart 2s structural gate`.

Общего лимита времени/попыток для этого empty/non-empty колебания не существовало. Это создавало настоящий capture livelock и нарушало требование bounded terminal state.

Отдельно подтверждён второй риск: `writingBlockStructuralSignature()` включал snapshots всех кнопок assistant-section, поэтому изменение посторонней suggestion/action кнопки могло заново запускать structural gate, хотя Writing Block и его локальная Copy-кнопка не менялись.

## 3. Rule-20

До executable-изменений выполнен и сохранён полный composite audit:

- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.42_2026-09-13.md`;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.42_2026-09-13.json`;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.42_REMOTE_READBACK_2026-09-13.json`.

Статус: `FULL_HISTORY_AUDIT=PASS`.

Аудит наследует без сужения базовую authority: 61 исторический архивный вариант, 56 уникальных pre-1.0 версий, 60 exact historical runtime manifests, 54 unambiguous adjacent runtime diffs и полный defect→regression/state-machine ledger.

## 4. RED на exact v1.0.41

Workflow: `RED Avito Finder v1.0.42 Writing Block capture`, run `34759646978`.

RED выполнен на exact финальном source v1.0.41 до runtime-патча.

Доказаны оба дефекта:

1. same-block payload-unavailable/non-empty oscillation: полный payload не передан, structural gate перезапускается;
2. unrelated assistant-button churn: стабильный Writing Block не доходит до handoff, structural signature меняется вместе с посторонними controls.

Persisted authority:

`releases/v1.0.42/QA/red/RED.json` → `status=RED_CONFIRMED`, `runtime_changed_before_red=false`.

## 5. Минимальный runtime-патч

### `chatgpt_content.js` — единственное поведенческое изменение

- `CONTENT_SCRIPT_VERSION 0.6.18 -> 0.6.19`;
- transient local-body miss больше не уничтожает уже доказанную structural identity;
- вместо `candidateFirstSeen=null` сохраняются structural signature и first-seen timestamp;
- добавлен ограниченный payload-extraction retry budget;
- default production bounds: максимум 8 miss или 8000 ms;
- exhaustion завершается `PROMPT_PAYLOAD_EXTRACTION_FAILED_BOUNDED` / `FAILED_WITH_EXACT_REASON`;
- после успешного extraction miss counters сбрасываются;
- обязательная multi-sample payload fingerprint stability сохранена;
- `writingBlockStructuralSignature()` теперь зависит только от anchor/assistant turn, Writing Block identity, Writing Block presence, local Copy readiness/mode — посторонние assistant-turn buttons не владеют finality gate.

### Identity-only

- `service_worker.js`: только `CAPTURE_VERSION 0.6.18 -> 0.6.19`, поскольку Worker проверяет exact protocol+version PING до принятия command;
- `avito_content.js`: release identity `1.0.41 -> 1.0.42`;
- `manifest.json`: release identity/description `1.0.42`.

`proxy_manager.js` byte-identical к v1.0.41. Navigation, explicit queue, cursor, Avito recovery, report delivery и proxy behavior не менялись.

## 6. Regression-test identity maintenance

Первый корректный targeted GREEN уже прошёл, но первый full historical run после identity sync выявил только stale release-number expectations в inherited tests:

- `ip_block_ui_plan_recovery_v124.test.js`;
- `ip_block_verified_egress_v123.test.js`;
- `proxy_recovery_integrity_v137.test.js`;
- `traffic_lite_zero_media.test.js`;
- ранее также `v135_prompt_form_terminal_gate.test.py`.

Node diagnostic подтвердил точную причину: все четыре Node FAIL были только `'1.0.42' !== '1.0.41'`. Поведенческие assertions этих тестов не менялись; обновлены лишь release labels/version expectations.

Отдельно до этого один build-кандидат показал массовые cycle FAIL из-за несогласованности capture identity: ChatGPT adapter уже был `0.6.19`, а Worker всё ещё ожидал `0.6.18`. Это не было принято как release; materializer исправлен так, чтобы Worker identity изменялся только одной строкой `CAPTURE_VERSION`.

Все промежуточные FAIL сохранены как development evidence и не считаются PASS.

## 7. GREEN и полный QA

Успешный build workflow: run `34761221936`.

Targeted production-capture GREEN, 3/3:

1. transient same-block extraction miss → один retry, затем ровно один full payload, structural gate не начинается заново;
2. unrelated assistant-button churn → один full payload, одна structural signature;
3. persistent extraction loss → payload не исполняется, bounded terminal `PROMPT_PAYLOAD_EXTRACTION_FAILED_BOUNDED`.

Полный regression suite:

- worktree grouped QA: `35/35 PASS`;
- final ZIP fresh-extract grouped QA: `35/35 PASS`;
- final ZIP targeted GREEN: `3/3 PASS`;
- final ZIP fresh extraction: `PASS`;
- independent branch remote readback: `PASS`.

## 8. Exact artifact

ZIP:

`AVITO_FINDER_v1.0.42_WRITING_BLOCK_CAPTURE_STABILITY_RECOVERY_2026-09-13.zip`

- SHA-256: `616874dcdd67a05aaa63efbe5a3f670f91646cce9022db7038296525cfd63167`;
- bytes: `505192`;
- source files: `154`;
- Git blob: `4e054897f41a2db44101f4e62c8a23bdd89e5aa4`.

Authority:

- `releases/v1.0.42/BUILD_v1.0.42.json`;
- `releases/v1.0.42/REMOTE_READBACK.json`;
- `releases/v1.0.42/v142_work/BUILD_ORIGIN_v1.0.42.json`.

## 9. Отдельный unresolved network track

Этот патч **не чинит и не маскирует** отдельный v1.0.41 network/recovery failure:

Mini ITX fresh navigation завершалась `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED` после 4 попыток; post-failure DOM оставался `AVITO_IP_BLOCK`, concrete CAPTCHA не была видна.

Это отдельный proxy/egress state machine и не входит в v1.0.42. Смешивание этих задач нарушило бы minimal-patch boundary.

## 10. НАРУШЕННЫЕ ПРАВИЛА

### В предыдущем runtime/process

- **Rule 7 — FAIL в прежней диагностике:** screenshot-only гипотеза про assistant-button churn была названа основной раньше чтения полного live journal. Исправлено: primary cause теперь доказан exact journal + exact code + exact RED.
- **Rule 15 — FAIL в v1.0.41:** empty/non-empty extraction loop не имел terminal budget. Исправлено bounded miss/time budget + exact terminal reason.
- **Rule 16 — FAIL в старом regression authority:** существующие тесты не воспроизводили live extraction oscillation. Исправлено exact-v1.0.41 RED и targeted production-code GREEN.
- **Rule 2/16 — исторический пример v1.0.40:** worker recovery тест существовал, но не прогонял реальный IP-firewall DOM через classifier. Исправлено ещё в v1.0.41 и сохранено regression suite.
- **Rule 20 — исторический процесс:** выборочный просмотр прошлых версий пропустил inherited `rotation=0` lineage. Полный exhaustive audit теперь постоянный gate.

### В development-итерациях v1.0.42

- первые GREEN fixture-итерации моделировали дефект на неправильном уровне и были отклонены;
- первый full candidate после targeted GREEN имел capture identity mismatch `0.6.19` vs Worker `0.6.18` и был отклонён;
- следующий full candidate имел четыре stale release-version test expectations и был отклонён;
- ни один из этих build-кандидатов не объявлялся готовым и не был merged как release.

## 11. Таблица соблюдения patch rules

| Rule | Статус сейчас | Evidence |
|---|---|---|
| 1. Не чинить ближайший симптом | PASS | разобран полный capture state machine и historical origin boundary |
| 2. Проверять exact layer | PASS | Chromium fixture исполняет production `chatgpt_content.js` + `core.js` |
| 3. Offline PASS != release | PASS | отчёт явно оставляет installed E2E `NOT_RUN` |
| 4. Baseline неприкосновенен | PASS | Avito navigation/queue/cursor/proxy/report behavior не менялись |
| 5. ChatGPT↔Finder = API | PASS | Writing Block-only boundary и local Copy contract сохранены |
| 6. RED до patch | PASS | exact-v1.0.41 run `34759646978` |
| 7. Cause доказана | PASS | live journal → exact branch → exact source → RED |
| 8. Minimal patch | PASS | behavior только capture adapter; Worker/Avito/manifest только identity |
| 9. Тот же дефект исчез | PASS на final-ZIP test layer | final targeted GREEN 3/3; installed repeat ещё не выполнен |
| 10. Все старые реальные bugs regression | PASS на packaged QA | final grouped suite 35/35 |
| 11. Final build тестируется | PASS | fresh-extract final ZIP 35/35 + targeted 3/3 |
| 12. Full installed E2E | **NOT RUN / FAIL AS ACCEPTANCE GATE** | требуется owner Chrome на exact final ZIP |
| 13. Live FAIL rejects patch | PASS как правило процесса | релиз не объявлен READY; live acceptance ещё не выполнялся |
| 14. Proxy transport-only | PASS | `proxy_manager.js` byte-identical; proxy behavior не тронут |
| 15. Нет infinite waits | PASS на target regression | bounded terminal test проходит; installed proof ещё требуется |
| 16. Test catches live bug | PASS | exact v1.0.41 RED воспроизводит оба current capture defects |
| 17. Exact-source | PASS | materialized от exact final v1.0.41 |
| 18. Rule report | PASS | этот отчёт |
| 19. Release immediately in GitHub | PASS branch authority | exact source + ZIP + hashes + QA + readback сохранены до merge |
| 20. Full history audit | PASS | v1.0.42 composite audit + remote readback |

## 12. Acceptance boundary

Branch build можно публиковать/merge как **candidate authority**, но версия не имеет права называться рабочей до installed Chrome E2E на exact финальном ZIP.

После merge требуется установить exact v1.0.42 поверх существующего unpacked extension без удаления storage/baseline и повторить исходный сценарий:

`user action -> Writing Block capture -> validator -> Avito action/result -> report -> same pinned ChatGPT chat -> readiness for next command`.

До этого окончательный статус: `NOT READY / LIVE UNVERIFIED`.
