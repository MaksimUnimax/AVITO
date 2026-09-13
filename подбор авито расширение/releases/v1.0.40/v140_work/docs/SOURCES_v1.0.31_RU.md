# Avito Finder v1.0.31 — материалы и источники

Дата: 2026-09-12

Ниже перечислены материалы, на которых основаны аудит, исправление и тесты. Они разделены на **authority проекта** и **внешнюю техническую документацию**.

## A. Authority проекта / исторические релизы

### A1. `AVITO_FINDER_v1.0.7_PAGE_READY_FIX.md`

Последний документированный pre-proxy navigation/readiness release.

Использовано для восстановления контракта:

- dual readiness gate;
- navigation commit guard;
- sequential detail readiness;
- explicit queue;
- manual CAPTCHA;
- bounded polling.

Контрольная сумма release ZIP из архивной authority:
`6f2e83a2c15faaf8aca5114f891bd0da973a33e1e03b19ab552cd992382984a7`.

### A2. `AVITO_FINDER_v1.0.7_TEST_REPORT.md`

Исторический regression authority: `55 PASS / 0 FAIL / 0 skipped` и отдельная проверка sequential readiness.

### A3. `AVITO_FINDER_v1.0.8_MANUAL_PROXY_PROFILES_2026-09-06.md`

Первый Proxy.Market release. Критическая authority-фраза: v1.0.8 должна была сохранить page-ready fallback, sequential detail readiness и explicit listing queue от v1.0.7. Provider network access должен был быть изолирован в `proxy_manager.js`.

### A4. `AVITO_FINDER_v1.0.8_TEST_REPORT.md`

Подтверждает regression-preservation explicit queue / sequential detail / CAPTCHA при первом добавлении proxy.

### A5. Canonical GitHub v1.0.6 commit

https://github.com/MaksimUnimax/AVITO/commit/7c094852bbdefdd9bbec2d7facc618993d61d63a

Использовано для проверки pre-proxy lineage и канонической сборки до v1.0.7.

### A6. Current exact v1.0.30 source

Локальная fresh extraction исходного ZIP v1.0.30. Использована для точного воспроизведения дефекта `about:blank + pendingUrl` и runtime diff.

## B. Chrome / Web platform authority

### B1. Chrome Tabs API
https://developer.chrome.com/docs/extensions/reference/api/tabs

Что использовано:

- `tabs.create({url})` задаёт initial URL новой вкладки;
- `openerTabId` связывает owned child с parent;
- `Tab.pendingUrl` — URL незавершённой навигации до commit;
- `Tab.url` — последний committed URL.

Следствие: `pendingUrl` нельзя интерпретировать как причину не запускать target navigation, если сам create был выполнен на `about:blank`; а при `pendingUrl=target` нельзя слепо отправлять target второй раз.

### B2. Chrome Extension Service Worker Lifecycle
https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

Что использовано:

- worker может завершиться после бездействия;
- global variables теряются;
- состояние операции нужно хранить вне globals.

Следствие: target intent сохраняется **до** `tabs.create`; после wake можно reconcile owned tab без повторного side effect.

### B3. chrome.storage
https://developer.chrome.com/docs/extensions/reference/api/storage

Что использовано:
- durable JSON state для cursor, in-flight navigation intent/receipt и recovery checkpoint.

### B4. chrome.alarms
https://developer.chrome.com/docs/extensions/reference/api/alarms

Что использовано:
- wake-up для bounded delayed/recovery continuation вместо предположения, что worker/timer живёт бесконечно;
- alarm всё равно сверяется с durable state после wake.

### B5. chrome.proxy
https://developer.chrome.com/docs/extensions/reference/api/proxy

Что использовано:
- proxy API управляет Chrome `ProxyConfig`/PAC routing;
- `pac_script` определяет сетевой маршрут URL.

Следствие архитектуры v1.0.31: proxy — transport layer; explicit queue остаётся владельцем target URL/tab lifecycle.

### B6. chrome.webRequest
https://developer.chrome.com/docs/extensions/reference/api/webRequest

Что использовано:
- bounded proxy authentication handling и network evidence;
- network event не заменяет navigation intent/cursor ownership.

### B7. declarativeNetRequest
https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest

Что использовано:
- zero-media/traffic-lite — сетевое правило, не владелец child-tab navigation.

## C. HTTP/retry authority, сохранённая из v1.0.28/v1.0.29

### C1. RFC 6585 §4 — 429 Too Many Requests
https://datatracker.ietf.org/doc/html/rfc6585#section-4

### C2. RFC 9110 §10.2.3 — Retry-After
https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3

Используются для bounded 429 backoff. В v1.0.31 эта логика сохранена, но не владеет нормальным target navigation.

## D. Test methodology

### D1. Chrome: Test service worker termination with Puppeteer
https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer

Использовано как основание специально тестировать restart/termination windows.

### D2. Playwright Chrome extensions
https://playwright.dev/docs/chrome-extensions

Использовано как reference для границы installed-extension tests. В текущем окружении installation blocked managed policy, поэтому Chromium DOM harness не выдаётся за установленный live MV3.

## E. Provider authority

### E1. Proxy.Market public API docs
https://api.dashboard.proxy.market/docs

Использовано только для provider configuration/auth/profile semantics. Provider docs **не определяют tab/navigation lifecycle** и поэтому не должны проникать в explicit queue state machine.
