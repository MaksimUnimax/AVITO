# Обязательный порядок работы с Avito Finder

Перед любой работой полностью прочитать:

1. `подбор авито расширение/PATCH_ENGINEERING_RULES.md` — постоянные **20** правил.
2. `подбор авито расширение/ТЕКУЩИЙ_ПРОГРЕСС.md`.
3. Актуальный release authority (`PATCH_REPORT`, `REMOTE_READBACK`, `CHECKPOINT`, `BUILD`, `MATERIALIZATION`, `MAIN_RELEASE_RECEIPT`).
4. Перед **любым следующим runtime-патчем** — последний `PRE_PATCH_FULL_HISTORY_AUDIT_*.md/json`.

## ЖЁСТКИЙ PRE-PATCH GATE — RULE 20

До любого изменения runtime, manifest, release expectations или сборки следующей версии требуется **полный аудит ВСЕХ предыдущих патчей и кода без единого выборочного пропуска**.

Нельзя ограничиваться «ключевыми» версиями. Нужно:

- обнаружить все исторические версии/патчи/ветки/PR/commits;
- для каждой прочитать доступный production-код, diff/patch и тесты;
- пройти adjacent diffs exact-source версий;
- восстановить цель, root cause, changed files/functions, state-machine contract, FAIL и regression каждой версии;
- построить общую evolution matrix для capture/validator, navigation/queue/cursor, report delivery, proxy/auth/rotation/egress, IP-block/rate-limit/CAPTCHA;
- отметить `SOURCE_UNAVAILABLE` там, где exact source отсутствует, и прочитать все доступные commits/diffs/docs/tests;
- сохранить `PRE_PATCH_FULL_HISTORY_AUDIT_<next-version-or-date>.md/json` в GitHub и выполнить readback;
- получить `FULL_HISTORY_AUDIT=PASS`.

**До этого запрещено:** менять runtime JS, `manifest.json`, тестовые expectations под новый runtime, создавать executable patch branch или собирать новый release ZIP.

Выборочный исторический анализ, который применялся раньше, новым требованиям не соответствует. Следующий patch без полного Rule-20 audit автоматически отклоняется.

## Точная текущая точка

Текущая main authority: **Avito Finder v1.0.38 — Avito Sticky Recovery**.

Финальный ZIP:

`подбор авито расширение/releases/v1.0.38/AVITO_FINDER_v1.0.38_AVITO_STICKY_RECOVERY_2026-09-13.zip`

- SHA-256: `2f1282e2262b322ef5f17a3852a388dd5480363b9fa5a60346f3264084d477f4`;
- source files: `146`;
- worktree full QA: `35 PASS / 0 FAIL`;
- Node aggregate: `368 PASS / 0 FAIL`;
- final ZIP fresh-extract QA: `35 PASS / 0 FAIL`;
- independent GitHub remote readback: PASS;
- installed user Chrome acceptance: **NOT_RUN**.

Статус: **MAIN_AUTHORITY / OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED**.

## Почему появился v1.0.38

Установленная v1.0.37 не прошла live acceptance: task `af-20260913040603-4j0t`, очередь TOP_REVALIDATE_PRE `0/3`, сначала `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED`, затем после читаемого read-only DOM новый `RESUME_EXPLICIT_LISTING_QUEUE` снова получил `AVITO_IP_BLOCK`; ни одна карточка не прочитана.

Exact v1.0.37 при recovery escalation создавал Proxy.Market endpoint с `rotation:0` («Каждый запрос») и reconciled только `rotate===0`. Валидный request-body RED на exact v1.0.37 подтверждает actual `0`, expected sticky `-1`. v1.0.38 меняет только recovery-created endpoint policy на sticky `-1` и reconciles только sticky endpoint.

Патч не обещает, что любой Avito IP-block будет снят. Live acceptance остаётся отдельным обязательным gate.

## Production scope v1.0.38

Из runtime относительно exact v1.0.37 изменены только:

- `service_worker.js` — recovery-created endpoint `rotation 0 → -1`, candidate `rotate 0 → -1`;
- `manifest.json` — release identity 1.0.38;
- `avito_content.js` — adapter identity 1.0.38.

Побайтно неизменны:

- `chatgpt_content.js`;
- `core.js`;
- `proxy_manager.js`;
- `recovery.js`;
- `popup.js`;
- `popup.html`;
- `popup.css`.

Не менялись queue/navigation/cursor, report delivery, Writing Block-only contract, manual CAPTCHA boundary, user-selected profile semantics и поиск/ранжирование ПК.

API key Proxy.Market остаётся session-scoped. После extension reload/update `storage.session` может быть очищен, поэтому live recovery может потребовать повторной загрузки ключа. Persistent plaintext key storage не добавлять без отдельной задачи/security review.

## QA authority

Final successful workflow: `34738398529`.

- exact v1.0.37 authority PASS;
- valid RED exact previous version PASS;
- minimal materialization PASS;
- same targeted GREEN PASS;
- worktree full 35/35 PASS;
- Node 368/368 PASS;
- final ZIP fresh extract 35/35 PASS;
- exact source/ZIP/QA persist PASS;
- independent remote readback PASS.

Independent verified commit: `17d8018872f6f1834bf5582ee5210797733a7d0a`.
Readback receipt commit: `b87d493445c106be465f82fb53d9edc3450f80da`.

## Сохранение промежуточного результата

После каждого материального блока сохранять код, тесты, результаты и cursor в GitHub и проверять readback. Не оставлять единственную копию в чате/sandbox. Два CI-процесса не должны одновременно писать в одну release authority.

## Отчёт каждого патча

Показывать применимые правила с `PASS / FAIL / NOT_RUN / BLOCKED` и evidence. Отдельно писать `НАРУШЕННЫЕ ПРАВИЛА`. Исторические нарушения не выдавать за текущие. `NOT_RUN` не означает PASS. Проверять exact final ZIP. Rule 20 должен иметь отдельную строку с ссылкой на полный исторический audit.

## Сохраняемые границы

- Writing Block — единственная исполняемая assistant-команда.
- Ordinary Markdown/code block — zero commands.
- CAPTCHA остаётся ручной.
- Proxy остаётся transport layer.
- Нельзя делать blind resend отчётов или повтор неопределённых Avito mutations.
- Queue/cursor и baseline 150/150 не сбрасывать.
- Долгая доставка Dell сама по себе ranking criteria не меняет.

## История FAIL — не стирать

- v1.0.30: `about:blank` navigation regression → v1.0.31 fix.
- v1.0.35: package version mismatch → rejected.
- v1.0.36 R1: test VM disposal; R2 test-only cleanup.
- v1.0.36 R2: historical popup timeout retained.
- v1.0.37: telemetry/state patch passed offline but failed live Avito acceptance.
- v1.0.38 early harness attempts: brittle grep, bad relative module load, frozen ProxyCore monkeypatch — not counted as valid RED; runtime not accepted from them.
- run `34737917297`: valid RED/GREEN, then aggregate Node exposed two test-only expectations; after test-only correction Node 368/368; final authority is `34738398529`.

## Следующий незакрытый gate

Сначала выполнить Rule 20 и материализовать полный исторический аудит. Только после `FULL_HISTORY_AUDIT=PASS` разрешён любой следующий кодовый patch.

Отдельно для текущего v1.0.38: установить exact ZIP без удаления extension storage, reload extension и вкладки, убедиться в версии 1.0.38, при необходимости заново загрузить Proxy.Market API key в session и повторить **ту же** TOP_REVALIDATE_PRE очередь с cursor `0/3`.

До installed user Chrome E2E v1.0.38 нельзя называть доказанно рабочей на живом Avito.
