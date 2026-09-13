# Avito Finder — обязательный startup authority

Перед любой работой полностью прочитать:

1. `подбор авито расширение/PATCH_ENGINEERING_RULES.md` — постоянные **20** правил.
2. `подбор авито расширение/ТЕКУЩИЙ_ПРОГРЕСС.md`.
3. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md` и `.json`.
4. Актуальный release authority: `PATCH_REPORT`, `REMOTE_READBACK`, `CHECKPOINT`, `BUILD`, `MATERIALIZATION`, `MAIN_RELEASE_RECEIPT`.

## Rule 20

`FULL_HISTORY_AUDIT=PASS` для authority от 2026-09-13. Исторический audit охватывает все обнаруженные версии/patches/code authorities, а source gaps/mismatches отмечает явно. Перед будущим runtime patch этот audit обязателен как baseline; новый patch всё равно требует новой live observation → exact-source RED → minimal patch → full final ZIP QA → installed E2E.

## Текущая main authority

**Avito Finder v1.0.39 — Exact Requested Tab Disambiguation**.

Release root:

`подбор авито расширение/releases/v1.0.39/`

ZIP:

`AVITO_FINDER_v1.0.39_EXACT_REQUESTED_TAB_DISAMBIGUATION_2026-09-13.zip`

- SHA-256: `a4a0ae626de4692c62cd76d87be19e34749b488e76afa2764828a025db08bb98`;
- bytes: `492784`;
- source files: `148`;
- PR #5 merged;
- merge commit: `8a5c9b9e8333ba617e6420db4352d972e3f6f0fd`;
- main receipt: `releases/v1.0.39/MAIN_RELEASE_RECEIPT.json`;
- final workflow: `34743734524`;
- targeted exact-tab regression: `5/5 PASS`;
- worktree grouped QA: `35/35 PASS`;
- Node aggregate: `369/369 PASS`;
- final ZIP fresh-extract grouped QA: `35/35 PASS`;
- independent remote readback: `PASS`;
- installed Chrome E2E: **NOT_RUN**.

Status:

`MAIN_AUTHORITY / OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED`.

## Почему появился v1.0.39

Installed v1.0.38 task `af-20260913062414-29ps` дважды остановился на `COMMAND_CAPTURED` с `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`, recovery=0, mutations=0, cards read=0.

Команда уже содержала exact Dell URL, но v1.0.38 `selectVisibleAvitoTab(windowId)` игнорировал `requestedUrl`. При нескольких Avito tabs и активной вкладке ChatGPT selector видел несколько кандидатов и ни одной active Avito tab, поэтому завершался `AMBIGUOUS` ещё до routing.

v1.0.39 сохраняет старые safety boundaries:

- unique active Avito tab по-прежнему имеет приоритет;
- если active Avito нет, допускается только **ровно один** existing tab, совпадающий с normalized requested public Avito route;
- zero exact matches при нескольких tabs → `AMBIGUOUS`;
- duplicate exact matches → `AMBIGUOUS`;
- tab не навигируется ради disambiguation;
- single-tab behavior сохранено.

Production behavior изменён только в `service_worker.js`; `manifest.json` и `avito_content.js` меняют release identity. `chatgpt_content.js`, `core.js`, `proxy_manager.js`, `recovery.js`, `popup.js/html/css` побайтно сохранены от v1.0.38.

## Первый v1.0.39 full gate — сохранить как FAIL

Workflow `34743154320` = `33 PASS / 2 FAIL` и не является успешным gate.

Причины:

1. новый permanent regression был standalone helper с обязательным `argv[2]`, а aggregate `node --test tests/*.test.js` запускает test-файлы без custom args → `SOURCE_PATH_REQUIRED`;
2. `adapter_identity` hit старый 20s group deadline на `20.003s`.

A/B diagnostic `34743603061` без runtime changes доказал:

- v1.0.38 Node `368/368 PASS`;
- temporary v1.0.39: sole FAIL = `SOURCE_PATH_REQUIRED` нового test-файла;
- adapter timings на одном runner:
  - v1.0.38 `19.55 / 0.96 / 0.95 / 0.75s`;
  - v1.0.39 `2.39 / 1.20 / 0.77 / 0.89s`.

После этого сделаны только test-harness corrections: regression получает default соседний release worker при aggregate run; adapter identity QA deadline 20→30s. Production timeouts/runtime patch не менялись.

Diagnosis:

`подбор авито расширение/v139_prepatch_tests/FIRST_GATE_FAILURE_DIAGNOSIS.md`.

## Сохраняемые границы

- Writing Block — единственная исполняемая assistant-команда.
- Ordinary Markdown/code block — zero commands.
- CAPTCHA остаётся ручной.
- Proxy остаётся transport layer и не меняет target URL/order/queue/cursor/capture/report.
- Blind resend отчётов запрещён.
- Не повторять uncertain Avito mutation.
- Baseline поиска `150/150` не сбрасывать.
- TOP_REVALIDATE_PRE сохраняет Dell `4750223208`, Mini ITX `8156773014`, Lenovo `8375159229`.
- Долгая доставка Dell сама по себе ranking не меняет.
- Proxy.Market API key остаётся session-scoped; после extension reload может потребоваться загрузить его снова.

## История FAIL — не стирать

- v1.0.30 `about:blank` navigation regression → v1.0.31.
- v1.0.35 version/adapter mismatch → rejected.
- v1.0.36 R1 test VM disposal → R2 test-only cleanup.
- v1.0.36 R2 historical popup timeout retained.
- v1.0.37 offline QA PASS, live IP-block acceptance FAIL.
- v1.0.38 ранние harness attempts не засчитывались; final workflow `34738398529` authority.
- v1.0.39 first full gate `34743154320` FAIL сохранён; final authority workflow `34743734524`.

## Следующий gate

Установить exact main v1.0.39 **поверх существующей распакованной папки без удаления extension/storage**, Reload extension, обновить ChatGPT/Avito tabs, проверить version `1.0.39`, при необходимости снова загрузить Proxy.Market API key в session и повторить тот же TOP_REVALIDATE_PRE.

До успешного installed user Chrome E2E v1.0.39 нельзя называть доказанно рабочей на живом Avito.
