# Avito Finder — обязательный startup authority

Перед любой работой полностью прочитать:

1. `подбор авито расширение/PATCH_ENGINEERING_RULES.md` — постоянные **20** правил.
2. `подбор авито расширение/ТЕКУЩИЙ_ПРОГРЕСС.md`.
3. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md` и `.json`.
4. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.md` и `.json` плюс remote readback.
5. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.41_2026-09-13.md` и `.json` плюс remote readback.
6. `подбор авито расширение/releases/v1.0.41/` — `PATCH_REPORT`, `REMOTE_READBACK`, `CHECKPOINT`, `BUILD`, `MATERIALIZATION`, `MAIN_RELEASE_RECEIPT`, live acceptance state.

## Rule 20

`FULL_HISTORY_AUDIT=PASS` для v1.0.41 pre-patch gate. Полная authority v0.1.0–v1.0.39 сохранена без выборки; добавлена v1.0.40 release authority, её installed IP-firewall FAIL, exact classifier RED и все post-v1.0.40 evidence-only commits. Перед будущим runtime patch audit снова расширить до текущего HEAD **до executable changes**.

## Текущая main authority

**Avito Finder v1.0.41 — IP-block Firewall Classifier Recovery**.

ZIP: `подбор авито расширение/releases/v1.0.41/AVITO_FINDER_v1.0.41_IP_BLOCK_FIREWALL_CLASSIFIER_RECOVERY_2026-09-13.zip`.

- SHA-256: `4658c589802d0a8a641a1f571bb8d55005d5f05423a7e154b7dcc9909842920c`;
- bytes: `498304`;
- source files: `152`;
- PR: `#7`;
- main merge commit: `b259a1959c4ea72b98fc2afd5c7879f357ca3e92`;
- build workflow: `34754942233`;
- targeted firewall/CAPTCHA classifier: `3/3 PASS`;
- worktree: `35/35 PASS`, Node `373/373`;
- final ZIP fresh extract: `35/35 PASS`, Node `373/373`;
- independent remote readback: `PASS`;
- installed owner Chrome E2E: **NOT_RUN**.

Status: `MAIN_AUTHORITY / OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED`.

## Live FAIL v1.0.40 — не переписывать как CAPTCHA

Installed v1.0.40 task `af-20260913103028-k9qv` дошёл до Dell URL и реально показал provider page `Доступ ограничен: проблема с IP`. На экране **не было CAPTCHA challenge**; helper text только упоминал, что кнопка `Продолжить` ведёт к будущему решению CAPTCHA.

Старый classifier выставлял одновременно `ip_block=true` и `captcha=true` из-за широкого `/captcha|капч/`, после чего CAPTCHA-first `detectBlock()` возвращал `BLOCKED_LOGIN_OR_CAPTCHA`. В результате исторический `AVITO_IP_BLOCK -> bounded recovery -> bypass-cache reload -> retry` не запускался, и страница не обновлялась.

Это installed live FAIL v1.0.40. Старые evidence записи, называвшие этот экран CAPTCHA, сохранены исторически, но **суперседированы** новым causal evidence.

## v1.0.41 correction

Поведенчески изменён только `core.js`:

- точный IP-firewall heading является сильным `ip_block` evidence;
- текстовая ссылка на **будущую** CAPTCHA больше не считается фактическим CAPTCHA challenge;
- generic rate-limit explanation на IP landing не перебивает `ip_block`;
- concrete CAPTCHA evidence — iframe/canvas/slider/Geetest structure или явная human/robot verification — остаётся manual даже при IP heading.

`service_worker.js` и `proxy_manager.js` **byte-identical v1.0.40**. Сам recovery/reload не переписывался; v1.0.41 возвращает страницу в уже существующую рабочую IP-block ветку. `manifest.json` и `avito_content.js` меняют release identity.

## RED / FAIL history — не стирать

- v1.0.39 installed multi-tab acceptance = FAIL.
- v1.0.40 allocation fix прошёл дальше старой ambiguity, но installed IP-firewall scenario = **FAIL** из-за classifier misroute.
- первый v1.0.41 RED workflow `34754784589` = FAIL из-за **test-harness** `ReferenceError: location is not defined`; это не causal RED и не скрывается.
- corrected exact-v1.0.40 RED = `RED_CONFIRMED` по живому firewall fixture.
- refined RED workflow `34754854251` = PASS как gate, подтверждающий ожидаемый old-source failure и CAPTCHA preservation fixtures.
- v1.0.41 build workflow `34754942233` = SUCCESS, включая final ZIP + independent remote readback.

## Сохраняемые границы

- Writing Block — единственная исполняемая assistant-команда; ordinary Markdown/code block = zero commands.
- Настоящая CAPTCHA — ручная.
- IP firewall — не CAPTCHA только потому, что helper text содержит слово `капчи`.
- Proxy transport-only.
- Blind resend/uncertain mutation запрещены.
- Baseline `150/150` не сбрасывать.
- TOP_REVALIDATE_PRE: Dell `4750223208`, Mini ITX `8156773014`, Lenovo `8375159229`.
- Proxy.Market API key session-scoped.

## Следующий gate

Установить exact main v1.0.41 поверх существующей unpacked extension **без удаления extension и без очистки storage/baseline**, Reload, обновить ChatGPT/Avito, проверить `Версия: 1.0.41` и повторить текущий Dell/TOP_REVALIDATE_PRE сценарий.

На странице `Доступ ограничен: проблема с IP` ожидаем `AVITO_IP_BLOCK` и запуск существующего bounded recovery/reload. Только если после recovery реально появится CAPTCHA challenge, Finder должен остановиться для ручного решения.

До успешного installed E2E v1.0.41 остаётся `LIVE_UNVERIFIED`.
