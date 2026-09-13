# Avito Finder — обязательный startup authority

Перед любой работой полностью прочитать:

1. `подбор авито расширение/PATCH_ENGINEERING_RULES.md` — постоянные **20** правил.
2. `подбор авито расширение/ТЕКУЩИЙ_ПРОГРЕСС.md`.
3. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md` и `.json`.
4. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.md` и `.json` плюс remote readback.
5. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.41_2026-09-13.md` и `.json` плюс remote readback.
6. `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.42_2026-09-13.md` и `.json` плюс `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.42_REMOTE_READBACK_2026-09-13.json`.
7. `подбор авито расширение/PATCH_REPORT_v1.0.42_RU.md`.
8. `подбор авито расширение/releases/v1.0.42/` — exact ZIP/source, `BUILD_v1.0.42.json`, `REMOTE_READBACK.json`, live acceptance state и main receipts/readback.

## Rule 20

`FULL_HISTORY_AUDIT=PASS` для v1.0.42 pre-patch gate. Он наследует без сужения полный historical authority: 61 архивный вариант, 56 уникальных pre-1.0 версий, 60 exact historical runtime manifests, 54 unambiguous adjacent runtime diffs, critical state-machine evolution и defect→regression ledger. Перед любым следующим executable patch audit снова расширить до текущего HEAD **до изменения runtime**.

## Текущая main authority

**Avito Finder v1.0.42 — Writing Block Capture Stability Recovery**.

ZIP: `подбор авито расширение/releases/v1.0.42/AVITO_FINDER_v1.0.42_WRITING_BLOCK_CAPTURE_STABILITY_RECOVERY_2026-09-13.zip`.

- SHA-256: `616874dcdd67a05aaa63efbe5a3f670f91646cce9022db7038296525cfd63167`;
- bytes: `505192`;
- source files: `154`;
- PR: `#8`;
- main merge commit: `ca156633ab700060b23c42767ed23fb0b2254df9`;
- successful build workflow: `34761221936`;
- exact-v1.0.41 RED workflow: `34759646978`;
- targeted Writing Block capture: `3/3 PASS`;
- worktree grouped QA: `35/35 PASS`;
- final ZIP fresh-extract grouped QA: `35/35 PASS`;
- final ZIP targeted capture: `3/3 PASS`;
- independent branch remote readback: `PASS`;
- installed owner Chrome E2E: **NOT_RUN / LIVE_UNVERIFIED**.

Status: `MAIN_AUTHORITY / OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED / NOT_READY_UNTIL_INSTALLED_E2E`.

## Живой дефект v1.0.41, который исправляет v1.0.42

Один и тот же видимый Writing Block с готовой локальной Copy-кнопкой мог чередоваться:

`WRITING_BLOCK_LOCAL_BODY_UNAVAILABLE / payload_bytes=0`
→ тот же полный payload (`2447` bytes)
→ `PROMPT_DOM_STABILITY_STARTED`
→ снова local-body unavailable.

Exact v1.0.41 при пустом extraction делал `candidateFirstSeen = null`, поэтому следующий valid sample заново запускал structural gate. Общего extraction budget не было, и цикл мог продолжаться бесконечно.

Отдельный exact-v1.0.41 RED доказал, что `writingBlockStructuralSignature()` также зависел от snapshots всех assistant-section buttons, поэтому изменение посторонней suggestion/action кнопки могло перезапускать Writing Block-local stability.

## v1.0.42 correction

Поведенчески изменён только `chatgpt_content.js`:

- transient local-body miss больше не уничтожает уже доказанную structural identity;
- miss обрабатывается как payload-layer retry;
- retry ограничен: production default максимум `8` miss или `8000 ms`;
- exhaustion даёт `PROMPT_PAYLOAD_EXTRACTION_FAILED_BOUNDED` / `FAILED_WITH_EXACT_REASON`;
- repeated identical payload-fingerprint stability перед validation сохранена;
- посторонние assistant-turn buttons исключены из Writing Block structural signature.

Identity synchronization:

- `service_worker.js`: **только** `CAPTURE_VERSION 0.6.18 -> 0.6.19`;
- `avito_content.js`: release identity `1.0.42`;
- `manifest.json`: release identity/description `1.0.42`.

`proxy_manager.js` byte-identical к v1.0.41. Navigation, explicit queue, cursor, report delivery и proxy behavior не менялись.

## RED / FAIL history — не стирать

- v1.0.39 installed multi-tab acceptance = FAIL; v1.0.40 закрыл full first-target allocation.
- v1.0.40 installed IP-firewall classification = FAIL; v1.0.41 закрыл classifier, не переписывая recovery.
- v1.0.41 Dell current-page direct read = PASS.
- v1.0.41 Mini ITX fresh navigation = `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED` после 4 попыток; это **отдельный unresolved proxy/egress track**, не часть v1.0.42.
- v1.0.41 Writing Block capture = LIVE FAIL по unbounded payload-extraction oscillation.
- screenshot-only гипотеза про button churn как primary cause была преждевременной; full live journal доказал payload-extraction oscillation как прямую causal chain. Button churn остаётся отдельным доказанным regression risk.
- exact-v1.0.41 RED run `34759646978` = `RED_CONFIRMED` до runtime patch.
- промежуточные v1.0.42 build/fixture FAIL сохранены как development evidence и не считаются PASS.
- final branch build run `34761221936` = SUCCESS, включая worktree/final-ZIP QA и independent readback.

## Сохраняемые границы

- Writing Block — единственная исполняемая assistant-команда; ordinary Markdown/code block = zero commands.
- Настоящая CAPTCHA — ручная.
- IP firewall — не CAPTCHA только из-за упоминания слова `капчи`.
- Proxy transport-only.
- Blind resend/uncertain mutation запрещены.
- Baseline `150/150` не сбрасывать.
- TOP_REVALIDATE_PRE: Dell `4750223208`, Mini ITX `8156773014`, Lenovo `8375159229`.
- Proxy.Market API key session-scoped.
- v1.0.42 capture patch **не** является исправлением `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED`.

## Следующий gate

Установить exact main v1.0.42 поверх существующей unpacked extension **без удаления extension и без очистки storage/baseline**, выполнить Reload, обновить ChatGPT/Avito и подтвердить `Версия: 1.0.42`.

Повторить исходный installed E2E:

`user action -> assistant Writing Block -> capture -> validator -> Avito action/result -> report -> тот же pinned ChatGPT chat -> готовность принять следующую команду`.

До этого v1.0.42 остаётся `LIVE_UNVERIFIED / NOT_READY_UNTIL_INSTALLED_E2E`. Отдельный proxy/egress recovery failure исследовать только отдельным следующим Rule-20 patch cycle, если он снова воспроизводится после capture acceptance.
