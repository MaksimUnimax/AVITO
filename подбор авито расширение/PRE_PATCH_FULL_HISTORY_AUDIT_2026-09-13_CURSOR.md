# PRE-PATCH FULL HISTORY AUDIT — CURSOR

Дата старта: 2026-09-13
Статус: **IN_PROGRESS / RUNTIME_PATCH_BLOCKED / FULL_HISTORY_AUDIT_NOT_YET_PASS**
Authority rule: `PATCH_ENGINEERING_RULES.md`, Rule 20.

## Жёсткая граница

До `FULL_HISTORY_AUDIT=PASS` запрещены:

- любые runtime JS изменения;
- изменение `manifest.json` под новую версию;
- изменение test expectations под новый runtime;
- создание executable patch branch;
- сборка нового release ZIP.

Текущая main authority остаётся v1.0.38. Этот audit не является патчем.

## Почему Rule 20 понадобился

Предыдущие патчи использовали выборочный исторический анализ «ключевых» версий. Это оказалось недостаточно.

Уже на первом проходе полного code-history обнаружено:

- exact v1.0.23 `service_worker.js` уже содержит recovery endpoint creation с `rotation: 0`;
- exact v1.0.24 сохраняет тот же `rotation: 0` и reconciliation только кандидата `rotation_settings.rotate === 0`;
- следовательно policy, которую v1.0.38 исправил на sticky `rotation=-1`, **не была новой ошибкой v1.0.37**; она существовала минимум с v1.0.23 и была сохранена в v1.0.24;
- прошлый pre-v1.0.38 анализ доказал проблему на exact v1.0.37, но не проследил происхождение policy по всей истории — это нарушение нового Rule 20 и объяснение, почему дефект не был замечен раньше.

## Подтверждённые источники на текущем cursor

### Историческая pre-proxy authority

- v1.0.7 — документированная последняя pre-proxy navigation authority; архивный SHA-256 `6f2e83a2c15faaf8aca5114f891bd0da973a33e1e03b19ab552cd992382984a7`; 55/55 historical QA.
- exact распакованный v1.0.7 runtime в текущем main **не найден**. Статус пока: `SOURCE_UNAVAILABLE_IN_CURRENT_TREE`; требуется пройти commits/архивы/документы и проверить File/Git history прежде чем считать это окончательной границей.
- v1.0.8 — документированная первая Proxy.Market версия. Exact source пока не найден, статус `DISCOVERY_REQUIRED`.

Источник: `releases/v1.0.38/v138_work/docs/PRE_PROXY_COMPARISON_v1.0.31_RU.md`.

### Exact source обнаружен

- v1.0.23 — `подбор авито расширение/extension_v1.0.23/` + runtime archive;
- v1.0.24 — `подбор авито расширение/extension_v1.0.24/` + runtime archive;
- v1.0.34 — exact ZIP в main; source authority требует отдельной инвентаризации;
- v1.0.35 — exact persisted authority/ZIP/source существует по release history; требуется каталогизация;
- v1.0.36 R2 — `releases/v1.0.36-r2/`;
- v1.0.37 — `releases/v1.0.37/`;
- v1.0.38 — `releases/v1.0.38/`.

### Release directories в `main`

`releases/` содержит exact release authorities:

- `v1.0.36-r2`
- `v1.0.37`
- `v1.0.38`

### Commit-history discovery

Commit search уже выявил более раннюю историю минимум с v1.0.6 materialization, затем v1.0.23/v1.0.24 и последующие release workflows. Полный commit inventory ещё не завершён.

## Первый обнаруженный исторический regression/policy defect

### v1.0.23 exact code

`service_worker.js` в recovery endpoint creation:

- provider create body: `rotation: 0`;
- event `PROXY_RECOVERY_ENDPOINT_CREATE_REQUESTED` также фиксирует `rotation: 0`;
- созданный candidate выбирается как `rotation_settings.rotate === 0`;
- созданный endpoint сохраняется как recovery profile с `rotation: 0`.

### v1.0.24 exact code

Та же policy сохранена:

- `createProxyInPackage(... rotation: 0)`;
- reconciliation `rotation_settings.rotate === 0`;
- `PROXY_RECOVERY_ENDPOINT_CREATED ... rotation: 0`.

Следовательно defect lineage сейчас доказан как минимум:

`v1.0.23 → v1.0.24 → ... → v1.0.37`

До завершения adjacent-code audit нельзя утверждать, в какой **самой первой** версии он был введён. Следующая задача аудита — найти источник между первой proxy-версией v1.0.8 и exact v1.0.23.

## Что ещё обязательно пройти до PASS

1. Инвентаризировать версии v1.0.6, v1.0.7, v1.0.8–v1.0.22, v1.0.23–v1.0.38 и любые R/hotfix/rework варианты.
2. Для каждой версии найти exact source либо присвоить `SOURCE_UNAVAILABLE` только после исчерпывающего поиска Git/архивов/docs.
3. Прочитать production code, tests, patch/diff и release/audit docs каждой версии.
4. Построить adjacent diff для каждой пары, где exact source доступен.
5. Восстановить evolution matrix:
   - ChatGPT capture/validator;
   - navigation/owned-child;
   - explicit queue/cursor;
   - report delivery/reconciliation;
   - proxy config/auth/PAC;
   - rotation/egress/provider endpoint creation;
   - IP-block/rate-limit/CAPTCHA recovery.
6. Найти все реальные дефекты, которые были исправлены, но не закреплены permanent regression tests.
7. Отдельно проверить lineage `rotation=0`: первая версия появления, почему была выбрана policy, какие тесты её закрепляли и почему тесты не различали stable browser session от per-request rotation.
8. Сохранить финальные `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md` и `.json`, выполнить GitHub readback и только тогда выставить `FULL_HISTORY_AUDIT=PASS`.

## Текущий вывод

**Новый runtime patch запрещён.**

Главная уже доказанная процессная ошибка прошлых проходов: исторический анализ был выборочным. Из-за этого старый `rotation=0` был воспринят как проблема текущей v1.0.37 recovery policy, хотя exact код показывает, что эта policy существовала минимум с v1.0.23 и была сохранена в v1.0.24.
