# PRE-PATCH FULL HISTORY AUDIT — Avito Finder v1.0.44 gate

**Date:** 2026-09-14  
**Status:** `FULL_HISTORY_AUDIT=PASS`  
**Prospective target:** v1.0.44 — global Avito network-request authority after network block.  
**Exact target authority:** v1.0.43 branch commit `812c35082120cb05f8af717378ffb597ba72ec53`; current `main` commit `bb53feb3769701bd0c7a41f78770454ccfa10699`.

## 1. Inherited full authority

This gate inherits without sampling or narrowing the complete authority already persisted in:

- `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md/json`;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.md/json`;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.41_2026-09-13.md/json`;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.42_2026-09-13.md/json`;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.43_2026-09-14.md/json`;
- `PATCH_ENGINEERING_RULES.md`, Rules 1–20.

The inherited exhaustive audit covers 61 historical archive variants, 56 unique pre-1.0 versions, 60 exact historical runtime manifests and 54 unambiguous adjacent runtime diffs. Known source gaps remain explicit: v1.0.6 unresolved package SHA/stream conflict; v1.0.2–v1.0.5 version authority not confirmed; v1.0.20/v1.0.21 no version-specific authority; v1.0.14, v1.0.22 and v1.0.25–v1.0.33 retain their previously documented bounded authority.

## 2. Exact v1.0.43 source and post-release delta

Exact v1.0.43 source is preserved under:

`releases/v1.0.43/v143_work/`

on commit `812c35082120cb05f8af717378ffb597ba72ec53`.

The source tree contains exact `service_worker.js`, `core.js`, `proxy_manager.js`, `recovery.js`, `manifest.json`, adapters and tests. Final v1.0.43 artifact SHA-256 is `593d31edfb136c68a50e4aa45a157c1e3d296f3beb395e0444c5b4de4c4aca3f`.

v1.0.43 merge is `41fb015dc0eac11c4713ff7740c3d92ee396cfff`. The later `main` changes through `bb53feb3769701bd0c7a41f78770454ccfa10699` are authority/progress evidence; v1.0.43 remains the exact runtime target.

## 3. New live failure and exact source-proven causal chain

The installed v1.0.43 run exposed repeated HTTP 429 recovery where `probe_ip_changed=false` yet a fresh Avito document was requested again.

Exact v1.0.43 `service_worker.js` proves the bypass:

1. `performReservedConnectionRecoveryInsideLane()` treats `RATE_LIMIT` specially as `{strategy:'COOLDOWN_SAME_ROUTE', probe_ip_changed:false, avito_exit_ip_verified:false}` and intentionally skips endpoint/IP rotation.
2. The same function subsequently computes the target and directly calls `tabsReload(...)` or `tabsUpdate(...{url:target...})` without any common egress-permission gate.
3. It then logs `AVITO_RECOVERY_FRESH_DOCUMENT_REQUESTED` with `probe_ip_changed:prepared.probe_ip_changed` even when that value is false.
4. The same recovery function is used by IP-block, rate-limit and proxy-transport recovery paths, including sequential-card recovery and persisted recovery resume.

Therefore the current root cause is not merely “429 retries too soon”. The architectural defect is that Avito network authority is distributed among call sites instead of being guarded by one post-block invariant.

## 4. Historical origin and missed closures

- v1.0.18 introduced bounded IP-block recovery but confused document freshness with connection recovery.
- v1.0.19 separated fresh request from fresh document but still did not prove egress.
- v1.0.22 used profile/failover evidence too strongly.
- v1.0.23 introduced measured canary egress and the correct local rule “reload Avito only after verified recovery”, but the rule remained branch-local instead of becoming a global request-authority invariant.
- v1.0.28 added 429/rate-limit recovery with separate retry/backoff semantics, allowing a path that can bypass the v1.0.23 concept.
- v1.0.38 corrected recovery-created endpoints to sticky `rotation=-1`, but solved endpoint semantics rather than global request authority.
- v1.0.41 restored IP-firewall classification while deliberately reusing recovery unchanged.
- v1.0.43 improved terminal recovery evidence while deliberately leaving recovery behavior unchanged.

The repeated process failure is the same evidence-level error already documented by Rules 1, 2, 10 and 16: document/request/profile/provider ACK/backoff completion are not proof that a blocked egress epoch has been replaced by a new usable egress.

## 5. Required invariant for v1.0.44

After any network blocking response, Finder must enter a blocked-egress epoch. While that block is active, **no code path may intentionally initiate a new Avito network request** unless a new usable egress has been measured.

Permission may reopen only when all are true:

- `probe_before` is known;
- `probe_after` is known;
- `probe_after !== probe_before`;
- transport/probe status is `PROBES_COMPLETE`;
- the new egress epoch is newer than the blocked epoch;
- equivalently the recovery record has `egressChangeConfirmed === true`.

These facts do **not** reopen permission by themselves: provider ACK, profile ID change, endpoint creation, `rotation=-1`, Retry-After expiration, backoff completion, fresh document, fresh HTTP request, new `timeOrigin`, or proxy mutation acknowledgement.

Fail closed for `PROBES_UNAVAILABLE`, `PROBES_PARTIAL`, probe timeout/error, provider ACK with same IP, endpoint creation with same/unknown egress, or any other unproven change.

## 6. Required RED/property matrix on exact v1.0.43

Before runtime modification, exact v1.0.43 must fail a regression that demonstrates at minimum:

`HTTP_429 + probe_ip_changed=false -> AVITO_RECOVERY_FRESH_DOCUMENT_REQUESTED`.

The permanent property must cover:

- `AVITO_IP_BLOCK`;
- `HTTP_429` / `RATE_LIMIT`;
- `PROBES_UNAVAILABLE`;
- `PROBE_TIMEOUT` / probe error;
- provider rotation ACK without IP change;
- endpoint created but same egress;
- `PROBES_PARTIAL` / transport partial.

For every blocked case without confirmed egress change:

- `avitoNetworkRequestsAfterBlock === 0`;
- `freshDocumentRequested === false`;
- `tabReloadRequested === false`;
- Avito `tabs.update(...url...)` is not issued;
- terminal/log evidence states `AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE` or an equivalent exact reason.

## 7. Permitted implementation scope

Allowed:

- central/common Avito request-authority logic in `service_worker.js` or a narrowly factored shared helper;
- block/egress epoch fields needed for that invariant;
- interception of all intentional Avito main-frame navigation/reload call sites;
- exact RED/GREEN/property regressions and release identity;
- terminal evidence for denied requests.

Forbidden unless separately proven causal:

- ChatGPT capture/validator changes;
- queue/cursor semantics;
- ranking/search methodology or baseline 150/150;
- report send/receipt behavior;
- CAPTCHA automation;
- resetting extension storage/results;
- unrelated proxy-provider behavior.

## 8. Preserved owner/search state

The patch must not reset or intentionally mutate the saved market authority: baseline `150/150`, OLD_50, saved TOP, queue/cursor, or the already collected 30 cards from `компьютер/p1`.

## 9. Acceptance boundary

Offline GREEN is insufficient. Required release cycle remains:

`exact-v1.0.43 RED -> minimal architectural patch -> targeted GREEN -> all old regressions -> exact final ZIP -> fresh-extract QA -> GitHub source/artifact/SHA/readback -> installed owner-Chrome E2E`.

Without installed Chrome E2E the build remains `LIVE_UNVERIFIED / NOT_ACCEPTED`.

## 10. Rule-20 verdict

`FULL_HISTORY_AUDIT=PASS` for v1.0.44 RED/implementation gate.

Reason: complete historical authority is inherited without narrowing; exact v1.0.43 source is present; the new live 429 behavior is reconciled with exact production code; the defect is generalized to the common request-authority boundary rather than patched as another local 429 branch; the permanent property matrix and preserved-state boundaries are explicit.
