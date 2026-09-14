# Avito Finder v1.0.32 — материалы, использованные для исправления

## 1. Live diagnostic log пользователя, 2026-09-12

Источник истины для текущего дефекта. Ключевые события:

- p1 collection `count=30` завершён;
- report staged в primary composer;
- `CAPTURE_REPORT_SEND_BUTTON_MISSING`;
- `REPORT_DELIVERY_BLOCKED`;
- `send_attempted=false`.

Этот источник доказывает место остановки; он не используется для предположений о скрытом DOM ChatGPT.

## 2. Production runtime v1.0.31

Файлы:

- `chatgpt_content.js`;
- `service_worker.js`;
- `core.js`;
- tests `report_delivery_v126`, `report_receipt_v127`, browser composer/receipt suites.

По ним установлен exact control flow, который исключал pre-click state из wake reconciliation.

## 3. Внутренний Avito Finder operator protocol

`AVITO_FINDER_OPERATOR_PROTOCOL_AND_ASSISTANT_PROMPT_v1.0.md` в репозитории `MaksimUnimax/AVITO`.

Использованный контракт:

- отчёт должен возвращаться в тот же ChatGPT conversation;
- расширение не должно повторять опасные/неподтверждённые действия;
- техническая ошибка не должна превращаться в выдуманный результат;
- текущий подтверждённый контекст является источником истины.

## 4. Chrome Extensions — service worker lifecycle

https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

Использовано как основание не хранить delivery truth только в памяти service worker. Report, receipt/budget и anchor живут в storage и восстанавливаются на wake.

## 5. Chrome Extensions — messaging

https://developer.chrome.com/docs/extensions/develop/concepts/messaging

Использовано для разделения:

- irreversible Send action;
- read-only reconciliation message;
- continuation prompt-poll message.

Конкретные 6 секунд / 100 ms — проектное bounded решение Avito Finder, а не требование Chrome docs.

## 6. Regression authorities v1.0.27–v1.0.31

Сохранены предыдущие контракты:

- message receipt lifecycle;
- composer round-trip;
- durable start receipt;
- unified recovery;
- pre-proxy sequential lifecycle restoration.

v1.0.32 изменяет только report-delivery acknowledgement / bounded Send discovery и не отменяет перечисленные safety boundaries.
