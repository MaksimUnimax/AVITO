# Avito Finder v1.0.37 — build checkpoint

Дата: 2026-09-12. Ветка: `fix/avito-v137-first-ipblock-rotation`.

## Live RED

Задача `af-20260912140042-p4kl` сначала показала чистый `AVITO_IP_BLOCK`, затем после bounded recovery — страницу, где одновременно видны `Доступ ограничен: проблема с IP` и реальная CAPTCHA (`geetest_captcha`, кнопка `Продолжить`). Hard CAPTCHA boundary не ослабляется.

На exact v1.0.36 R2 воспроизведён отдельный RED: для rotatable provider endpoint на первой чистой IP-block попытке timeline был `egress-probe, egress-probe, avito-reload`; provider `change_ip_link` не вызывался. Причина — `prepareRecoveryProxy` разрешал `forceChangeIpByLink` только при `record.attempt>=2`.

## Минимальный patch

- `service_worker.js`: provider `change_ip_link` разрешён с первой bounded IP-block recovery попытки, если профиль явно имеет `rotate_can_change=true` и валидный `change_ip_link`.
- `manifest.json`: version `1.0.37`, version_name `1.0.37-first-ipblock-provider-rotation`.
- `avito_content.js`: adapter version `1.0.37`, чтобы строгий worker version gate сохранился.
- Остальной production runtime не менялся.
- CAPTCHA при уже видимой CAPTCHA остаётся manual; автоматического решения/обхода нет.

Новый regression до патча FAIL, после патча PASS. Focused recovery/CAPTCHA regressions: 93 PASS / 0 FAIL. Runtime JS syntax PASS.

## Упакованный кандидат

`AVITO_FINDER_v1.0.37_FIRST_IPBLOCK_PROVIDER_ROTATION_2026-09-12.zip`

- bytes: `484687`;
- SHA-256: `7c142783270f838b034cb13bf447b36fb1522efad5c3efb14276fca44ef46393`;
- files: `143`;
- ZIP CRC: PASS;
- fresh extract byte equality: 143/143 PASS;
- manifest version from extracted ZIP: 1.0.37.

## Текущий gate

Полный release QA запущен именно из свежей распаковки этого ZIP. До завершения полного QA, публикации exact source+ZIP и remote readback статус: `BUILD_PACKAGED / QA_RUNNING / NOT_READY / LIVE_UNVERIFIED`.

Нельзя устанавливать этот checkpoint как доказанно готовый релиз. Следующий материальный блок: полный QA result → GitHub materialization → remote byte/hash readback → передача ZIP для installed Chrome E2E.
