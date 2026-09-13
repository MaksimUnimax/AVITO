# Avito Finder v1.0.37 — Proxy Recovery Integrity

Дата: 2026-09-13.

База: exact опубликованный `v1.0.36 R2`, ZIP SHA-256 `c703c9875687d69b2d2ab5e265268cb5fd9ef44d86a95c305a6ae24e4589104c`.

Финальный кандидат: `AVITO_FINDER_v1.0.37_PROXY_RECOVERY_INTEGRITY_2026-09-13.zip`.

- bytes: `488986`;
- SHA-256: `4eaf64038ffd6c5b08ed7d97fdb0d13848edd8a7a9db04ad928f74b1f371ac9d`;
- source files: `144`;
- manifest version: `1.0.37`;
- version_name: `1.0.37-proxy-recovery-integrity`;
- CRC: PASS;
- независимый GitHub checkout/readback: PASS;
- installed user Chrome acceptance: **NOT_RUN**.

Статус до живой проверки: **OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED**.

## Почему v1.0.36 R2 это не исправил

`v1.0.36 R2` был узким исправлением package-version consistency после отклонённого v1.0.35: manifest и настоящий Avito adapter были согласованы. Тогда `service_worker.js`, `proxy_manager.js`, `popup.js`, `core.js`, `chatgpt_content.js` относительно v1.0.35 намеренно не переписывались. Поэтому дефекты proxy/recovery telemetry/state contract уже находились в базе и не входили в scope того патча.

Процессная ошибка предыдущего релиза: offline QA не содержал точных живых инвариантов producer → popup → target для наблюдавшегося proxy recovery сценария. v1.0.36 R2 оставался LIVE_UNVERIFIED, и живой дефект обнаружился только после установки.

## История патчей, проверенная перед изменением

Перед правкой прочитаны и приняты как regression authority:

- pre-proxy v1.0.7: exact target queue/navigation, owned child lifecycle, bounded readiness, manual CAPTCHA;
- v1.0.24: collection-first IP-block recovery, bounded VERIFY→ROTATE→VERIFY, без generic mutation replay и DIRECT fallback;
- v1.0.30: исторический regression `about:blank` trampoline;
- v1.0.31: восстановление pre-proxy exact-target lifecycle; proxy остаётся transport layer;
- v1.0.32: bounded report-send discovery и read-only manual-send reconciliation, без blind resend;
- v1.0.33: ordinary Markdown/code block не исполняется; manual CAPTCHA gate/re-anchor;
- v1.0.34: Writing Block body stability и validation before durable ownership;
- v1.0.36 R2: package/adapter consistency и test-VM disposal, без переписывания proxy runtime.

`chatgpt_content.js`, `core.js`, `proxy_manager.js`, `recovery.js`, `popup.html`, `popup.css` в v1.0.37 побайтно сохранены относительно v1.0.36 R2.

## Живые дефекты и RED

Пользовательская сессия доказала:

- сначала чистый Avito IP-block;
- затем IP-block + явную geetest CAPTCHA;
- popup `PROXY_CONFIGURED_AVITO_IP_BLOCK_AUTH_NOT_OBSERVED`;
- отчёт recovery attempt 3 при сохранённой popup-записи attempt 2;
- смешение transport probe и target verification в интерфейсе;
- потерю части диагностических причин между worker и popup.

До патча exact v1.0.36 R2 падает на новых regression tests:

- static: **0 PASS / 10 FAIL**;
- dynamic: **0 PASS / 6 FAIL**.

RED проверяет exact PAC ownership/match, probe contract, current-attempt receipt, durable probe errors, same-profile auth evidence, stale API-key indicator, endpoint-create skip evidence, CAPTCHA manual-gate staging и version consistency.

## Минимальный production diff

Из production runtime изменены только четыре файла:

1. `manifest.json` — версия 1.0.37;
2. `avito_content.js` — adapter version 1.0.37;
3. `service_worker.js` — целостность proxy-recovery state/telemetry;
4. `popup.js` — отображение точных transport/target evidence.

Не менялись navigation, explicit queue, cursor, owned-child lifecycle, ChatGPT capture, ordinary-Markdown gate, ranking/search methodology и политика manual CAPTCHA.

## Что исправлено

1. Диагностика `PROXY_CONFIGURED` теперь требует `controlled_by_this_extension` и exact active-profile PAC, а не только `mode=pac_script`.
2. Worker и popup используют один контракт `probe_before/probe_after`; transport-probe outcome отделён от target-status Avito.
3. Current recovery attempt сохраняется до terminal CAPTCHA; attempt N больше не обязан оставлять popup record N-1.
4. IP-probe time/IP/error сохраняются в durable diagnostics; причина ошибки не остаётся только в коротком log.
5. Внутреннее повторное применение того же PAC не стирает auth evidence активного profile epoch.
6. Raw/visible diagnostics показывают одновременно `IP BLOCK + CAPTCHA`, если присутствуют оба признака.
7. Manual CAPTCHA gate вычисляется до очистки `blocked_reason` и переносится через report staging/delivery.
8. На attempt >=3 при недоступном session API key/package фиксируется explicit `SKIPPED` reason; blind provider mutation не выполняется.
9. Старый persistent `key_check` больше не изображает текущий загруженный API key. API key остаётся session-scoped; политика хранения ключа не расширялась.

Патч не обещает, что любой заблокированный exit IP автоматически станет пригодным для Avito. Он исправляет доказанные state/diagnostic defects и сохраняет существующий bounded recovery без случайного failover и без обхода CAPTCHA.

## RED → GREEN и полный regression

На v1.0.37 те же новые tests:

- static: **10 PASS / 0 FAIL**;
- dynamic: **6 PASS / 0 FAIL**.

GitHub Actions run `34735272431`, attempt 2:

- exact v1.0.36 R2 base verification: PASS;
- RED on exact base: PASS;
- deterministic materialization: PASS;
- targeted GREEN: PASS;
- full worktree grouped QA: **35 PASS / 0 FAIL**;
- package final ZIP: PASS;
- full fresh-extract ZIP grouped QA: **35 PASS / 0 FAIL**;
- exact source/ZIP/QA commit: PASS;
- independent remote-readback job: PASS.

Node aggregate inside successful full runner: **367 PASS / 0 FAIL**.

Remote readback verified commit: `ba0f3a36b2a9da21c2c54a57cc09eeed9a504c9c`.
Receipt commit containing `REMOTE_READBACK.json`: `b9a3cb820f904a8c86af9198575900433c791073`.

## Сохранённые QA FAIL — не скрывать

### CI workflow v1

Первый workflow `34735185033` не дошёл до full QA: GREEN step был испорчен самим workflow — после применения deterministic patch он повторно копировал RED-bootstrap regression files, рассчитанные на v1.0.36. Runtime не являлся причиной этого FAIL. Ошибка harness сохранена; workflow заменён v2 без изменения runtime patch.

### CI v2 attempt 1

`34735272431`, attempt 1: full runner дал **34 PASS / 1 FAIL**. Единственный FAIL — `popup_lifecycle` по жёсткому deadline `30.003 s`. Runtime после этого не менялся.

Чтобы не объявлять это flaky по догадке, выполнен отдельный A/B workflow `34735768930` на одном GitHub runner с одинаковым тестом и неизменным лимитом 30 s:

- v1.0.36 R2: 4× `31/31 PASS` — 20.492 s, 9.308 s, 9.174 s, 9.224 s;
- v1.0.37: 4× `31/31 PASS` — 10.081 s, 9.415 s, 9.043 s, 9.173 s.

Это не доказывает абсолютное отсутствие будущих timing flakes, но не показывает regression v1.0.37 относительно v1.0.36. После A/B тот же full gate был повторён без изменения runtime/timeout; attempt 2 завершился полностью SUCCESS, включая final ZIP и remote readback. Старый timeout FAIL остаётся в истории.

## НАРУШЕННЫЕ ПРАВИЛА

Предыдущим процессом/кодом были нарушены:

- **Rule 2** — диагностический вывод `PROXY_CONFIGURED` не удостоверял exact PAC/ownership и смешивал probe/target уровни;
- **Rule 3** — предыдущие offline PASS не доказывали живую proxy-recovery цепочку;
- **Rule 7** — `AUTH_NOT_OBSERVED` и «Диагностика IP не завершена» выражали более сильный вывод, чем имевшиеся evidence;
- **Rule 10** — отсутствовали постоянные regressions для этих живых producer→consumer дефектов;
- **Rule 12/13** — v1.0.36 R2 был LIVE_UNVERIFIED; installed FAIL обнаружен после установки и отклонил живую приёмку;
- **Rule 18** — прежняя диагностика недостаточно явно разделяла current attempt, transport probes и target result.

Текущий patch не скрывает исторические FAIL и не переименовывает их в PASS.

## Проверка 19 правил

| № | Правило | Статус v1.0.37 | Evidence |
|---:|---|---|---|
| 1 | Не чинить ближайший симптом | PASS | Разобрана PAC→auth→probe→Avito target→popup→manual-gate цепочка и история релизов. |
| 2 | Проверять правильный уровень | PASS offline | Exact PAC ownership/match, worker producer fields, popup consumer fields, target flags. |
| 3 | Local PASS != рабочий релиз | PASS процесс | Статус остаётся LIVE_UNVERIFIED до установленного Chrome E2E. |
| 4 | Baseline неприкосновенен | PASS | Navigation/capture/core/proxy_manager/recovery не изменены; regressions пройдены. |
| 5 | ChatGPT↔Finder API contract | PASS | `chatgpt_content.js` unchanged; ordinary Markdown contract сохранён. |
| 6 | Сначала RED | PASS | Exact v1.0.36 R2: 10 static FAIL + 6 dynamic FAIL. |
| 7 | Причина доказана | PASS для исправляемых defects | Live evidence + exact code + RED. Причина блокировки конкретного Avito IP не выдумывается. |
| 8 | Минимальный patch | PASS | 4 production files. |
| 9 | Тот же defect исчез | PASS offline | Те же tests: 16/16 GREEN. |
| 10 | Реальные bugs → regressions | PASS включённого набора | 367 Node; 35/35 worktree; 35/35 final ZIP. |
| 11 | Проверить final ZIP | PASS | CRC, fresh extract, source byte equality, 35/35. |
| 12 | Installed full E2E | **NOT_RUN** | Следующий обязательный gate. |
| 13 | Live FAIL rejects acceptance | PASS процесс | v1.0.37 не называется live-working до E2E. |
| 14 | Proxy остаётся transport layer | PASS | Queue/navigation/cursor unchanged; `proxy_manager.js` unchanged. |
| 15 | Нет infinite waits | PASS regressions | Новых unbounded loops нет; существующие bounded tests PASS. |
| 16 | Test ловит живой bug | PASS | Новые tests RED на exact предыдущей версии. |
| 17 | Exact source | PASS | Exact published v1.0.36 R2 является base authority. |
| 18 | Rule report + violations | PASS | Этот документ + сохранённые RED/FAIL artifacts. |
| 19 | Exact source + ZIP + hashes + QA in GitHub | PASS на release branch | Exact source/ZIP/QA сохранены; independent remote readback PASS. После merge этот release становится main authority. |

## Следующий gate

Установить **exact ZIP с SHA-256 `4eaf64038ffd6c5b08ed7d97fdb0d13848edd8a7a9db04ad928f74b1f371ac9d`** поверх существующей распакованной папки без удаления storage. Обновить extension и вкладки ChatGPT/Avito. Затем повторить живой сценарий proxy diagnostic → TOP_REVALIDATE_PRE. До этого статус: **LIVE_UNVERIFIED**.
