# Avito Finder v1.0.43 — IP Recovery Evidence Preservation

Дата: 2026-09-14.

## Статус

`DIAGNOSTIC_CORRECTIVE_BUILD / OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED`

Это **не исправление самого AVITO_IP_BLOCK recovery**. Поведение recovery намеренно не менялось. v1.0.43 исправляет доказанный дефект наблюдаемости: после `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED` v1.0.42 возвращала в чат только общий reason/attempt count и теряла уже измеренные данные `probe_before/probe_after`, transport status, endpoint/create и provider rotation. Без этих данных следующий recovery-патч пришлось бы делать по догадке, что запрещено Rules 2, 6 и 7.

## Live failure, который запустил цикл

Installed v1.0.42, task `af-20260914010021-tyyl`, Mini ITX `8156773014`:

- Writing Block capture = PASS; старый v1.0.41 capture livelock не повторился;
- выполнение дошло до `AVITO_NAVIGATION`;
- `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED` после 4 bounded attempts;
- cards read = 0;
- baseline = `150/150`, не изменён;
- post-failure read-only DOM несколько раз подтвердил `AVITO_IP_BLOCK`;
- heading: `Доступ ограничен: проблема с IP`;
- CAPTCHA отсутствует;
- публичная карточка не появилась;
- смена IP не заявлена.

Live authority:

- `live_evidence/2026-09-14/V142_CAPTURE_PATCH_PASS_IP_RECOVERY_EXHAUSTED_2026-09-14.json`;
- `live_evidence/2026-09-14/V142_POST_RECOVERY_DOM_STILL_IP_BLOCK_2026-09-14.json`;
- `releases/v1.0.42/LIVE_ACCEPTANCE_STATE_2026-09-13.json`.

## Rule 20

До executable change выполнен и опубликован полный composite audit:

- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.43_2026-09-14.md`;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.43_2026-09-14.json`;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.43_REMOTE_READBACK_2026-09-14.json`.

Вердикт: `FULL_HISTORY_AUDIT=PASS`.

Audit наследует полный исторический authority без выборки: 61 historical archive variants, 56 unique pre-1.0 versions, 60 exact historical runtime manifests и 54 unambiguous adjacent runtime diffs. Exact installed target — v1.0.42. После v1.0.42 merge до pre-patch main executable runtime не менялся.

## Доказанный дефект v1.0.42

В exact v1.0.42 recovery уже собирает и сохраняет:

- `probe_before`;
- `probe_after`;
- `probe_ip_changed`;
- `transport_status`;
- probe errors;
- `connection_recovery.create` / endpoint-create state and skip reason;
- `provider_rotation` state;
- `last_ip_block_recovery`.

Но `avitoRuntimeFailureReport()` выводил только:

- task/stage/reason;
- количество recovery attempts;
- queue cursor / cards read;
- version;
- общий запрет заявлять смену IP без отдельного доказательства.

Из-за этого terminal report не позволял отличить, например:

- provider rotation ACK без реальной смены egress;
- `API_KEY_UNAVAILABLE` / `PACKAGE_ID_UNAVAILABLE` и skipped endpoint create;
- `DISPATCHED_OUTCOME_UNKNOWN` create reconciliation;
- partial/unavailable egress probe;
- egress change with Avito still blocked.

Это evidence-loss defect на terminal boundary, а не доказательство ошибки одного конкретного recovery substep.

## Exact RED до патча

Workflow: `34795377879`.

Exact source: v1.0.42.

Persisted authority:

`releases/v1.0.43/QA/red/RED.json`

Status: `RED_CONFIRMED`.

Сломанная v1.0.42 не выполняла два новых terminal-report invariants:

1. exhaustion report обязан сохранять measured before/after egress + факт доказанной/не доказанной смены;
2. exhaustion report обязан сохранять endpoint/create state и probe errors, включая unresolved outcome.

Runtime до RED не менялся.

## Минимальный патч

Поведенчески изменён только `service_worker.js`, и только функция terminal formatting `avitoRuntimeFailureReport()`.

Добавлены строки:

- `IP probe: <before> → <after>; смена IP подтверждена / без подтверждённой смены IP`;
- `Транспорт: PROBES_COMPLETE|PROBES_PARTIAL|PROBES_UNAVAILABLE` + redacted probe errors;
- `Endpoint/create: <state>; попытка N; причина <reason>`;
- `Provider rotation: <state>; попытка N; смена IP доказана/не доказана`.

**Recovery state machine не менялась.** Не менялись thresholds, attempt count, rotation policy, endpoint creation policy, target reload/navigation, PAC, auth, queue/cursor, CAPTCHA boundary или report delivery.

Identity-only:

- `manifest.json`: `1.0.43` + description;
- `avito_content.js`: `ADAPTER_VERSION 1.0.43`.

Byte-identical к v1.0.42:

- `chatgpt_content.js`;
- `core.js`;
- `proxy_manager.js`;
- `recovery.js`.

Capture protocol/version остаётся `0.6.19`.

## Targeted GREEN

Новый regression contract: `2/2 PASS`.

Проверяется:

1. complete unchanged probe (`31.131.200.254 -> 31.131.200.254`), `API_KEY_UNAVAILABLE`, provider rotation `ACKNOWLEDGED` — всё должно попасть в terminal report без утечки credentials;
2. partial probe, `PROXY_EGRESS_DIAGNOSTIC_TIMEOUT`, `DISPATCHED_OUTCOME_UNKNOWN` create — всё должно сохраниться в terminal report.

## Full regression и отдельный harness incident

Первый build `34795512725`:

- Rule20 PASS;
- materialization PASS;
- targeted GREEN `2/2 PASS`;
- Node PASS;
- остальные grouped tests PASS;
- единственный FAIL: `popup_lifecycle` был убит внешним process deadline ровно на `30.002s`.

Этот FAIL не скрыт и не объявлен runtime regression без проверки.

Отдельный diagnostic workflow `34796013756` доказал:

- v1.0.42 baseline popup lifecycle = PASS за `29.608s`;
- v1.0.43 candidate = PASS за `9.077s`;
- `popup.js` byte-identical;
- `popup.html` byte-identical.

Evidence:

`releases/v1.0.43/QA/popup_timeout_diagnostic.json`.

Следовательно, старый внешний 30-second process kill находился практически на нормальном baseline runtime. Исправлен **только test-harness outer deadline** `30s -> 45s`; popup assertions и production popup code не менялись.

## Финальный build

Workflow: `34796154733` = SUCCESS.

Финальный artifact:

`releases/v1.0.43/AVITO_FINDER_v1.0.43_IP_RECOVERY_EVIDENCE_PRESERVATION_2026-09-14.zip`

- SHA-256: `593d31edfb136c68a50e4aa45a157c1e3d296f3beb395e0444c5b4de4c4aca3f`;
- bytes: `507760`;
- source files: `156`;
- targeted GREEN: `2/2 PASS`;
- worktree grouped QA: `35/35 PASS`;
- final ZIP fresh-extract grouped QA: `35/35 PASS`;
- final ZIP targeted GREEN: `2/2 PASS`;
- independent branch remote readback: `PASS`.

Authority:

- `releases/v1.0.43/BUILD_v1.0.43.json`;
- `releases/v1.0.43/REMOTE_READBACK.json`.

## Rule 18 — таблица соблюдения

| Rule | PASS/FAIL | Evidence |
| --- | --- | --- |
| Root cause доказан | PASS | Доказан именно terminal evidence-loss; recovery substep root cause намеренно не заявлен |
| Падающий тест до патча есть | PASS | exact-v1.0.42 RED, workflow `34795377879`, `RED_CONFIRMED` |
| Проверяется правильный уровень | PASS | regression проверяет terminal report, где evidence реально терялся |
| Working baseline не затронут | PASS | proxy/recovery/capture/navigation algorithms не менялись; critical runtime files byte-identical где заявлено |
| Diff минимален | PASS | service_worker terminal formatter + release identity; harness deadline отдельно доказан как test-only |
| Старые реальные regression-сценарии пройдены | PASS | final full grouped QA `35/35` |
| Конечный билд перепроверен | PASS | exact final ZIP fresh extraction `35/35`, targeted `2/2` |
| Installed/live E2E пройден | FAIL | `NOT_RUN / LIVE_UNVERIFIED` — это обязательный следующий gate |
| Exact-source rule соблюдён | PASS | materialized from exact v1.0.42 source |
| Полный аудит всех предыдущих патчей и кода выполнен | PASS | v1.0.43 Rule20 `FULL_HISTORY_AUDIT=PASS` + remote readback |

## НАРУШЕННЫЕ ПРАВИЛА

### Existing v1.0.42

**Rule 2 — неправильный уровень evidence в terminal UX.** Нужные данные измерялись внутри recovery, но пользовательский terminal boundary их отбрасывал.

**Rule 7 — root-cause patch нельзя делать без causal chain.** Generic `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED` не позволял доказать конкретный failing substep. Поэтому v1.0.43 не меняет recovery algorithm, а сначала устраняет evidence loss.

### Development-cycle incident v1.0.43

Первый full build получил `popup_lifecycle` timeout. Он не был проигнорирован. Отдельный baseline-vs-candidate diagnostic доказал test-deadline flake, после чего изменён только outer test process deadline. Это сохраняет Rule 3/13: первый build остаётся FAIL evidence, финальный PASS относится только ко второму exact build.

## Acceptance boundary

v1.0.43 нельзя считать исправлением `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED`.

Её задача — повторить тот же installed Mini ITX scenario и вернуть в этот же ChatGPT-диалог точные recovery facts. Только после этого можно доказать, какой substep реально ломается, расширить Rule20/RED authority и делать следующий минимальный recovery behavior patch.

До installed owner-Chrome run статус:

`LIVE_UNVERIFIED / DIAGNOSTIC_ONLY / RECOVERY_ROOT_CAUSE_PENDING_LIVE_TELEMETRY`.
