# Avito Finder — обязательный startup authority

Перед любой работой полностью прочитать:

1. `подбор авито расширение/PATCH_ENGINEERING_RULES.md` — постоянные **20** правил.
2. `подбор авито расширение/ТЕКУЩИЙ_ПРОГРЕСС.md`.
3. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md` и `.json`.
4. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.md` и `.json` плюс remote readback.
5. `подбор авито расширение/releases/v1.0.40/` — `PATCH_REPORT`, `REMOTE_READBACK`, `CHECKPOINT`, `BUILD`, `MATERIALIZATION`, `MAIN_RELEASE_RECEIPT`.

## Rule 20

`FULL_HISTORY_AUDIT=PASS` для v1.0.40 pre-patch gate. Полная authority v0.1.0–v1.0.38 сохранена без выборки; добавлена вся линия v1.0.39 до installed live FAIL. Перед будущим runtime patch audit должен быть снова расширен до текущего HEAD до executable changes.

## Текущая main authority

**Avito Finder v1.0.40 — Dedicated Requested Tab Allocation**.

ZIP: `подбор авито расширение/releases/v1.0.40/AVITO_FINDER_v1.0.40_DEDICATED_REQUESTED_TAB_ALLOCATION_2026-09-13.zip`.

- SHA-256: `04f9bdc205eaa3578d462005ea15749184c5f7e744bd24a19c43e5a88bc1e017`;
- bytes: `495520`;
- source files: `150`;
- main merge commit: `91cdd5504392a6509e06b559d68d3576e728263e`;
- final workflow: `34747966783`;
- targeted: `5/5 PASS`;
- prior selector contract: `5/5 PASS`;
- worktree: `35/35 PASS`, Node `370/370`;
- final ZIP fresh extract: `35/35 PASS`, Node `370/370`;
- independent remote readback: `PASS`;
- installed Chrome E2E: **NOT_RUN**.

Status: `MAIN_AUTHORITY / OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED`.

GitHub create-PR API при публикации v1.0.40 возвращал repeated 502/timeouts. Релиз введён в main обычным двухродительским merge commit **без force**; merge tree byte-for-byte совпадает с remotely verified branch tree. Не выдумывать PR #6.

## Исправленный offline дефект

Installed v1.0.39 task `af-20260913075253-v24r` завершился `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB` до Avito action при explicit public requested URL. Live evidence не различает zero exact и duplicate exact — не угадывать.

v1.0.40 исправляет first-target allocation: если это первое user-started binding, navigation разрешён, requested URL является valid public Avito URL, а existing Avito tabs неоднозначны, Finder не выбирает и не мутирует их, а создаёт одну dedicated run-owned public tab и маршрутизирует её на requested URL.

Сохранены: unique active/exact/single reuse, zero-tab bootstrap, diagnostic navigation ban, one-target-per-run, queue/cursor, report delivery, proxy/recovery, capture/validator, manual CAPTCHA.

Production runtime changed only `service_worker.js`; `manifest.json` и `avito_content.js` меняют identity.

## История FAIL — не стирать

- v1.0.39 installed live multi-tab acceptance = FAIL.
- v1.0.40 first full run `34747402029` = FAIL `34/35` из-за external adapter_identity deadline 30.003s.
- same-runner A/B `34747859905`: v1.0.39 cold 15.718s, v1.0.40 max ~1.883s; изменён только QA harness deadline 30→45s, production runtime не менялся.
- final run `34747966783` = SUCCESS.

## Сохраняемые границы

- Writing Block — единственная исполняемая assistant-команда; ordinary Markdown/code block = zero commands.
- CAPTCHA ручная.
- Proxy transport-only.
- Blind resend/uncertain mutation запрещены.
- Baseline `150/150` не сбрасывать.
- TOP_REVALIDATE_PRE: Dell `4750223208`, Mini ITX `8156773014`, Lenovo `8375159229`.
- Proxy.Market API key session-scoped.

## Следующий gate

Установить exact main v1.0.40 поверх существующей unpacked extension без очистки storage/baseline, Reload, обновить ChatGPT/Avito, проверить `Версия: 1.0.40` и повторить TOP_REVALIDATE_PRE. До полного installed E2E v1.0.40 остаётся `LIVE_UNVERIFIED`.
