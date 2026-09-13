# Обязательный порядок работы с Avito Finder

Перед любой работой полностью прочитать:

1. `подбор авито расширение/PATCH_ENGINEERING_RULES.md` — постоянные 19 правил.
2. `подбор авито расширение/ТЕКУЩИЙ_ПРОГРЕСС.md`.
3. `подбор авито расширение/releases/v1.0.37/PATCH_REPORT_v1.0.37_RU.md`.
4. `подбор авито расширение/releases/v1.0.37/REMOTE_READBACK.json`, `CHECKPOINT.json`, `BUILD_v1.0.37.json` и `PRE_PATCH_HISTORY_REVIEW.md`.
5. Для исторической базы — `releases/v1.0.36-r2/DELIVERY_CHECKPOINT.md` и документы v1.0.31–v1.0.34 внутри release source.

## Точная текущая точка

Текущий кандидат: **Avito Finder v1.0.37 — Proxy Recovery Integrity**.

Финальный ZIP:

`подбор авито расширение/releases/v1.0.37/AVITO_FINDER_v1.0.37_PROXY_RECOVERY_INTEGRITY_2026-09-13.zip`

- bytes: `488986`;
- SHA-256: `4eaf64038ffd6c5b08ed7d97fdb0d13848edd8a7a9db04ad928f74b1f371ac9d`;
- source files: `144`;
- worktree full QA: `35 PASS / 0 FAIL`;
- final ZIP fresh-extract QA: `35 PASS / 0 FAIL`;
- independent GitHub remote readback: PASS;
- installed user Chrome acceptance: **NOT_RUN**.

Статус: **OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED**.

Следующий незакрытый этап — установить exact ZIP без очистки extension storage, обновить extension и вкладки ChatGPT/Avito, затем повторить живой proxy diagnostic → TOP_REVALIDATE_PRE. Никакой offline/CI PASS не заменяет этот gate.

## Что v1.0.37 меняет и что не меняет

Production diff от exact v1.0.36 R2 ограничен:

- `manifest.json`;
- `avito_content.js`;
- `service_worker.js`;
- `popup.js`.

Побайтно неизменны `chatgpt_content.js`, `core.js`, `proxy_manager.js`, `recovery.js`, `popup.html`, `popup.css`.

Исправляются доказанные proxy-recovery telemetry/state defects: exact PAC ownership/match, единый probe contract, current attempt receipt до CAPTCHA, durable probe errors, same-profile auth evidence, mixed IP-block+CAPTCHA display, manual gate transfer и explicit endpoint-create skip reason.

Не изменены queue/navigation/cursor, pre-proxy exact-target lifecycle, Writing Block-only execution, ordinary Markdown zero-command contract, manual CAPTCHA boundary и поиск/ранжирование ПК.

## Сохранение промежуточного результата

После каждого материального блока сохранять код, тесты, результаты и точный cursor в GitHub и проверять чтением обратно. Не оставлять единственную копию в чате или sandbox. Для длительного QA каждый процесс должен оставлять отдельный результат/checkpoint. Два CI-процесса не должны одновременно писать в одну release authority.

## Отчёт каждого патча

Показывать применимые правила с `PASS / FAIL / NOT_RUN / BLOCKED` и доказательством. Отдельно писать `НАРУШЕННЫЕ ПРАВИЛА`. Исторические нарушения не выдавать за совершённые текущим patch; `NOT_RUN` не означает PASS. Проверяется конечный ZIP, а не похожая рабочая папка.

## Сохраняемые границы

- Writing Block — единственная исполняемая assistant-команда.
- Ordinary Markdown/code block — zero commands.
- CAPTCHA остаётся ручной; автоматическое решение/обход запрещены.
- Proxy остаётся transport layer и не владеет target URL, queue/cursor или child-tab lifecycle.
- Нельзя делать blind resend отчётов или повтор неопределённых Avito mutations.
- Baseline поиска 150/150 не сбрасывать.
- Долгая доставка Dell сама по себе не является критерием исключения из TOP.

## История FAIL — не стирать

- v1.0.30: `about:blank` navigation regression; исправлено архитектурно в v1.0.31.
- v1.0.35: manifest 1.0.35 / adapter PING 1.0.34; отклонена.
- v1.0.36 R1: test VM disposal failure; R2 исправляет test cleanup, runtime R1/R2 одинаков.
- первый CI v1.0.36 R2: 34/35, popup timeout; последующие отдельные PASS не стирают FAIL.
- v1.0.37 CI workflow v1: harness ошибочно перезаписывал GREEN regression-файлы RED-bootstrap версиями; runtime не был причиной.
- v1.0.37 CI v2 attempt 1: 34/35 из-за `popup_lifecycle` deadline 30.003 s. A/B run `34735768930`: v1.0.36 R2 — 4×31/31; v1.0.37 — 4×31/31 на одном runner и том же 30s limit. Runtime не менялся; attempt 2 прошёл полный gate и remote readback.

До installed user Chrome E2E v1.0.37 нельзя называть доказанно рабочей в реальном Avito-сценарии.
