# Avito Finder v1.0.31 — финальный QA report

Дата: 2026-09-12

## Scope

Проверяется финальный runtime v1.0.31 после восстановления pre-proxy sequential navigation contract.

Среда:

- production JS выполняется без переписывания логики тестом;
- background service worker — Node VM с Chrome API doubles;
- Avito / ChatGPT / popup DOM adapters — реальный headless Chromium на synthetic pages;
- никаких live Avito / ChatGPT / Proxy.Market business/provider calls;
- installed unpacked MV3 отдельно пробуется обычным способом, без обхода policy.

## 1. Reproduction старого дефекта

Неизменённый v1.0.30 при Chrome-create result:

```text
url=about:blank
pendingUrl=about:blank
status=loading
```

даёт:

```text
target_dispatch_count_after_create=0
```

Evidence:
`qa/v131/reproduced_v130_transient_blank.json`.

## 2. Node regression

Полный suite:

```text
node --test --test-concurrency=1 tests/*.test.js
```

Результат:

```text
342 tests
342 PASS
0 FAIL
0 skipped
0 cancelled
```

Новый `sequential_preproxy_lifecycle_v131.test.js` проверяет:

1. direct target child creation без `about:blank`;
2. `pendingUrl=target` как navigation-in-progress без duplicate dispatch;
3. target DOM `interactive` при tab `loading`;
4. crash after create/before id persist → exact-target adoption;
5. две owned target tabs → safe ambiguity;
6. legacy owned blank checkpoint → one-time migration;
7. DIRECT/PROXY одинаковый target navigation lifecycle;
8. normal explicit queue branch не содержит `tabsCreate({url:'about:blank'})`.

## 3. Browser DOM/UI matrix

Прошло:

- Avito DOM fixtures: **16/16**;
- ChatGPT Writing Block/capture: **9/9**;
- rich composer cases 1–15: **15/15**;
- rich composer cases 16–28: **13/13**;
- sent-message receipt: **25/25**;
- DOM contracts: **27/27**;
- popup lifecycle: **31/31**;
- visible actions/scopes: **32/32**.

Итого отдельных Chromium DOM/UI assertions: **168/168 PASS**.

## 4. End-to-end synthetic cycles

### General search/report lifecycle — 6/6 PASS

- `full_three_page_folded_cycle` — 3×30;
- `assistant_first_start_then_three_pages` — 3×30;
- `ip_block_recovery_then_three_pages` — recovery + 3×30;
- `rate_limit_recovery_then_three_pages` — backoff/recovery + 3×30;
- `late_body_then_worker_restart_reconcile` — no duplicate Send;
- `captcha_manual_boundary` — no automatic CAPTCHA bypass.

### Explicit detail queue — 7/7 PASS

- six details / two batches;
- rate-limit mid-queue + worker restart;
- manual CAPTCHA resume in same child;
- restart during persisted gap;
- STOP during late detail response;
- removed listing as negative observation;
- 30 detail cards + large report.

Последний сценарий подтвердил report длиной **233,804 characters**, cursor 30, один report Send и отсутствие duplicate Send.

### Proxy/direct navigation isolation — 1/1 PASS

Одинаковая explicit queue из трёх target URLs прогнана отдельно в runtime `DIRECT` и `PROXY`.

В обоих режимах:

- target URL order идентичен;
- child ids создаются последовательно;
- `about:blank` navigation отсутствует;
- cursor=3;
- report count=1;
- send clicks including start=2.

Важно: proxy network здесь simulated. Это проверка **изоляции navigation lifecycle от transport mode**, а не живого провайдера.

Итого synthetic end-to-end chains: **14/14 PASS**.

## 5. Installed-extension probe

Обычная попытка загрузить unpacked MV3 выполнена без изменения браузерных policy.

Среда сообщила:

```json
{
  "ExtensionInstallBlocklist": ["*"],
  "URLBlocklist": ["*"],
  "service_worker_observed": false,
  "status": "ENVIRONMENT_BLOCKED"
}
```

Это **не PASS и не FAIL продукта**; это невозможность installed-live acceptance в данной среде.

## 6. Final-package verification gate

После финальной упаковки ZIP обязательны повторно:

- SHA-256 каждого файла;
- manifest/version;
- syntax всех 7 runtime JS;
- 342/342 Node;
- sequential pre-proxy focused suite;
- start receipt;
- one 3×30 cycle;
- rate-limit detail queue restart;
- CAPTCHA detail queue resume;
- 30-detail large report;
- DIRECT/PROXY navigation-isolation.

Точный итог этого fresh-extract gate фиксируется в `AVITO_FINDER_v1.0.31_RELEASE_VERIFICATION.json` рядом с ZIP.

## 7. Acceptance boundary

Автоматический QA доказывает поведение production logic при моделируемых Chrome/network/DOM состояниях. Он не доказывает, что текущий live Avito или Proxy.Market не изменились. Финальный live gate — новый запуск в пользовательском Chrome после установки v1.0.31.
