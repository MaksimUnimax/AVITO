# Avito Finder v1.0.37 — Proxy Recovery Integrity

Дата: 2026-09-13.

База: exact опубликованный v1.0.36 R2, SHA-256 ZIP `c703c9875687d69b2d2ab5e265268cb5fd9ef44d86a95c305a6ae24e4589104c`.

v1.0.37 исправляет доказанные live/audit дефекты proxy recovery telemetry/state contract после Avito IP-block. Это не новая стратегия поиска и не обход CAPTCHA.

## Production scope

От v1.0.36 R2 изменены только:
- `manifest.json` — версия 1.0.37;
- `avito_content.js` — adapter version 1.0.37;
- `service_worker.js` — integrity состояния/diagnostics bounded proxy recovery;
- `popup.js` — корректное отображение transport/target evidence.

Побайтно неизменны `chatgpt_content.js`, `core.js`, `proxy_manager.js`, `recovery.js`, `popup.html`, `popup.css`. Navigation, explicit queue, cursor, child-tab ownership и Writing Block capture не переписывались.

## Исправленные классы дефектов

- producer/consumer используют единые `probe_before/probe_after` и отдельный target status;
- current recovery attempt сохраняется до terminal CAPTCHA report;
- egress-probe ошибки сохраняются в durable diagnostics;
- proxy diagnostic требует Finder-owned exact active-profile PAC, а не только `mode=pac_script`;
- same-profile internal PAC reapply не стирает auth evidence активного profile epoch;
- stale persistent `key_check` не показывается как загруженный API key при пустом session secret;
- попытка >=3 с недоступным provider key/package фиксирует явный endpoint-create skip reason;
- одновременно видимые IP-block + CAPTCHA показываются вместе;
- CAPTCHA manual gate сохраняется через report staging/delivery без обязательного wake-reprobe.

API key по-прежнему session-scoped и на диск этим патчем не сохраняется. CAPTCHA остаётся ручной. DIRECT fallback не добавлен. Случайный failover между сохранёнными профилями не добавлен.

## История и регрессии

Перед правкой прочитаны pre-proxy authority и патчи v1.0.31–v1.0.34, v1.0.24 IP-block recovery и v1.0.36 R2. Не возвращены известные регрессии `about:blank` navigation, blind report resend, ordinary Markdown execution или premature Writing Block ownership.

RED на exact v1.0.36 R2 сохранён отдельно. Новые static и dynamic regressions обязаны быть GREEN на v1.0.37. Старые FAIL-артефакты не переписываются.

## Статус

До проверки конечного ZIP и installed Chrome E2E версия не является доказанно рабочей. Offline/CI PASS не заменяет live acceptance.

Установка выполняется поверх существующей распакованной папки без удаления extension storage. После обновления расширения необходимо обновить вкладки ChatGPT и Avito, чтобы старые content scripts не оставались активны.
