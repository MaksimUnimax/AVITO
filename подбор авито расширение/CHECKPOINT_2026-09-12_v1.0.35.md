# Avito Finder — промежуточный checkpoint v1.0.35

Дата: 2026-09-12
Статус: **PERSISTED INTERMEDIATE STATE / LIVE UNVERIFIED**

Этот файл является recovery-point. Если работа или чат оборвутся, продолжать нужно отсюда, а не с v1.0.24 и не с закрытого backport PR.

## Exact source authority

Owner-supplied source baseline:

- `AVITO_FINDER_v1.0.34_WRITING_BLOCK_BODY_STABILITY_2026-09-12(1).zip`
- SHA-256: `27e2049522663bc3d2925c7bc847ad04304979e166e8428fafaaa91d37085f5d`
- manifest version: `1.0.34`
- version_name: `1.0.34-writing-block-body-stability`

Текущий patched candidate:

- `AVITO_FINDER_v1.0.35_ASSISTANT_FORM_TERMINAL_GATE_2026-09-12.zip`
- SHA-256: `3a1de9f67af1554038193adb9bf6a63f0e7ca5ef7c26690236e2fd57a287abd3`
- manifest version: `1.0.35`
- version_name: `1.0.35-assistant-form-terminal-gate`
- capture protocol: `0.6.18`

## Живой дефект, который закрывает v1.0.35

После локальной validation error Finder снова ждал executable assistant response. Assistant выдал ordinary Markdown/code block. Generic assistant-turn `Копировать ответ` уже подтверждал финальность, но `writing_block=false`. В v1.0.34 state machine мог бесконечно оставаться в `PROMPT_WAIT_WRITING_BLOCK`.

Ключевая граница v1.0.34 сохраняется: ordinary Markdown/code block **не является executable command surface** и должен давать zero Avito commands.

Исправление v1.0.35:

- Writing Block остаётся единственной executable assistant-командой;
- ordinary Markdown/code block остаётся zero-command;
- final ordinary assistant-turn без Writing Block теперь получает один terminal same-chat outcome `ASSISTANT_WRITING_BLOCK_REQUIRED` вместо бесконечного polling;
- Avito navigation/mutation при этом не выполняется;
- validation wording разделяет ordinary user message и executable assistant response.

## RED → GREEN

Exact v1.0.34:

- command_count = 0
- form_error_count = 0
- result = **RED / FAIL**

Patched v1.0.35:

- command_count = 0
- form_error_count = 1
- result = **GREEN / PASS**

## QA, уже выполненная локально

- runtime JS syntax: PASS
- focused RED→GREEN live-DOM fixture: PASS
- Writing Block block01 matrix: **12/12 PASS**
- parser block02: **12/12 PASS**
- worker payload block03: **8/8 PASS**
- Node regression: **347/347 PASS**
- Avito DOM fixture: **16/16 PASS**
- ChatGPT DOM fixture: **11/11 PASS**
- final ZIP rebuilt after tests and SHA regenerated

Ограничение: полный длинный aggregate `run_all_v133.py` в текущей инструментальной сессии не завершился целиком из-за общего tool timeout. Это не считается installed/live E2E.

## Runtime source hashes v1.0.35

- `manifest.json` — `96bcde44b37f1ab7f9d8f386fa66288c6a1dab08be22a48dbd2f3df938f753c3`
- `chatgpt_content.js` — `64eedf07f07fb69ba87d91bc51d49273237e577de770d48a97e2368dd7a39d18`
- `service_worker.js` — `415b2ca3c3c196c059dee33587c2572c5d310c1e44c3404d0859f9707242e88a`
- `avito_content.js` — `6bca275747e08f7e7508111342e0c33bf240762a23d608c89cb4f9f09f946d8f`
- `core.js` — `b00830e8e2971186bf4a725725aa4676e29b09a7e32cc296b7ccf24c5e36ee9b`
- `recovery.js` — `d49558f8decf4396bb5dd770d9c34608770ea14635166972a4fc8273270b936d`
- `popup.js` — `a107c7094dab8b2d8e3f568bdfb5a496db94ccd332457d4d6aff54b7d3b73990`
- `popup.html` — `bff33dcce38ef853f255172826392a4d411937f92b68b8a8e1c013f56305eec3`
- `popup.css` — `0c85a06c77c905b9203df91cecc24c8bd16095b1d44ddd176434a7ba352d6d56`
- `proxy_manager.js` — `c348fed57f0dcc2b97bab972ccfbf9420fee49b6ac89eb479d40ecad8f620e66`

## GitHub state at checkpoint

Main already contains:

- permanent patch rules: `подбор авито расширение/PATCH_ENGINEERING_RULES.md`;
- rule requiring every release to be persisted to GitHub before the next patch;
- workflow `materialize-avito-v1.0.34-authority.yml`;
- workflow `materialize-avito-v1.0.35-authority.yml`.

Main HEAD immediately before this checkpoint: `8a3ad349bda2c3d99a028af4c86d3078f7619370`.

The invalid v1.0.24-based ordinary-response backport PR #1 was closed and MUST NOT be merged.

## Что ещё НЕ завершено

1. Полностью материализовать **exact v1.0.34 authority** в GitHub из owner ZIP.
2. Полностью материализовать **exact v1.0.35 source + installable ZIP + patch report + SHA metadata** в GitHub.
3. Выполнить remote readback и подтвердить hashes/version из GitHub.
4. Обновить `АКТУАЛЬНАЯ_ВЕРСИЯ_РАСШИРЕНИЯ.md` только после materialization/readback.
5. Установить **тот же v1.0.35 ZIP** в пользовательский Chrome.
6. Пройти live E2E: assistant response → capture → validator → Avito action/result → report → тот же chat → следующий prompt.
7. Любой live FAIL = v1.0.35 NOT READY; новый патч запрещён до разбора этого FAIL.

## Patch rules compliance на этой точке

| Rule | Status |
| --- | --- |
| Root cause доказан | PASS |
| RED test на exact v1.0.34 | PASS |
| Проверяется правильный уровень | PASS |
| Working baseline сохранён | PASS by scope |
| Diff минимален | PASS |
| Историческая regression | PARTIAL |
| Final ZIP локально перепроверен | PASS |
| Exact-source rule | PASS locally / GitHub persistence IN PROGRESS |
| Installed/live E2E | FAIL / NOT YET |

## Recovery instruction

Если выполнение оборвалось: **не начинать анализ заново и не возвращаться к v1.0.24**. Сначала прочитать `PATCH_ENGINEERING_RULES.md` и этот checkpoint, затем продолжить с materialization v1.0.34/v1.0.35 в GitHub и remote readback.