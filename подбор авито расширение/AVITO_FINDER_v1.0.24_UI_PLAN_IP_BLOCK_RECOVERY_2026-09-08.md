# Avito Finder v1.0.24 — UI-PLAN IP-BLOCK RECOVERY

## Live failure fixed

The first live `компьютер / p1` run on v1.0.23 reached the Avito UI plan and returned:

`COLLECT_LISTINGS: blocked — AVITO_IP_BLOCK`

The verified-egress recovery added in v1.0.23 only handled IP-block evidence detected during page readiness / main-frame recovery. If the page passed readiness but `avito_content.js` detected the IP restriction during `COLLECT_LISTINGS`, `service_worker.js` formatted and delivered the blocked UI-plan report without entering recovery.

## v1.0.24 correction

For a collection-first AVITO_UI plan only:

1. Detect `AVITO_IP_BLOCK` from either the top-level UI-plan result or a step result.
2. Do not emit the blocked collection report immediately.
3. Enter the existing VERIFIED EGRESS recovery from v1.0.23.
4. Preserve the existing bounded recovery counter instead of resetting it when the UI plan becomes active again.
5. After verified recovery, reload Avito and replay the same collection-first plan.
6. If egress cannot be verified, return the exact recovery failure to the pinned ChatGPT conversation instead of silently hanging.

No generic replay of arbitrary click/type/filter plans was added. Replay is bounded to plans where collection is the first operation, avoiding duplicate visible mutations.

## Preserved boundaries

- WORK/search methodology unchanged.
- No hidden Avito API.
- ZERO-MEDIA Traffic Lite preserved.
- CAPTCHA remains manual.
- Existing v1.0.23 VERIFY → ROTATE → VERIFY logic preserved.
- No fallback to Sticky.
- No blind Avito reload when egress is unverified.

## QA

- runtime JS syntax: 6/6 PASS
- tests: 138/138 PASS
- manifest: MV3 / 1.0.24
