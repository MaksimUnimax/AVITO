# Avito Finder v1.0.34 — матрица 128 сценариев эмуляции

**Назначение:** фиксирует ровно 128 отдельных сценариев, которые были реально прогнаны блоками на runtime v1.0.34. Это не утверждение о live-installed Chrome: Chromium/Worker использовали production JS с synthetic DOM/Chrome API doubles там, где это указано.

**Итог:** 128/128 PASS, 0 FAIL.

Каждая строка содержит: **вход → что эмулировалось → ожидание → фактический выход → статус**. Полные машинные данные лежат в `qa/v134/SCENARIO_MATRIX_128_v1.0.34.json` и исходных block JSON.

## Блок 1. Захват и финализация Writing Block

Среда: `01 writing capture/finality`

### B01-S01 — complete valid block
- **Вход:** valid AVITO_UI block + ready Copy
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** one exact command
- **Фактический выход:** count=1; exact=True; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S02 — toolbar ready before body tail
- **Вход:** partial 565-ish body; tail arrives after initial stability
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** no partial submission; one final full command
- **Фактический выход:** before_tail=0; count=1; full_tail=True; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S03 — three-chunk stream
- **Вход:** mode, then page, then steps
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** only final three-chunk body emitted
- **Фактический выход:** count=1; valid_tail=True; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S04 — same-size payload mutation
- **Вход:** valid block text changes 19→21 after toolbar appears
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** fingerprint reset; final 21 captured
- **Фактический выход:** count=1; contains_21=True; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S05 — Copy initially disabled
- **Вход:** complete body but disabled local Copy
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** wait, then one capture after enable
- **Фактический выход:** before_enable=0; after=1; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S06 — ordinary markdown code block
- **Вход:** code-block-viewer + Copy button, no writing block
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** zero commands
- **Фактический выход:** count=0; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S07 — empty shell then body
- **Вход:** writing block root exists empty, body arrives later
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** ignore empty; capture final
- **Фактический выход:** empty_phase=0; final=1; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S08 — long writing block
- **Вход:** ~20k+ chars stable command
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** one full long payload
- **Фактический выход:** count=1; len=21151; expected_len=21152; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S09 — stable invalid command
- **Вход:** invalid block with no page/steps
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** longer invalid settle then one exact validator candidate
- **Фактический выход:** at_180ms=0; at_360ms=1; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S10 — late body mutation after first sample
- **Вход:** valid body gains trailing section during payload settle
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** settle resets; final body only
- **Фактический выход:** count=1; has_last=True; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S11 — stable block repeated polling
- **Вход:** same finished block remains visible
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** exactly one candidate, no duplicates
- **Фактический выход:** first=1; later=1; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

### B01-S12 — later plain assistant turn
- **Вход:** command captured, later non-writing assistant appears
- **Эмуляция:** production chatgpt_content.js in Chromium DOM fixture
- **Ожидание:** no duplicate/rebinding
- **Фактический выход:** before_new_assistant=1; after=1; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block01.json`

## Блок 2. Парсер и локальный валидатор команд

Среда: `02 parser/validator`

### B02-S01 — valid collection
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104
Шаги:
Собери до 30 видимых карточек текущей выдачи.
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** valid AVITO_UI; COLLECT_LISTINGS limit 30
- **Фактический выход:** valid=True; errors=[]; mode=AVITO_UI; steps=[{"type":"COLLECT_LISTINGS","limit":30}]; page=https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S02 — explicit queue 6
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
Очередь:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999865
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999866
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999867
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999868
htt
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** valid queue; 6 URLs; batch 6
- **Фактический выход:** valid=True; errors=[]; mode=AVITO_UI; steps=[{"type":"COLLECT_EXPLICIT_LISTING_QUEUE","batch":6,"selected_urls":6}]; page=https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S03 — explicit queue max 30
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
Очередь:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999865
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999866
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999867
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999868
htt
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** valid queue 30, no truncation
- **Фактический выход:** valid=True; errors=[]; mode=AVITO_UI; steps=[{"type":"COLLECT_EXPLICIT_LISTING_QUEUE","batch":30,"selected_urls":30}]; page=https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S04 — explicit queue 31
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
Очередь:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999865
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999866
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999867
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999868
htt
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** reject UI_PLAN_EXPLICIT_QUEUE_TOO_LARGE
- **Фактический выход:** valid=False; errors=["UI_PLAN_EXPLICIT_QUEUE_TOO_LARGE"]; mode=AVITO_UI; steps=[{"type":"COLLECT_EXPLICIT_LISTING_QUEUE","batch":30,"selected_urls":31}]; page=https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S05 — missing page
- **Вход:** Режим:
AVITO_UI
Шаги:
Собери до 30 видимых карточек.
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** reject UI_PLAN_PAGE_REQUIRED
- **Фактический выход:** valid=False; errors=["UI_PLAN_PAGE_REQUIRED"]; mode=AVITO_UI; steps=[{"type":"COLLECT_LISTINGS","limit":30}]; page=None; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S06 — private/account path
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/profile
Шаги:
Собери до 10 видимых карточек.
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** reject page not allowed
- **Фактический выход:** valid=False; errors=["UI_PLAN_PAGE_NOT_ALLOWED"]; mode=AVITO_UI; steps=[{"type":"COLLECT_LISTINGS","limit":10}]; page=https://www.avito.ru/profile; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S07 — unknown step
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104
Шаги:
Станцуй вокруг карточки.
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** reject unsupported/step required
- **Фактический выход:** valid=False; errors=["UI_PLAN_UNSUPPORTED_STEP","UI_PLAN_STEP_REQUIRED"]; mode=AVITO_UI; steps=[]; page=https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S08 — forbidden phone click
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104
Шаги:
Нажми «Показать телефон».
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** reject forbidden action
- **Фактический выход:** valid=False; errors=["UI_PLAN_FORBIDDEN_ACTION","UI_PLAN_STEP_REQUIRED"]; mode=AVITO_UI; steps=[]; page=https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S09 — wait 5 sec
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104
Шаги:
Подожди 5 сек.
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** accept WAIT 5000ms
- **Фактический выход:** valid=True; errors=[]; mode=AVITO_UI; steps=[{"type":"WAIT"}]; page=https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S10 — wait 6 sec
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104
Шаги:
Подожди 6 сек.
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** reject wait out of range
- **Фактический выход:** valid=False; errors=["UI_PLAN_WAIT_OUT_OF_RANGE","UI_PLAN_STEP_REQUIRED"]; mode=AVITO_UI; steps=[]; page=https://www.avito.ru/all/tovary_dlya_komputera/monitory?q=monitor&s=104; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S11 — card gap 5000ms
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
Пауза между карточками:
5000 мс
Очередь:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
Шаги:
Собери публичные данные лотов из очереди пакетом 1.
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** accept exact gap 5000
- **Фактический выход:** valid=True; errors=[]; mode=AVITO_UI; steps=[{"type":"COLLECT_EXPLICIT_LISTING_QUEUE","batch":1,"selected_urls":1}]; page=https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864; gap=5000
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

### B02-S12 — card gap overflow
- **Вход:** Режим:
AVITO_UI
Страница:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
Пауза между карточками:
2147483648 мс
Очередь:
https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864
Шаги:
Собери публичные данные лотов из очереди пакетом 1.
- **Эмуляция:** production core.js parseCommandForm
- **Ожидание:** reject gap overflow
- **Фактический выход:** valid=False; errors=["UI_PLAN_CARD_GAP_OUT_OF_RANGE"]; mode=AVITO_UI; steps=[{"type":"COLLECT_EXPLICIT_LISTING_QUEUE","batch":1,"selected_urls":1}]; page=https://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864; gap=None
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block02.json`

## Блок 3. Worker: ownership payload и замещение обрезанного validation

Среда: `03 worker payload ownership/supersede`

### B03-S01 — valid payload accepted
- **Вход:** waiting state + complete valid AVITO_UI candidate
- **Эмуляция:** production service_worker.js in Chrome API VM
- **Ожидание:** accepted; no unvalidated durable state
- **Фактический выход:** response=avito_task_queued; status=COMMAND_CAPTURED; last_key=True; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block03.json`

### B03-S02 — invalid payload reports validation
- **Вход:** waiting state + stable invalid command
- **Эмуляция:** production service_worker.js in Chrome API VM
- **Ожидание:** validation report delivered/continuation; no Avito mutation
- **Фактический выход:** reason=COMMAND_INVALID_AFTER_FULL_COPY; validation_reported=True; nav=0; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block03.json`

### B03-S03 — legacy unvalidated state recovery
- **Вход:** FORM_TEXT_CAPTURED_UNVALIDATED from <=1.0.33
- **Эмуляция:** production service_worker.js in Chrome API VM
- **Ожидание:** read-only reset to waiting; form key cleared
- **Фактический выход:** status=WAITING_FOR_NEXT_ASSISTANT_FORM; last_key=None; blocked=None; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block03.json`

### B03-S04 — larger same-turn supersedes unsent validation
- **Вход:** REPORT_READY_IN_COMPOSER from 660-char partial; same assistant yields 6800-ish full payload
- **Эмуляция:** production service_worker.js in Chrome API VM
- **Ожидание:** owned staged validation discarded; larger payload accepted
- **Фактический выход:** accepted=True; discard_calls=1; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block03.json`

### B03-S05 — same-size payload cannot supersede
- **Вход:** unsent validation from 660; same turn candidate <=660 bytes
- **Эмуляция:** production service_worker.js in Chrome API VM
- **Ожидание:** COMMAND_ALREADY_IN_FLIGHT; no stage discard
- **Фактический выход:** reason=COMMAND_ALREADY_IN_FLIGHT; discard=False; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block03.json`

### B03-S06 — different assistant cannot supersede
- **Вход:** larger candidate but assistant_turn_id differs
- **Эмуляция:** production service_worker.js in Chrome API VM
- **Ожидание:** COMMAND_ALREADY_IN_FLIGHT; no discard
- **Фактический выход:** reason=COMMAND_ALREADY_IN_FLIGHT; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block03.json`

### B03-S07 — clicked report cannot be superseded
- **Вход:** larger same-turn payload but report_send_attempted=true
- **Эмуляция:** production service_worker.js in Chrome API VM
- **Ожидание:** COMMAND_ALREADY_IN_FLIGHT; never clear after irreversible Send boundary
- **Фактический выход:** reason=COMMAND_ALREADY_IN_FLIGHT; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block03.json`

### B03-S08 — stage ownership refusal blocks supersede
- **Вход:** larger same-turn payload but composer refuses exact owned-stage discard
- **Эмуляция:** production service_worker.js in Chrome API VM
- **Ожидание:** remain in-flight; no replacement command
- **Фактический выход:** reason=COMMAND_ALREADY_IN_FLIGHT; status=REPORT_READY_IN_COMPOSER; pass=True
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block03.json`

## Блок 4. Старт «Ищи» и durable start receipt

Среда: `OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130`

### B04-S01 — normal start uses exact new user turn and one durable intent
- **Вход:** Fixture/событие: normal start uses exact new user turn and one durable intent
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130
- **Ожидание:** Должен соблюдаться инвариант сценария: normal start uses exact new user turn and one durable intent
- **Фактический выход:** ms=2173; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block04_start_receipt.json`

### B04-S02 — folded exact start is expanded presentation-only and acknowledged after one Send
- **Вход:** Fixture/событие: folded exact start is expanded presentation-only and acknowledged after one Send
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130
- **Ожидание:** Должен соблюдаться инвариант сценария: folded exact start is expanded presentation-only and acknowledged after one Send
- **Фактический выход:** ms=2207; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block04_start_receipt.json`

### B04-S03 — live regression: second visible Ищи without data-turn-id is acknowledged via visible bubble plus assistant
- **Вход:** Fixture/событие: live regression: second visible Ищи without data-turn-id is acknowledged via visible bubble plus assistant
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130
- **Ожидание:** Должен соблюдаться инвариант сценария: live regression: second visible Ищи without data-turn-id is acknowledged via visible bubble plus assistant
- **Фактический выход:** ms=2110; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block04_start_receipt.json`

### B04-S04 — assistant-first DOM confirms start without requiring materialized user turn
- **Вход:** Fixture/событие: assistant-first DOM confirms start without requiring materialized user turn
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130
- **Ожидание:** Должен соблюдаться инвариант сценария: assistant-first DOM confirms start without requiring materialized user turn
- **Фактический выход:** ms=2111; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block04_start_receipt.json`

### B04-S05 — assistant fallback is rejected when an intervening user turn exists
- **Вход:** Fixture/событие: assistant fallback is rejected when an intervening user turn exists
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130
- **Ожидание:** Должен соблюдаться инвариант сценария: assistant fallback is rejected when an intervening user turn exists
- **Фактический выход:** ms=102; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block04_start_receipt.json`

### B04-S06 — read-only start reconciliation accepts late exact user turn
- **Вход:** Fixture/событие: read-only start reconciliation accepts late exact user turn
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130
- **Ожидание:** Должен соблюдаться инвариант сценария: read-only start reconciliation accepts late exact user turn
- **Фактический выход:** ms=107; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block04_start_receipt.json`

### B04-S07 — read-only start reconciliation accepts one new assistant turn
- **Вход:** Fixture/событие: read-only start reconciliation accepts one new assistant turn
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130
- **Ожидание:** Должен соблюдаться инвариант сценария: read-only start reconciliation accepts one new assistant turn
- **Фактический выход:** ms=107; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block04_start_receipt.json`

### B04-S08 — failed durable start intent prevents Send click
- **Вход:** Fixture/событие: failed durable start intent prevents Send click
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130
- **Ожидание:** Должен соблюдаться инвариант сценария: failed durable start intent prevents Send click
- **Фактический выход:** ms=2112; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block04_start_receipt.json`

## Блок 5. ChatGPT DOM adapter: отчёты, STOP, draft, CAPTCHA re-anchor

Среда: `OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM`

### B05-S01 — report sends once, returns new exact user turn and restores same-chat continuation identity
- **Вход:** Fixture/событие: report sends once, returns new exact user turn and restores same-chat continuation identity
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: report sends once, returns new exact user turn and restores same-chat continuation identity
- **Фактический выход:** elapsed_ms=2173; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S02 — concurrent and later duplicate delivery IDs produce one Send click
- **Вход:** Fixture/событие: concurrent and later duplicate delivery IDs produce one Send click
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: concurrent and later duplicate delivery IDs produce one Send click
- **Фактический выход:** elapsed_ms=2105; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S03 — STOP during report staging prevents delayed Send click
- **Вход:** Fixture/событие: STOP during report staging prevents delayed Send click
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: STOP during report staging prevents delayed Send click
- **Фактический выход:** elapsed_ms=2098; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S04 — user unsent composer text is preserved and report is not sent
- **Вход:** Fixture/событие: user unsent composer text is preserved and report is not sent
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: user unsent composer text is preserved and report is not sent
- **Фактический выход:** elapsed_ms=119; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S05 — user edit during report staging cancels Send and preserves edited text
- **Вход:** Fixture/событие: user edit during report staging cancels Send and preserves edited text
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: user edit during report staging cancels Send and preserves edited text
- **Фактический выход:** elapsed_ms=2104; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S06 — conversation route change during staging prevents Send into another chat
- **Вход:** Fixture/событие: conversation route change during staging prevents Send into another chat
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: conversation route change during staging prevents Send into another chat
- **Фактический выход:** elapsed_ms=2098; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S07 — wrong pinned conversation cannot receive report
- **Вход:** Fixture/событие: wrong pinned conversation cannot receive report
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: wrong pinned conversation cannot receive report
- **Фактический выход:** elapsed_ms=88; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S08 — STOP during initial Start staging prevents delayed Start click
- **Вход:** Fixture/событие: STOP during initial Start staging prevents delayed Start click
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: STOP during initial Start staging prevents delayed Start click
- **Фактический выход:** elapsed_ms=2092; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S09 — completed Writing Block captured exactly once without external browser connector
- **Вход:** Fixture/событие: completed Writing Block captured exactly once without external browser connector
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: completed Writing Block captured exactly once without external browser connector
- **Фактический выход:** elapsed_ms=4843; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S10 — ordinary markdown code block Copy control is never accepted as Writing Block command
- **Вход:** Fixture/событие: ordinary markdown code block Copy control is never accepted as Writing Block command
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: ordinary markdown code block Copy control is never accepted as Writing Block command
- **Фактический выход:** elapsed_ms=3306; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

### B05-S11 — manual user turn can re-anchor CAPTCHA gate and next real Writing Block is captured
- **Вход:** Fixture/событие: manual user turn can re-anchor CAPTCHA gate and next real Writing Block is captured
- **Эмуляция:** OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM
- **Ожидание:** Должен соблюдаться инвариант сценария: manual user turn can re-anchor CAPTCHA gate and next real Writing Block is captured
- **Фактический выход:** elapsed_ms=4420; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block05_chat_dom.json`

## Блок 6. Avito DOM adapter и collection surface

Среда: `real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites`

### B06-S01 — manifest schema and version checked (installation not claimed)
- **Вход:** Fixture/событие: manifest schema and version checked (installation not claimed)
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: manifest schema and version checked (installation not claimed)
- **Фактический выход:** elapsed_ms=0; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S02 — whole-page diagnosis reads full body, not delivery button; hidden/input text excluded from HTML
- **Вход:** Fixture/событие: whole-page diagnosis reads full body, not delivery button; hidden/input text excluded from HTML
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: whole-page diagnosis reads full body, not delivery button; hidden/input text excluded from HTML
- **Фактический выход:** elapsed_ms=155; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S03 — semantic main root preferred to body
- **Вход:** Fixture/событие: semantic main root preferred to body
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: semantic main root preferred to body
- **Фактический выход:** elapsed_ms=121; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S04 — public configuration and direct-delivery button collected without clicking
- **Вход:** Fixture/событие: public configuration and direct-delivery button collected without clicking
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: public configuration and direct-delivery button collected without clicking
- **Фактический выход:** elapsed_ms=129; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S05 — exact visible interactive delivery control works even when Avito marker changed
- **Вход:** Fixture/событие: exact visible interactive delivery control works even when Avito marker changed
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: exact visible interactive delivery control works even when Avito marker changed
- **Фактический выход:** elapsed_ms=135; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S06 — disabled delivery control is not direct-delivery confirmation
- **Вход:** Fixture/событие: disabled delivery control is not direct-delivery confirmation
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: disabled delivery control is not direct-delivery confirmation
- **Фактический выход:** elapsed_ms=125; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S07 — seller icebreaker is not direct-delivery confirmation
- **Вход:** Fixture/событие: seller icebreaker is not direct-delivery confirmation
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: seller icebreaker is not direct-delivery confirmation
- **Фактический выход:** elapsed_ms=127; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S08 — delayed DOM renders are awaited; real order and listing IDs preserved
- **Вход:** Fixture/событие: delayed DOM renders are awaited; real order and listing IDs preserved
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: delayed DOM renders are awaited; real order and listing IDs preserved
- **Фактический выход:** elapsed_ms=624; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S09 — requested 35 visible-rendered records are not silently capped at 30
- **Вход:** Fixture/событие: requested 35 visible-rendered records are not silently capped at 30
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: requested 35 visible-rendered records are not silently capped at 30
- **Фактический выход:** elapsed_ms=134; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S10 — missing DOM is an explicit bounded error, not completed empty selection
- **Вход:** Fixture/событие: missing DOM is an explicit bounded error, not completed empty selection
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: missing DOM is an explicit bounded error, not completed empty selection
- **Фактический выход:** elapsed_ms=420; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S11 — explicit visible empty-result state is distinguished from unloaded page
- **Вход:** Fixture/событие: explicit visible empty-result state is distinguished from unloaded page
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: explicit visible empty-result state is distinguished from unloaded page
- **Фактический выход:** elapsed_ms=116; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S12 — visible IP-block propagates through normal-tempo collection
- **Вход:** Fixture/событие: visible IP-block propagates through normal-tempo collection
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: visible IP-block propagates through normal-tempo collection
- **Фактический выход:** elapsed_ms=121; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S13 — visible rate-limit page is classified separately from IP block and CAPTCHA
- **Вход:** Fixture/событие: visible rate-limit page is classified separately from IP block and CAPTCHA
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: visible rate-limit page is classified separately from IP block and CAPTCHA
- **Фактический выход:** elapsed_ms=123; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S14 — CAPTCHA remains manual; no collection or automatic solution
- **Вход:** Fixture/событие: CAPTCHA remains manual; no collection or automatic solution
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: CAPTCHA remains manual; no collection or automatic solution
- **Фактический выход:** elapsed_ms=124; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S15 — STOP cancels pending work before click and allows a fresh read command
- **Вход:** Fixture/событие: STOP cancels pending work before click and allows a fresh read command
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: STOP cancels pending work before click and allows a fresh read command
- **Фактический выход:** elapsed_ms=326; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

### B06-S16 — reinjecting the same adapter does not duplicate message handlers
- **Вход:** Fixture/событие: reinjecting the same adapter does not duplicate message handlers
- **Эмуляция:** real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites
- **Ожидание:** Должен соблюдаться инвариант сценария: reinjecting the same adapter does not duplicate message handlers
- **Фактический выход:** elapsed_ms=183; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block06_avito_dom.json`

## Блок 7. Composer/report delivery — базовый round-trip

Среда: `OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE`

### B07-S01 — multiline textarea retains exact payload
- **Вход:** Синтетический primary composer / событие: multiline textarea retains exact payload
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: multiline textarea retains exact payload
- **Фактический выход:** ms=2178; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/composer_01_05.json`

### B07-S02 — multiline contenteditable preserves lines through asynchronous model reparse; one Send
- **Вход:** Синтетический primary composer / событие: multiline contenteditable preserves lines through asynchronous model reparse; one Send
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: multiline contenteditable preserves lines through asynchronous model reparse; one Send
- **Фактический выход:** ms=2112; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/composer_01_05.json`

### B07-S03 — same report after editor converts paragraphs to div
- **Вход:** Синтетический primary composer / событие: same report after editor converts paragraphs to div
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: same report after editor converts paragraphs to div
- **Фактический выход:** ms=2103; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/composer_01_05.json`

### B07-S04 — same report after editor converts paragraphs to br
- **Вход:** Синтетический primary composer / событие: same report after editor converts paragraphs to br
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: same report after editor converts paragraphs to br
- **Фактический выход:** ms=2110; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/composer_01_05.json`

### B07-S05 — 120-row rich-editor report exceeds failed live size without truncation
- **Вход:** Синтетический primary composer / событие: 120-row rich-editor report exceeds failed live size without truncation
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: 120-row rich-editor report exceeds failed live size without truncation
- **Фактический выход:** ms=2134; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/composer_01_05.json`

### B07-S06 — 13,247-character synthetic report delivers in rich editor
- **Вход:** Синтетический primary composer / событие: 13,247-character synthetic report delivers in rich editor
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: 13,247-character synthetic report delivers in rich editor
- **Фактический выход:** ms=2170; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block07_composer_06_10.json`

### B07-S07 — blank lines, tabs, double spaces, NBSP, ZWJ and zero-width text preserved
- **Вход:** Синтетический primary composer / событие: blank lines, tabs, double spaces, NBSP, ZWJ and zero-width text preserved
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: blank lines, tabs, double spaces, NBSP, ZWJ and zero-width text preserved
- **Фактический выход:** ms=2126; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block07_composer_06_10.json`

### B07-S08 — concurrent duplicate and repeated delivery ID yield one click
- **Вход:** Синтетический primary composer / событие: concurrent duplicate and repeated delivery ID yield one click
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: concurrent duplicate and repeated delivery ID yield one click
- **Фактический выход:** ms=2115; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block07_composer_06_10.json`

### B07-S09 — protect against edit during staging: real_input
- **Вход:** Синтетический primary composer / событие: protect against edit during staging: real_input
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: protect against edit during staging: real_input
- **Фактический выход:** ms=2116; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block07_composer_06_10.json`

### B07-S10 — protect against edit during staging: no_button
- **Вход:** Синтетический primary composer / событие: protect against edit during staging: no_button
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: protect against edit during staging: no_button
- **Фактический выход:** ms=8123; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block07_composer_06_10.json`

## Блок 8. Composer/report delivery — edit races и missing Send

Среда: `OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE`

### B08-S01 — protect against edit during staging: price
- **Вход:** Синтетический primary composer / событие: protect against edit during staging: price
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: protect against edit during staging: price
- **Фактический выход:** ms=2168; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block08_composer_11_15.json`

### B08-S02 — protect against edit during staging: blank_line
- **Вход:** Синтетический primary composer / событие: protect against edit during staging: blank_line
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: protect against edit during staging: blank_line
- **Фактический выход:** ms=2148; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block08_composer_11_15.json`

### B08-S03 — protect against edit during staging: zwj
- **Вход:** Синтетический primary composer / событие: protect against edit during staging: zwj
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: protect against edit during staging: zwj
- **Фактический выход:** ms=2107; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block08_composer_11_15.json`

### B08-S04 — protect against edit during staging: undo_same
- **Вход:** Синтетический primary composer / событие: protect against edit during staging: undo_same
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: protect against edit during staging: undo_same
- **Фактический выход:** ms=2103; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block08_composer_11_15.json`

### B08-S05 — missing Send leaves complete report, does not clear composer
- **Вход:** Синтетический primary composer / событие: missing Send leaves complete report, does not clear composer
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: missing Send leaves complete report, does not clear composer
- **Фактический выход:** ms=8158; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block08_composer_11_15.json`

## Блок 9. Composer/report delivery — delayed Send, STOP, route, ownership

Среда: `OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE`

### B09-S01 — Send control appearing after old fixed 2s window is discovered without operator click
- **Вход:** Синтетический primary composer / событие: Send control appearing after old fixed 2s window is discovered without operator click
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: Send control appearing after old fixed 2s window is discovered without operator click
- **Фактический выход:** ms=3697; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block09_composer_16_20.json`

### B09-S02 — STOP fences later rich-editor Send
- **Вход:** Синтетический primary composer / событие: STOP fences later rich-editor Send
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: STOP fences later rich-editor Send
- **Фактический выход:** ms=2104; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block09_composer_16_20.json`

### B09-S03 — route change before Send blocks different conversation
- **Вход:** Синтетический primary composer / событие: route change before Send blocks different conversation
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: route change before Send blocks different conversation
- **Фактический выход:** ms=2104; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block09_composer_16_20.json`

### B09-S04 — ownership attributes cannot substitute equality or authorize draft overwrite
- **Вход:** Синтетический primary composer / событие: ownership attributes cannot substitute equality or authorize draft overwrite
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: ownership attributes cannot substitute equality or authorize draft overwrite
- **Фактический выход:** ms=100; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block09_composer_16_20.json`

### B09-S05 — exact preexisting p-block report can be delivered without rewriting
- **Вход:** Синтетический primary composer / событие: exact preexisting p-block report can be delivered without rewriting
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: exact preexisting p-block report can be delivered without rewriting
- **Фактический выход:** ms=124; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block09_composer_16_20.json`

## Блок 10. Composer/report delivery — read-only reconciliation

Среда: `OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE`

### B10-S01 — unsupported editor transformation fails with readback diagnostics, not user blame
- **Вход:** Синтетический primary composer / событие: unsupported editor transformation fails with readback diagnostics, not user blame
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: unsupported editor transformation fails with readback diagnostics, not user blame
- **Фактический выход:** ms=2160; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block10_composer_21_25.json`

### B10-S02 — read-only reconciliation: confirmed
- **Вход:** Синтетический primary composer / событие: read-only reconciliation: confirmed
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: read-only reconciliation: confirmed
- **Фактический выход:** ms=99; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block10_composer_21_25.json`

### B10-S03 — read-only reconciliation: staged
- **Вход:** Синтетический primary composer / событие: read-only reconciliation: staged
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: read-only reconciliation: staged
- **Фактический выход:** ms=97; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block10_composer_21_25.json`

### B10-S04 — read-only reconciliation: unrelated
- **Вход:** Синтетический primary composer / событие: read-only reconciliation: unrelated
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: read-only reconciliation: unrelated
- **Фактический выход:** ms=1608; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block10_composer_21_25.json`

### B10-S05 — read-only reconciliation: prefix
- **Вход:** Синтетический primary composer / событие: read-only reconciliation: prefix
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: read-only reconciliation: prefix
- **Фактический выход:** ms=1613; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block10_composer_21_25.json`

## Блок 11. Composer/report delivery — anchor/focus/concurrency/Unicode hash

Среда: `OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE`

### B11-S01 — read-only reconciliation: missing_anchor
- **Вход:** Синтетический primary composer / событие: read-only reconciliation: missing_anchor
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: read-only reconciliation: missing_anchor
- **Фактический выход:** ms=160; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block11_composer_26_29.json`

### B11-S02 — focus/selection alone is not a user edit
- **Вход:** Синтетический primary composer / событие: focus/selection alone is not a user edit
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: focus/selection alone is not a user edit
- **Фактический выход:** ms=2103; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block11_composer_26_29.json`

### B11-S03 — different simultaneous reports cannot take over the same composer
- **Вход:** Синтетический primary composer / событие: different simultaneous reports cannot take over the same composer
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: different simultaneous reports cannot take over the same composer
- **Фактический выход:** ms=2102; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block11_composer_26_29.json`

### B11-S04 — hash equality cannot coalesce a different Unicode payload
- **Вход:** Синтетический primary composer / событие: hash equality cannot coalesce a different Unicode payload
- **Эмуляция:** OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE
- **Ожидание:** Должен соблюдаться инвариант доставки/редактора: hash equality cannot coalesce a different Unicode payload
- **Фактический выход:** ms=2104; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block11_composer_26_29.json`

## Блок 12. Sent-message receipt и подтверждение доставки

Среда: `OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES`

### B12-S01 — sent-message body recognition: folded
- **Вход:** Fixture/событие: sent-message body recognition: folded
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: sent-message body recognition: folded
- **Фактический выход:** ms=2374; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S02 — sent-message body recognition: visible_controls
- **Вход:** Fixture/событие: sent-message body recognition: visible_controls
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: sent-message body recognition: visible_controls
- **Фактический выход:** ms=2203; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S03 — sent-message body recognition: plain
- **Вход:** Fixture/событие: sent-message body recognition: plain
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: sent-message body recognition: plain
- **Фактический выход:** ms=2205; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S04 — sent-message body recognition: split_role
- **Вход:** Fixture/событие: sent-message body recognition: split_role
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: sent-message body recognition: split_role
- **Фактический выход:** ms=2207; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S05 — sent-message body recognition: hydrating
- **Вход:** Fixture/событие: sent-message body recognition: hydrating
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: sent-message body recognition: hydrating
- **Фактический выход:** ms=2316; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S06 — sent-message body recognition: remount
- **Вход:** Fixture/событие: sent-message body recognition: remount
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: sent-message body recognition: remount
- **Фактический выход:** ms=2313; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S07 — sent-message body recognition: article
- **Вход:** Fixture/событие: sent-message body recognition: article
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: sent-message body recognition: article
- **Фактический выход:** ms=2222; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S08 — sent-message body recognition: wrapped_controls
- **Вход:** Fixture/событие: sent-message body recognition: wrapped_controls
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: sent-message body recognition: wrapped_controls
- **Фактический выход:** ms=2305; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S09 — sent-message body recognition: label_only
- **Вход:** Fixture/событие: sent-message body recognition: label_only
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: sent-message body recognition: label_only
- **Фактический выход:** ms=2302; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S10 — 19,495-character folded report acknowledged after one Send
- **Вход:** Fixture/событие: 19,495-character folded report acknowledged after one Send
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: 19,495-character folded report acknowledged after one Send
- **Фактический выход:** ms=2319; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S11 — hidden body is not scraped or accepted merely because it exists
- **Вход:** Fixture/событие: hidden body is not scraped or accepted merely because it exists
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: hidden body is not scraped or accepted merely because it exists
- **Фактический выход:** ms=109; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S12 — no false receipt: foreign
- **Вход:** Fixture/событие: no false receipt: foreign
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: no false receipt: foreign
- **Фактический выход:** ms=97; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S13 — no false receipt: prefix
- **Вход:** Fixture/событие: no false receipt: prefix
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: no false receipt: prefix
- **Фактический выход:** ms=106; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S14 — no false receipt: wrong_price
- **Вход:** Fixture/событие: no false receipt: wrong_price
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: no false receipt: wrong_price
- **Фактический выход:** ms=108; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S15 — no false receipt: missing_tail
- **Вход:** Fixture/событие: no false receipt: missing_tail
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: no false receipt: missing_tail
- **Фактический выход:** ms=105; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S16 — no false receipt: duplicate
- **Вход:** Fixture/событие: no false receipt: duplicate
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: no false receipt: duplicate
- **Фактический выход:** ms=118; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S17 — hidden labels and controls excluded from message text
- **Вход:** Fixture/событие: hidden labels and controls excluded from message text
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: hidden labels and controls excluded from message text
- **Фактический выход:** ms=167; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S18 — expand control pointing outside pending user message never clicked
- **Вход:** Fixture/событие: expand control pointing outside pending user message never clicked
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: expand control pointing outside pending user message never clicked
- **Фактический выход:** ms=413; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S19 — failed durable intent prevents actual Send click
- **Вход:** Fixture/событие: failed durable intent prevents actual Send click
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: failed durable intent prevents actual Send click
- **Фактический выход:** ms=2110; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S20 — acknowledgement wait fenced after STOP
- **Вход:** Fixture/событие: acknowledgement wait fenced after STOP
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: acknowledgement wait fenced after STOP
- **Фактический выход:** ms=2200; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S21 — acknowledgement wait fenced after different_chat
- **Вход:** Fixture/событие: acknowledgement wait fenced after different_chat
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: acknowledgement wait fenced after different_chat
- **Фактический выход:** ms=2208; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S22 — receipt migration/recovery: legacy
- **Вход:** Fixture/событие: receipt migration/recovery: legacy
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: receipt migration/recovery: legacy
- **Фактический выход:** ms=207; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S23 — receipt migration/recovery: receipt_with_evicted_predecessor
- **Вход:** Fixture/событие: receipt migration/recovery: receipt_with_evicted_predecessor
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: receipt migration/recovery: receipt_with_evicted_predecessor
- **Фактический выход:** ms=205; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S24 — receipt migration/recovery: unknown_predecessor
- **Вход:** Fixture/событие: receipt migration/recovery: unknown_predecessor
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: receipt migration/recovery: unknown_predecessor
- **Фактический выход:** ms=103; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

### B12-S25 — newer unrelated turn cannot steal matching report anchor
- **Вход:** Fixture/событие: newer unrelated turn cannot steal matching report anchor
- **Эмуляция:** OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES
- **Ожидание:** Должен соблюдаться инвариант сценария: newer unrelated turn cannot steal matching report anchor
- **Фактический выход:** ms=102; status=PASS
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/block12_receipts.json`

## Блок 13. Сквозные queue/recovery циклы

Среда: `PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; CHROME_API_DOUBLES; NOT_INSTALLED_OR_LIVE`

### B13-S01 — manual_captcha_same_child_resume
- **Вход:** 3 detail URL; CAPTCHA на дочерней карточке; ручное продолжение
- **Эмуляция:** PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; CHROME_API_DOUBLES; NOT_INSTALLED_OR_LIVE
- **Ожидание:** resume в той же child-tab lifecycle; cursor=3; завершение очереди
- **Фактический выход:** status=PASS; send_clicks_including_start=3; reports=2; last_report_characters=2694; cursor=3; state=WAITING_FOR_NEXT_ASSISTANT_FORM; duration_seconds=11.696
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/queue_manual_captcha_same_child_resume.json`

### B13-S02 — rate_limit_mid_queue_restart_direct_route
- **Вход:** 3 detail URL; HTTP 429 посреди очереди; restart worker
- **Эмуляция:** PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; CHROME_API_DOUBLES; NOT_INSTALLED_OR_LIVE
- **Ожидание:** тот же direct route; cursor=3; один финальный отчёт; без повтора уже прочитанных
- **Фактический выход:** status=PASS; send_clicks_including_start=2; reports=1; last_report_characters=2695; cursor=3; state=WAITING_FOR_NEXT_ASSISTANT_FORM; duration_seconds=11.448
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/queue_rate_limit_mid_queue_restart_direct_route.json`

### B13-S03 — removed_listing_is_negative_observation
- **Вход:** 3 detail URL; один лот REMOVED
- **Эмуляция:** PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; CHROME_API_DOUBLES; NOT_INSTALLED_OR_LIVE
- **Ожидание:** REMOVED сохраняется как отрицательное наблюдение, очередь не ломается; cursor=3
- **Фактический выход:** status=PASS; send_clicks_including_start=2; reports=1; last_report_characters=2488; cursor=3; state=WAITING_FOR_NEXT_ASSISTANT_FORM; duration_seconds=9.089
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/queue_removed_listing_is_negative_observation.json`

### B13-S04 — restart_during_persisted_gap
- **Вход:** 3 detail URL; persisted card gap; restart worker во время паузы
- **Эмуляция:** PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; CHROME_API_DOUBLES; NOT_INSTALLED_OR_LIVE
- **Ожидание:** gap/cursor переживают restart; cursor=3; завершение
- **Фактический выход:** status=PASS; send_clicks_including_start=2; reports=1; last_report_characters=2697; cursor=3; state=WAITING_FOR_NEXT_ASSISTANT_FORM; duration_seconds=13.262
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/queue_restart_during_persisted_gap.json`

### B13-S05 — six_details_two_batches
- **Вход:** 6 detail URL, batch=3, два пакета
- **Эмуляция:** PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; CHROME_API_DOUBLES; NOT_INSTALLED_OR_LIVE
- **Ожидание:** cursor=6; два отчёта; возврат WAITING_FOR_NEXT_ASSISTANT_FORM
- **Фактический выход:** status=PASS; send_clicks_including_start=3; reports=2; last_report_characters=4429; cursor=6; state=WAITING_FOR_NEXT_ASSISTANT_FORM; duration_seconds=15.826
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/queue_six_details_two_batches.json`

### B13-S06 — stop_during_late_detail_response
- **Вход:** detail response приходит после STOP
- **Эмуляция:** PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; CHROME_API_DOUBLES; NOT_INSTALLED_OR_LIVE
- **Ожидание:** STOP fence; отчёт не отправляется; состояние CANCELLED_BY_USER
- **Фактический выход:** status=PASS; send_clicks_including_start=1; reports=0; last_report_characters=0; cursor=1; state=CANCELLED_BY_USER; duration_seconds=7.856
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/queue_stop_during_late_detail_response.json`

### B13-S07 — thirty_detail_large_report
- **Вход:** 30 detail URL; большой итоговый отчёт
- **Эмуляция:** PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; CHROME_API_DOUBLES; NOT_INSTALLED_OR_LIVE
- **Ожидание:** cursor=30; один отчёт >200k символов; один Send; возврат WAITING_FOR_NEXT_ASSISTANT_FORM
- **Фактический выход:** status=PASS; send_clicks_including_start=2; reports=1; last_report_characters=233804; cursor=30; state=WAITING_FOR_NEXT_ASSISTANT_FORM; duration_seconds=12.353
- **Статус:** **PASS**
- **Сырой отчёт:** `qa/v134/blocks/queue_thirty_detail_large_report.json`

