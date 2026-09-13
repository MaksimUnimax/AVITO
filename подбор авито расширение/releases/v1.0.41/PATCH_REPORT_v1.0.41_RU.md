# Avito Finder v1.0.41 — IP-block firewall classifier recovery

Status: `OFFLINE_QA_PASS / LIVE_UNVERIFIED`.

## Live defect

Installed v1.0.40 task `af-20260913103028-k9qv` reached the Dell URL and visibly showed `Доступ ограничен: проблема с IP`. The landing text merely said that pressing `Продолжить` would lead to CAPTCHA. No CAPTCHA challenge was visible, yet Finder classified it as `BLOCKED_LOGIN_OR_CAPTCHA`, so the historical IP recovery/reload path was skipped and the page did not refresh. Cards read remained 0 and baseline 150/150 was preserved.

## Root cause

`publicPageInterruptionProbe()` used broad `/captcha|капч/` text detection. The IP firewall helper contains `для решения капчи`, so both `captcha=true` and `ip_block=true`. `detectBlock()` checks CAPTCHA first. Existing `ip_block_refresh_resilience.test.js` validated the worker branch statically but never sent the real provider text through the classifier, so it could stay green while the live page failed.

## Historical contract

The v1.0.24 authority explicitly requires `AVITO_IP_BLOCK -> bounded recovery -> bypass-cache reload -> retry same plan`. v1.0.40 still contains that mechanism; this patch restores correct routing into it rather than adding a new refresh mechanism.

## Minimal patch

Only `core.js` changes runtime behavior. Exact `Доступ ограничен: проблема с IP` is treated as strong IP-block evidence. A generic mention of future CAPTCHA or rate-limit explanation on that landing page no longer overrides IP-block. Concrete CAPTCHA evidence (captcha iframe/canvas/slider/Geetest structure or human/robot verification wording) still sets CAPTCHA and remains manual even if an IP heading is also present. `service_worker.js` and `proxy_manager.js` are byte-identical to v1.0.40. `manifest.json` and `avito_content.js` change release identity only.

## RED → GREEN

Exact v1.0.40 classifier RED is persisted under `QA/red`. The first RED workflow attempt `34754784589` failed for a test-harness mistake (`location` absent) and remains historical FAIL; it is not counted as causal evidence. Corrected/refined RED runs prove the live classifier defect. v1.0.41 targeted classifier tests pass 3/3 and explicitly preserve a concrete CAPTCHA manual boundary.

## Rule compliance

| Rule | Status | Evidence |
|---|---|---|
| 1 root cause/state machine | PASS | classifier overlap blocks historical recovery route |
| 2 exact layer | PASS | real firewall text through exact core probe |
| 3 local != live | PASS | v1.0.41 remains LIVE_UNVERIFIED |
| 4 baseline | PASS | search baseline 150/150 untouched |
| 5 ChatGPT↔Finder contract | PASS | capture/validator/report unchanged |
| 6 reproduce before patch | PASS | exact v1.0.40 RED |
| 7 causal chain | PASS | live DOM -> probe flags -> classifier -> skipped recovery |
| 8 minimal patch | PASS | core behavior only; two identity files |
| 9 same scenario | PASS offline / LIVE_PENDING | exact firewall fixture GREEN; installed rerun required |
| 10 prior regressions | PASS | full suite |
| 11 final build | PASS | fresh-extract full rerun |
| 12 installed E2E | NOT_RUN | owner Chrome required |
| 13 live FAIL rejects | PASS process | v1.0.40 is not accepted for this scenario |
| 14 proxy transport isolation | PASS | proxy runtime byte-identical |
| 15 bounded waits | PASS | existing bounded recovery unchanged |
| 16 test catches live bug | PASS | exact v1.0.40 RED |
| 17 exact source | PASS | verified v1.0.40 ZIP/source base |
| 18 report | PASS | this report |
| 19 GitHub persistence | PASS after remote readback | source/ZIP/SHA/QA persisted |
| 20 full history audit | PASS | v1.0.41 audit + remote readback |

## НАРУШЕННЫЕ ПРАВИЛА

The previous code/test combination violated Rules 2 and 16: tests proved that an already-classified `AVITO_IP_BLOCK` would reload, but did not test whether the real provider firewall DOM was classified as IP-block. The earlier causal interpretation also violated Rule 7 by treating the combined Finder status as proof of a real CAPTCHA challenge. The first v1.0.41 RED workflow had a harness-only `location` ReferenceError; that FAIL is retained and was corrected without runtime changes.

Build SHA-256: `4658c589802d0a8a641a1f571bb8d55005d5f05423a7e154b7dcc9909842920c`. Bytes: `498304`. Source files: `152`.
