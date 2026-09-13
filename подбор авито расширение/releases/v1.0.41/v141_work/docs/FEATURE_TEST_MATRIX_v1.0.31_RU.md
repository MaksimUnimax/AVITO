# Матрица функций и проверок v1.0.31

Конечный перечень поддерживаемых контрактов, а не обещание проверки произвольного текста/всех будущих DOM. «Запрос» означает валидный набор поддерживаемых действий; неизвестные формулировки отвергаются. Параметры тарифов/системы/магазина не угадываются.

Матрица включает 11 типов AVITO_UI действия, 8 diagnostic scopes и проверку runtime-цепочек. Путь каждого теста начинается с `tests/`, если не оговорено иначе. Фактические результаты — `TEST_REPORT_v1.0.31_RU.md` и release verification.

Матрица v1.0.31 сохраняет весь функциональный охват v1.0.29 и добавляет отдельный контракт pre-proxy sequential navigation / proxy isolation.

| № | Функция / граница | Проверки | Покрытие / предел |
|---|---|---|---|
| 01 | Writing Block: полный захват после завершения ответа | core.test.js; browser_chat_fixtures_v125.py; browser_cycle_v127.py | Парсер + Chromium + цикл |
| 02 | Новый старт, восстановление начального и следующего anchor | contract_audit_v129.test.js; v129/browser_popup_lifecycle.py | VM + Chromium |
| 03 | AVITO_UI: 11 типов действий, 2 timing profiles | core.test.js; timing_profiles.test.js; v129/browser_actions.py; v129/browser_queue_cycles.py | Все типы; не все комбинации DOM |
| 04 | CLICK | v129/browser_actions.py | Верхняя доступная цель; запрещённые кнопки; late disable |
| 05 | TYPE | v129/browser_actions.py; contract_audit_v129.test.js | Точное значение, 160-char граница, focus race |
| 06 | COLLECT_MENU / SELECT_OPTION | v129/browser_actions.py | aria-controls, позднее меню, чужое меню, одинаковые варианты |
| 07 | WAIT / WAIT_FOR | v129/browser_actions.py; core.test.js | Ожидание/timeout/предел 5 секунд |
| 08 | SNAPSHOT / COLLECT_LISTING_DETAILS | v129/browser_actions.py | Наблюдение DOM, без действий покупки |
| 09 | COLLECT_LISTINGS | browser_fixtures_v125.py; v129/browser_contracts.py | Порядок, дедуп tracking URL, visible text, пусто/не готово |
| 10 | COLLECT_EXPLICIT_LISTING_QUEUE / RESUME_EXPLICIT_LISTING_QUEUE | v129/browser_queue_cycles.py; contract_audit_v129.test.js | Одна дочерняя вкладка, cursor, batch, resume |
| 11 | Очередь 1–30; отказ при 31; unknown/mixed actions | contract_audit_v129.test.js | Без молчаливого усечения/пропуска шага |
| 12 | INSPECT_FILTERS | core.test.js; browser_fixtures_v125.py; v129/browser_actions.py | Парсер режима и DOM-поведение фильтров |
| 13 | DIAGNOSE_DOM: все 8 scopes | v129/browser_actions.py | PAGE_MAIN_VISIBLE; SEARCH_SURFACE_VISIBLE; SEARCH_INPUT_ANCESTRY_VISIBLE; SEARCH_INPUT_PARENT_VISIBLE; FILTERS_VISIBLE; DIALOG_VISIBLE; LISTING_CARD_VISIBLE; REVIEWS_VISIBLE |
| 14 | OPEN_LOCATION_DIALOG | v129/browser_actions.py; assistant_directed_contract.test.js | Разрешённый локальный диагностический control |
| 15 | Смена p1 → p2 → другой запрос | navigation_intent_v127.test.js; browser_cycle_v127.py | Точный заданный переход не считается ручным |
| 16 | Ручная смена вкладки/URL/диалога | child_tab_handoff.test.js; v129/browser_popup_lifecycle.py; report_delivery_v126.test.js | Пауза; чужие вкладки не закрываются |
| 17 | Сохранение результата до закрытия вкладки | contract_audit_v129.test.js; v129/browser_queue_cycles.py | Ошибка квоты; restart; negative observation |
| 18 | Пауза между карточками и граница текущего пакета | sequential_card_gap_control.test.js; v129/browser_queue_cycles.py | Durable deadline, wake и остановка worker |
| 19 | HTTP 429 / Retry-After | contract_audit_v129.test.js; v129/browser_queue_cycles.py | Секунды/HTTP-date/overflow; DIRECT; 600s > auto budget |
| 20 | IP-block / proxy transport | recovery_behavior_v125.test.js; browser_cycle_v127.py | Сохранённые ограничения повтора; новый читаемый документ |
| 21 | CAPTCHA | traffic_lite_zero_media.test.js; v129/browser_queue_cycles.py | Ручная граница, сохранённый child/cursor, без автоматического решения |
| 22 | Необязательное окно входа | optional_login_recovery.test.js; browser_fixtures_v125.py | Наблюдение; без произвольного авто-закрытия |
| 23 | Классификация служебной страницы | v129/browser_contracts.py | Текст продавца и скрытый DOM не подменяют реальную блокировку |
| 24 | Прямая доставка и её передача в отчёт | v129/browser_contracts.py; contract_audit_v129.test.js; v129/browser_queue_cycles.py | disabled fieldset / ARIA / inert / hidden / bare anchor; JSON/storage/formatter |
| 25 | Отправка отчёта: composer roundtrip | browser_composer_v126.py | 28 сценариев, включая правку пользователя/пустые строки/Unicode |
| 26 | Подтверждение полного отправленного сообщения | browser_receipts_v127.py | 25 вариантов оболочки/свёртывания/позднего DOM |
| 27 | Повторный Send / late result / STOP | report_delivery_v126.test.js; report_receipt_v127.test.js; v129/browser_queue_cycles.py | Ровно одна отправка; после STOP нет продолжения |
| 28 | Большой report на 30 подробных лотов | v129/browser_queue_cycles.py: thirty_detail_large_report | Более 180000 символов; полный receipt без повторного Send |
| 29 | Popup controls / copy / resume / timeout | v129/browser_popup_lifecycle.py | 31 сценарий popup + lifecycle Chat adapter |
| 30 | GET_VIEW и частые storage events | contract_audit_v129.test.js; v129/browser_popup_lifecycle.py | Чтение без побочных действий; single-flight refresh |
| 31 | API key: check/import/export/clear | proxy_key_lifecycle.test.js; proxy_profiles.test.js | VM/runtime tests; не проверка настоящего аккаунта |
| 32 | Proxy profiles: apply/off/delete/restore/sync | proxy_profiles.test.js; proxy_ui_cleanup_persistence.test.js; contract_audit_v129.test.js | Непрозрачные credentials; system proxy precedence; UI routing |
| 33 | Proxy auth 407 / смена профиля | proxy_auth_prompt_fix.test.js; proxy_diagnostics_rotation.test.js | Chrome callback doubles; реальный HTTP CONNECT не проверен |
| 34 | Создание endpoint: обычное и неопределённое | proxy_endpoint_create.test.js; contract_audit_v129.test.js | POST reservation; restart; ручная сверка не делает POST |
| 35 | Traffic / ZERO MEDIA / CAPTCHA exception | proxy_traffic_compat.test.js; proxy_data_saver.test.js; traffic_lite_zero_media.test.js | DNR-rule contract + DOM/queue; не замер живого трафика |
| 36 | Fetch deadlines / лимит body / отмена | recovery_behavior_v125.test.js; contract_audit_v129.test.js | Зависание заголовков/тела; max bytes; discard; consume once |
| 37 | RPC доверие и private-page границы | contract_audit_v129.test.js; v129/browser_actions.py | Неверный sender/iframe/host; popup-only привилегии; private URL |
| 38 | Legacy SEARCH | core.test.js; service_worker.js rejection contract | Не является реализованным режимом: явный отказ и переход к AVITO_UI, не скрытая заглушка успеха |
| 39 | Установленный MV3 | v129/installed_probe.py | ENVIRONMENT_BLOCKED; не засчитывается в functional PASS |
| 40 | Реальные ChatGPT/Avito/Proxy.Market | Отдельный live acceptance | NOT_RUN; запросы к провайдерам не выполнялись |
| 41 | Pre-proxy sequential lifecycle / proxy isolation | sequential_preproxy_lifecycle_v131.test.js; v131/browser_proxy_transport_isolation.py | target URL создаётся напрямую; pending target не redispatch; restart adoption; DIRECT/PROXY одинаковый navigation order; legacy blank только migration |

## Дополнительный v1.0.31 navigation gate

Живой дефект `transient_blank:no_probe` вынесен в отдельную regression authority: `qa/v131/reproduced_v130_transient_blank.json`. Normal v1.0.31 explicit queue не создаёт `about:blank` child; browser-level DIRECT/PROXY comparison подтверждает одинаковые target URL/order.

## Границы эмуляции

- Производственные JS не заменены мини-реализацией «ожидаемого успеха»: в VM загружается service_worker.js, в Chromium — avito_content.js, chatgpt_content.js и popup.js.
- Chrome API/storage/alarms/debugger/ответы Proxy.Market моделируются. В тесте Input RPC pointer/keyboard выполняется Playwright, а не установленный chrome.debugger.
- Восстановление worker моделируется новым VM-контекстом с сохранённым storage. При этом это не процессный тест реально установленного MV3.
- Проверка 429 использует уменьшенный тестовый cooldown, сохраняя абсолютные дедлайны и раздельные fault-tests production значений. Она не обещает точную скорость alarm реального браузера.
- Наблюдения магазинов/цен/доставки синтетические. Ни одного свежего результата настоящего подбора тесты не создают.
- Непрочитанные карточки, неподтверждённая отправка и долгий Retry-After должны давать честное сохранённое ожидание/ошибку, а не искусственный PASS.
