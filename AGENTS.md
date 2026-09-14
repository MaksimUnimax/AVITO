# Avito Finder — обязательный startup authority

Перед любой работой полностью прочитать:

1. `подбор авито расширение/PATCH_ENGINEERING_RULES.md` — постоянные **20** правил.
2. `подбор авито расширение/ТЕКУЩИЙ_ПРОГРЕСС.md`.
3. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md` и `.json`.
4. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.md/json` + remote readback.
5. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.41_2026-09-13.md/json` + remote readback.
6. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.42_2026-09-13.md/json` + remote readback.
7. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.43_2026-09-14.md/json` + `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.43_REMOTE_READBACK_2026-09-14.json`.
8. `подбор авито расширение/PATCH_REPORT_v1.0.43_RU.md`.
9. `подбор авито расширение/releases/v1.0.43/` — exact ZIP/source, `BUILD_v1.0.43.json`, `REMOTE_READBACK.json`, live gate/checkpoint/receipts.

## Rule 20

Для v1.0.43 выполнен `FULL_HISTORY_AUDIT=PASS` **до executable change**. Composite authority наследует без сужения полный исторический охват: 61 архивный вариант, 56 unique pre-1.0 versions, 60 exact historical runtime manifests, 54 unambiguous adjacent runtime diffs и critical state-machine / defect→regression ledger. Перед следующим executable recovery-behavior patch Rule20 снова расширить до текущего HEAD.

## Текущая main authority

**Avito Finder v1.0.43 — IP Recovery Evidence Preservation.**

ZIP:

`подбор авито расширение/releases/v1.0.43/AVITO_FINDER_v1.0.43_IP_RECOVERY_EVIDENCE_PRESERVATION_2026-09-14.zip`

- SHA-256: `593d31edfb136c68a50e4aa45a157c1e3d296f3beb395e0444c5b4de4c4aca3f`;
- bytes: `507760`;
- source files: `156`;
- PR: `#9`;
- main merge commit: `41fb015dc0eac11c4713ff7740c3d92ee396cfff`;
- exact-v1.0.42 RED workflow: `34795377879`;
- final build workflow: `34796154733`;
- targeted terminal-evidence regression: `2/2 PASS`;
- worktree grouped QA: `35/35 PASS`;
- final ZIP fresh-extract grouped QA: `35/35 PASS`;
- final ZIP targeted regression: `2/2 PASS`;
- independent branch remote readback: `PASS`;
- installed v1.0.43 live run: **NOT_RUN / LIVE_UNVERIFIED**.

Status:

`MAIN_AUTHORITY / DIAGNOSTIC_CORRECTIVE_BUILD / OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED`.

## Что доказано live на v1.0.42

Task `af-20260914010021-tyyl`, Mini ITX `8156773014`:

- v1.0.42 Writing Block capture patch = PASS: команда была захвачена и дошла до `AVITO_NAVIGATION`; старый capture livelock не повторился;
- затем `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED` после 4 automatic attempts;
- cards read = 0;
- baseline `150/150` сохранён;
- post-failure DOM несколько раз подтверждён как `AVITO_IP_BLOCK`;
- heading `Доступ ограничен: проблема с IP`;
- concrete CAPTCHA отсутствует;
- публичная карточка не появилась;
- смена IP не заявлена.

## Почему нужен v1.0.43

Exact v1.0.42 recovery уже измерял и сохранял `probe_before/probe_after`, `probe_ip_changed`, `transport_status`, endpoint/create state/reason и provider-rotation state, но terminal report после exhaustion отбрасывал эти данные и возвращал только общий reason + attempt count.

Это делало causal recovery patch невозможным без догадки. Exact-v1.0.42 RED подтвердил evidence-loss до изменения runtime.

v1.0.43 меняет **только terminal failure reporting** в `service_worker.js`:

- `IP probe: before → after` + доказана/не доказана смена IP;
- transport `PROBES_COMPLETE/PARTIAL/UNAVAILABLE` + redacted probe errors;
- endpoint/create state, attempt, reason;
- provider-rotation state/attempt, без превращения ACK в доказательство смены IP.

**Recovery algorithm не изменён.** Byte-identical к v1.0.42: `chatgpt_content.js`, `core.js`, `proxy_manager.js`, `recovery.js`. Capture version остаётся `0.6.19`.

## Development FAIL не скрывать

Первый v1.0.43 build `34795512725` = FAIL только из-за `popup_lifecycle` external process deadline `30.002s`. Отдельный diagnostic `34796013756` доказал: unchanged v1.0.42 baseline popup test PASS за `29.608s`, v1.0.43 PASS за `9.077s`, `popup.js/html` byte-identical. Изменён только test-harness outer deadline `30s -> 45s`; assertions и production popup code не менялись.

Финальный exact build `34796154733` = SUCCESS.

## Сохраняемые границы

- Writing Block — единственная executable assistant-команда; ordinary Markdown/code block = zero commands.
- Настоящая CAPTCHA — manual.
- IP firewall не является CAPTCHA только из-за слова `капчи` в explanatory text.
- Proxy = transport layer only.
- Blind retry/resend запрещён.
- Baseline `150/150` не сбрасывать.
- TOP_REVALIDATE_PRE: Dell `4750223208`, Mini ITX `8156773014`, Lenovo `8375159229`.
- Proxy.Market API key session-scoped.
- **v1.0.43 не является исправлением `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED`.**

## Следующий gate

Установить exact main v1.0.43 **поверх** текущей unpacked extension, не удаляя extension и не очищая storage/baseline. Reload extension, обновить ChatGPT/Avito, подтвердить `Версия: 1.0.43`.

Затем ровно один раз повторить Mini ITX `8156773014`. Если exhaustion повторится, terminal report обязан сам вернуть `IP probe`, transport, endpoint/create и provider rotation. После этого **не делать blind retry**: эти данные становятся causal authority для отдельного следующего recovery-behavior Rule20/RED/patch cycle.
