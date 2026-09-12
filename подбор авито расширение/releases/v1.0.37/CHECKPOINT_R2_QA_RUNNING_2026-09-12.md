# Avito Finder v1.0.37 R2 — QA checkpoint

Дата: 2026-09-12. Ветка: `fix/avito-v137-first-ipblock-rotation`.

## R1 отклонён

Первый упакованный v1.0.37:
- SHA-256 `7c142783270f838b034cb13bf447b36fb1522efad5c3efb14276fca44ef46393`;
- 484687 bytes;
- 143 files.

Полный final-ZIP QA был остановлен после gate FAIL. На момент остановки: 10 групп PASS / 1 FAIL. FAIL `node` оказался не runtime-регрессией, а тремя оставшимися тестами, которые жёстко требовали `manifest.version === 1.0.36`; ещё один Python test также содержал старый version assertion и был найден до его запуска. R1 не принимается и не выдаётся как релиз.

## R2 test-only correction

Runtime R1 → R2: **без изменений**.

Обновлены только version assertions/названия в:
- `tests/ip_block_ui_plan_recovery_v124.test.js`;
- `tests/ip_block_verified_egress_v123.test.js`;
- `tests/traffic_lite_zero_media.test.js`;
- `tests/v135_prompt_form_terminal_gate.test.py`.

После test-only correction полный Node набор: `352 PASS / 0 FAIL`; отдельный prompt-form Python check PASS.

## R2 ZIP

`AVITO_FINDER_v1.0.37_FIRST_IPBLOCK_PROVIDER_ROTATION_R2_2026-09-12.zip`

- bytes: `485310`;
- SHA-256: `b9c1717fdca16d1a1f3e39681128e4556aaed27b4b83b7c2c7e55ba54b65ba75`;
- files: `144`;
- CRC: PASS;
- fresh extract byte equality: `144/144 PASS`;
- extracted manifest version: `1.0.37`.

Полный 35-группный suite сейчас запущен из свежей распаковки именно этого R2 ZIP. До результата, GitHub materialization и remote readback статус: `R2_PACKAGED / QA_RUNNING / NOT_READY / LIVE_UNVERIFIED`.
