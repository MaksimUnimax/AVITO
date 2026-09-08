# Avito Finder v1.0.24 — Test Report

Date: 2026-09-08

## Scope

Regression correction for IP-block evidence first detected inside a collection-first AVITO_UI plan.

## Results

- `node --check`: 6/6 runtime JavaScript files PASS
- `node --test tests/*.test.js`: 138/138 PASS
- new regression file: `tests/ip_block_ui_plan_recovery_v124.test.js`
- manifest version: `1.0.24`
- version name: `1.0.24-ui-plan-ip-block-recovery`

## New assertions

- UI-plan `AVITO_IP_BLOCK` enters verified recovery before report delivery.
- replay is limited to collection-first plans.
- bounded recovery counter is preserved across replay.
- unverified egress returns same-chat failure evidence.
