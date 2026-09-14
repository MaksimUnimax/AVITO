# Avito Finder v1.0.32 — QA report

Дата: 2026-09-12

## Scope

Offline regression production runtime. Node VM использует Chrome API doubles; Chromium tests исполняют production DOM adapters на synthetic pages. Реальные Avito/ChatGPT/Proxy.Market не вызываются.

## Node runtime

`node --test tests/*.test.js`

Результат:

- tests: 344;
- pass: 344;
- fail: 0;
- skipped: 0;
- cancelled: 0.

Включены новые regression cases:

1. wake после `PRIMARY_COMPOSER_SEND_BUTTON_MISSING`, `report_send_attempted=false`, manual exact user-turn уже присутствует → `WAITING_FOR_NEXT_ASSISTANT_FORM`, next prompt poll, `AF_CAPTURE_SEND_REPORT=0`;
2. pre-click staged report остаётся под bounded read-only reconciliation; после появления manual exact user-turn подтверждается без второго Send.

## Chromium Avito adapter

`browser_fixtures_v125.py`

- 16/16 PASS.

Проверяются public DOM collection, direct-delivery proof, IP/rate/CAPTCHA classification, empty/unavailable surface и STOP.

## Chromium ChatGPT adapter

`browser_chat_fixtures_v125.py`

- 9/9 PASS.

Включает one-Send report, duplicate delivery id, STOP, user draft protection, route change, wrong conversation и Writing Block capture.

## Start receipt

`browser_start_receipt_v130.py`

- 8/8 PASS.

Сохраняется v1.0.30 durable-start behavior.

## Rich composer / report delivery

`browser_composer_v126.py`, тесты выполнены отдельными bounded ranges 1–29:

- 29/29 PASS.

Новый live-regression fixture:

- Send control скрыт дольше старого 2-second window;
- появляется через 3.5 s;
- production adapter обнаруживает его в bounded discovery;
- report отправляется один раз;
- payload сохраняется точно.

Также PASS: no-button retained report, STOP during discovery, conversation change, concurrent reports, long 13k+ report, exact readback and read-only reconciliation.

## Sent-message receipt

`browser_receipts_v127.py` выполнен группами:

- 25/25 PASS.

Проверены folded/hydrating/remounted long messages, false-positive rejection, durable intent failure, STOP/route fencing, receipt recovery and newer unrelated user turns.

## Cross-component

`browser_cycle_v127.py`:

- `full_three_page_folded_cycle`: PASS — 3 reports × 30 rows, one Send per report, continuation works;
- `late_body_then_worker_restart_reconcile`: PASS — delayed 25 s report body + worker restart reconciles without second Send and returns to `WAITING_FOR_NEXT_ASSISTANT_FORM`.

`browser_proxy_transport_isolation.py`:

- PASS — DIRECT/PROXY explicit queue uses identical target URLs/order; cursor=3 in both.

## Live acceptance boundary

v1.0.32 has not yet been accepted in the user's installed Chrome. The first update/reload against the current manually-sent p1 report is the required live gate for the fixed bug.

## Final-package fresh-extract gate

После формирования release package он распаковывается в новую чистую директорию и проверяется повторно. Финальная verification рядом с ZIP фиксирует SHA-256 exact archive и результаты этого gate.

Минимальный exact-package gate:

- все entries `SHA256SUMS.txt` совпадают;
- production/runtime JavaScript проходит syntax check;
- `node --test tests/*.test.js` проходит полностью;
- Chromium Avito adapter suite проходит;
- Chromium ChatGPT adapter suite проходит;
- delayed-Send live-regression fixture проходит из fresh extract.

Этот gate проверяет именно распакованные байты release, но остаётся offline fixture test, не live website acceptance.
