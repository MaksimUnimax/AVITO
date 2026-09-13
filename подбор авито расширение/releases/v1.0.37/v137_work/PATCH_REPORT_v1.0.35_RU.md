# Avito Finder v1.0.35 — patch report

Статус: **LOCAL RED/GREEN PASS / LIVE UNVERIFIED**

## Живой дефект

После локальной validation error Finder снова ждал исполняемый assistant-ответ. Assistant выдал обычный Markdown/code block. Живой журнал показал финальный assistant-turn (`copy-turn-action-button` уже доступен), но `writing_block=false`; capture state machine бесконечно повторял `PROMPT_WAIT_WRITING_BLOCK` и не завершал сценарий.

## Первопричина

В exact v1.0.34 одновременно действовали два контракта:

1. обычный Markdown/code block намеренно не является executable command surface (`zero commands`);
2. `promptTick()` при `!candidate.writing_block` не имел terminal branch даже после доказанной финальности assistant-turn.

Дополнительно validation-error report содержал двусмысленную фразу `Следующая команда может быть обычным текстом`, не разделяя user message и executable assistant response.

Итог: безопасный запрет на исполнение ordinary code block был правильным, но state machine превращал этот правильный запрет в бесконечное ожидание.

## Исправление

- Writing Block остаётся единственной исполняемой assistant-командой.
- Ordinary Markdown/code block по-прежнему даёт **zero Avito commands**.
- Если generic assistant-turn `Копировать ответ` уже подтверждает финальность, но Writing Block отсутствует, Finder после bounded DOM-stability возвращает **один** same-chat report `ASSISTANT_WRITING_BLOCK_REQUIRED` и re-anchor'ится на следующий prompt.
- На Avito при этом не выполняется navigation/mutation.
- Validation-error wording теперь явно говорит: user message может быть обычным текстом; executable assistant response должен быть Writing Block.
- Capture protocol: `0.6.18`.
- Release manifest: `1.0.35-assistant-form-terminal-gate`.

## RED → GREEN

Exact v1.0.34 source:

- command_count = 0
- form_error_count = 0
- regression result = **RED / FAIL**

Patched v1.0.35:

- command_count = 0
- form_error_count = 1
- regression result = **GREEN / PASS**

Это проверяет именно требуемый уровень: ordinary code block остаётся неисполняемым, но бесконечное ожидание заменено terminal same-chat outcome.

## QA

- runtime JS syntax: PASS;
- focused RED→GREEN live-DOM fixture: PASS;
- Writing Block block01 matrix: **12/12 PASS**;
- parser block02: **12/12 PASS**;
- worker payload block03: **8/8 PASS**;
- Node regression: **347/347 PASS**;
- Avito DOM fixture: **16/16 PASS**;
- ChatGPT DOM fixture: **11/11 PASS**, включая `ordinary markdown code block => zero commands + one form error`.

Полный длинный `run_all_v133.py` в текущей инструментальной сессии не завершился целиком из-за общего tool timeout; его первые блоки Node/Avito/Chat прошли. Это не выдаётся за полный installed/live E2E.

## Правила патча

| Rule | PASS/FAIL | Evidence |
| --- | --- | --- |
| Root cause доказан | PASS | exact v1.0.34 code + live journal + RED reproduction |
| Падающий тест до патча есть | PASS | v1.0.34: 0 commands / 0 terminal form errors |
| Проверяется правильный уровень | PASS | generic assistant-turn finality отдельно от Writing Block presence |
| Working baseline не затронут | PASS by scope | Writing Block execution path и Avito/proxy logic не изменены |
| Diff минимален | PASS | ChatGPT capture + Worker format-report + version/test/docs |
| Старые реальные regression-сценарии пройдены | PARTIAL | Node 347/347 + Avito 16/16 + Chat 11/11 + focused matrices; long aggregate timed out |
| Конечный билд перепроверен | PASS locally | ZIP rebuilt after tests; hashes regenerated |
| Installed/live E2E пройден | FAIL / NOT YET | требуется установка в пользовательский Chrome |
| Exact-source rule соблюдён | PASS | patch сделан от owner-supplied v1.0.34 ZIP SHA-256 27e204... |

## НАРУШЕННЫЕ ПРАВИЛА

Предыдущий процесс/код нарушал:

1. **Не допускать бесконечных ожиданий.** Финальный ordinary assistant-turn мог бесконечно оставаться в `PROMPT_WAIT_WRITING_BLOCK`.
2. **Проверять правильный уровень.** Было смешано `assistant-turn завершён` и `Writing Block существует`.
3. **Контракт ChatGPT ↔ Finder является API-контрактом.** Validation report не различал ordinary user message и executable assistant response.
4. **Локальные PASS не заменяют живой сценарий.** Старые тесты проверяли только `zero commands`, но не terminal outcome после неправильной формы.
5. **GitHub обязан хранить последнюю exact release authority.** Репозиторий был оставлен на v1.0.24, хотя пользователю уже выдавались более поздние сборки.

## Release boundary

Версия не называется live-ready, пока тот же ZIP не пройдёт installed Chrome E2E.
