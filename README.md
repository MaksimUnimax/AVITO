# AVITO / Avito Finder

Репозиторий расширения Avito Finder и WORK-only подбора ПК. Актуализация: 2026-09-12.

## Сначала читать

`AGENTS.md` → `подбор авито расширение/PATCH_ENGINEERING_RULES.md` → `подбор авито расширение/ТЕКУЩИЙ_ПРОГРЕСС.md` → `подбор авито расширение/releases/v1.0.36-r2/DELIVERY_CHECKPOINT.md`.

## Текущая сборка для приёмки

**Avito Finder v1.0.36 R2**, статус **OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED**.

Каталог: `подбор авито расширение/releases/v1.0.36-r2/`.

ZIP: `AVITO_FINDER_v1.0.36_PACKAGED_ADAPTER_CONSISTENCY_R2_2026-09-12.zip`.

SHA-256: `c703c9875687d69b2d2ab5e265268cb5fd9ef44d86a95c305a6ae24e4589104c`.

Рядом: `v136_work/` (141 файл), `BUILD_v1.0.36.json`, `PATCH_REPORT_v1.0.36_R2_RU.md`, `DELIVERY_RECEIPT.json`, `DELIVERY_CHECKPOINT.md` и полные QA-доказательства. CI 34696794119: полный неизменённый final-ZIP runner 35 PASS / 0 FAIL, три дополнительных popup-повтора, полный переход от ошибки формата к двум командам, независимый checkout и побайтная проверка.

Пользовательский Chrome E2E не выполнен. Это не утверждение о гарантированной стабильности. Предыдущий CI R2 с popup timeout сохранён отдельно; его причина не установлена.

## История и протокол

v134, отклонённая v135 и первый кандидат v136 сохранены отдельно и не переписаны. Старые `AVITO_FINDER_ASSISTANT_PLAYBOOK_v1.0.6.md` и `AVITO_FINDER_OPERATOR_PROTOCOL_AND_ASSISTANT_PROMPT_v1.0.md` остаются историческими операторскими материалами. Грамматику и executable surface сверять с текущим exact source; старые команды не переносить автоматически.

Текущая граница: только Writing Block является исполняемой assistant-командой; обычный Markdown/code block не исполняется. Фильтры поиска должны быть применены и проверены до сбора объявлений. CAPTCHA не обходить. Каждый патч сопровождается правилами, результатами, сохранённым ZIP, хешами и remote readback.
