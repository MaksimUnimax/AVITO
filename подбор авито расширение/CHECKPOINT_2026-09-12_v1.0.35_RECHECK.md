# Checkpoint — повторная проверка и публикация exact архивов

Дата: 2026-09-12.

## Факты текущего продолжения

- Перед работой прочитан live main: `8f2be0699972811b6f03f94f732289852baa2ed8`.
- Прочитаны `PATCH_ENGINEERING_RULES.md` и `CHECKPOINT_2026-09-12_v1.0.35.md`.
- Оба архива физически доступны и CRC проверены.
- v1.0.34: 495534 bytes; SHA-256 `27e2049522663bc3d2925c7bc847ad04304979e166e8428fafaaa91d37085f5d`.
- v1.0.35: 511868 bytes; SHA-256 `3a1de9f67af1554038193adb9bf6a63f0e7ca5ef7c26690236e2fd57a287abd3`.
- ZIP v1.0.34 содержит 131 файл, ZIP v1.0.35 — 136 файлов, не считая каталогов.
- Exact архивы не изменяются и не заменяются новой сборкой под тем же номером.

## Новое доказанное препятствие приёмке v1.0.35

Повторно запущен `tests/run_all_v133.py` из распакованного конечного ZIP v1.0.35, а не из предположительной рабочей папки.

Первые результаты: Node PASS, Avito DOM PASS, ChatGPT DOM PASS, start receipt PASS, receipts PASS. Группа composer_01_15 превысила свой 45-секундный лимит. Полные циклы full_three_page_folded_cycle и assistant_first_start_then_three_pages завершились FAIL с `AVITO_ADAPTER_VERSION_MISMATCH_RELOAD_REQUIRED`.

Проверка exact исходников:

- `manifest.json`: version `1.0.35`;
- `avito_content.js`: `const ADAPTER_VERSION = "1.0.34"`;
- `service_worker.js`: после `AF_AVITO_PING` требует `ping.version === chrome.runtime.getManifest().version`.

Следовательно, в самом конечном ZIP расходятся версии Worker/manifest и Avito DOM adapter. Это не проблема прокси и не ошибка пользователя. Сборка v1.0.35 НЕ ПРИНЯТА. Локальные 347 unit PASS не доказывают прохождение межкомпонентного цикла.

Полный агрегат ещё выполняется; окончательный результат будет сохранён отдельно. Нельзя переносить исторические PASS из вложенной папки qa/v134 на текущую сборку.

## Публикация

GitHub пока содержит правила, отчёты и materializer workflows; наличие workflow не означает наличие архивов или source tree. Blob SHA обоих ZIP проверены через GitHub Git API: архивные blobs отсутствуют.

Подготовлен локальный lossless-пакет с исходными файлами и точной ZIP-структурой. Локальный материализатор восстановил оба ZIP побайтно: оба SHA-256 совпали с исходными. Это проверка транспортной упаковки, не runtime QA.

Пакет: 300976 bytes, SHA-256 `bf89642eb4120fbebd70b45432ea0c6939591f0eb25527f352ae32d1b7a8ba07`; 26 Base64-частей. Части ещё НЕ опубликованы на момент этой записи.

Прямой `git clone` из текущей среды не состоялся: `Could not resolve host: github.com`. Успешные GitHub read/write выполняются через подключённый GitHub connector. Browser Connector проверен: `Browser not connected`; установленный пользовательский Chrome E2E не выполнялся.

## Продолжать отсюда

1. Завершить сохранение exact v1.0.34/v1.0.35 и проверку remote hash; не выдавать материализатор или checkpoint за публикацию самих архивов.
2. Сохранить полный фактический результат повторной QA, включая FAIL.
3. Зафиксировать отдельным regression test несовпадение adapter/manifest в v1.0.35. Не ослаблять защиту version mismatch.
4. Только после восстановления Git source authority делать минимальное исправление этой причины в новой версии, сохраняя ordinary Markdown = zero commands и Writing Block contract.
5. Повторить межкомпонентный цикл, final ZIP retest и установленный Chrome E2E.

## Правила

Выявлены нарушения предыдущей v1.0.35: не закрыта полная регрессия (правило 10), финальный артефакт не доказан полным сценарием (11–12), Git-публикация не завершена до нового патча (19). Сейчас установлен статус FAIL/NOT READY, исходные bytes сохранены; никаких заявлений LIVE PASS нет.
