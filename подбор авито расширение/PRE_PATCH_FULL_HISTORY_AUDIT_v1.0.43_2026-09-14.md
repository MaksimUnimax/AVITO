# PRE-PATCH FULL HISTORY AUDIT — Avito Finder v1.0.43 gate

**Date:** 2026-09-14  
**Status:** `FULL_HISTORY_AUDIT=PASS`  
**Prospective target:** v1.0.43 — installed `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED` / proxy-egress recovery only.  
**Installed exact target authority:** v1.0.42.  

> This audit authorizes RED/diagnostic work only. It does not authorize an executable runtime patch until the exact failing recovery mechanism is reproduced and proven.

## 1. Full-history authority inherited without narrowing

This audit inherits in full, without sampling or replacement:

- `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md/json` — exhaustive v0.1.0–v1.0.38 authority;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.md/json` + remote readback;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.41_2026-09-13.md/json` + remote readback;
- `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.42_2026-09-13.md/json` + remote readback;
- `PATCH_ENGINEERING_RULES.md`, Rules 1–20;
- exact release authorities through v1.0.42, including source, ZIP, build metadata, QA, branch/main readback and installed-live evidence.

The inherited exhaustive authority covers 61 historical archive variants, 56 unique pre-1.0 versions, 60 exact historical runtime manifests, 54 unambiguous adjacent runtime diffs, the critical state-machine evolution ledgers, all recorded source gaps, and all previous real defects/regressions. No prior row is silently dropped.

## 2. Exact current release and repository delta

Current release authority is v1.0.42, merged by PR #8 at `ca156633ab700060b23c42767ed23fb0b2254df9`.

Final v1.0.42 artifact:

`releases/v1.0.42/AVITO_FINDER_v1.0.42_WRITING_BLOCK_CAPTURE_STABILITY_RECOVERY_2026-09-13.zip`

SHA-256: `616874dcdd67a05aaa63efbe5a3f670f91646cce9022db7038296525cfd63167`.

Verified v1.0.42 QA:

- targeted capture GREEN: `3/3 PASS`;
- worktree grouped QA: `35/35 PASS`;
- final ZIP fresh-extract grouped QA: `35/35 PASS`;
- final ZIP targeted GREEN: `3/3 PASS`;
- branch remote readback: `PASS`;
- main artifact/source readback: `PASS`.

Git compare from v1.0.42 merge commit to current main shows 7 later commits and only authority/live-evidence/progress files changed. No runtime JS, manifest, tests or executable proxy/navigation code changed after the v1.0.42 merge. Therefore exact v1.0.42 remains the correct RED target.

## 3. Installed v1.0.42 result — capture patch accepted, network recovery failed

Installed task: `af-20260914010021-tyyl`.
Target: Mini ITX listing `8156773014`.

The executable Writing Block was captured and dispatched successfully. The old v1.0.41 Writing Block livelock did not recur. Therefore the v1.0.42 capture correction has installed evidence of success at its own layer.

Execution then failed at a different layer:

- stage: `AVITO_NAVIGATION`;
- reason: `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED`;
- automatic attempts: `4`;
- cards read: `0`;
- mutation retry forbidden;
- reported version: `1.0.42`;
- no IP change claimed.

A subsequent read-only `DIAGNOSE_DOM` on the same current tab still showed the provider page:

`Доступ ограничен: проблема с IP`

with no CAPTCHA challenge and only the support / yandex.ru/internet links. This proves the provider IP block remained after the bounded recovery sequence.

Evidence authority:

`live_evidence/2026-09-14/V142_CAPTURE_PATCH_PASS_IP_RECOVERY_EXHAUSTED_2026-09-14.json`.

## 4. Relevant inherited network/proxy history

The historical proxy/recovery line already established these invariants:

- new document != new request;
- new request != new IP;
- new profile != new egress;
- canary IP change != stable multi-request Avito session;
- proxy is transport-only and must not alter target URL, queue order/cursor, capture or report delivery;
- automatic recovery is bounded;
- recovery-created endpoint must be sticky (`rotation=-1`), not every-request rotation;
- no blind retry after uncertain provider mutation;
- real CAPTCHA is manual; IP firewall is a different state;
- v1.0.41 fixed only classifier routing and intentionally reused the existing recovery state machine;
- v1.0.42 changed capture behavior only; proxy code remained outside scope.

The v1.0.41 installed run had already exposed the same separate network symptom on Mini ITX: four bounded IP-block recovery attempts exhausted. Historical popup evidence later showed a `Каждый запрос` profile and a canary observation `31.131.200.254 -> 31.131.200.254` with no confirmed change. That evidence is useful but is not silently promoted into proof of the current v1.0.42 attempt-by-attempt state.

## 5. Exact current code path and proven design facts

Exact v1.0.42 `service_worker.js` contains the following recovery sequence:

1. `prepareRecoveryProxy()` requires active proxy mode and selected profile credentials.
2. Each recovery attempt applies the selected profile to the Avito-only PAC and samples canary egress.
3. Starting from attempt 2, if the selected profile exposes a provider change-IP link, Finder dispatches that mutation once for that attempt and records acknowledgement separately from proof (`ip_change_proven:false`).
4. Starting from attempt 3, `maybeCreateRecoveryEndpoint()` may create/reconcile a new sticky endpoint, but only when a session-scoped Proxy.Market API key and package ID are available.
5. If API key/package ID is unavailable, endpoint creation is explicitly `SKIPPED` and the current profile is returned.
6. `reserveRecoveryEndpoint()` currently allows only one create reservation for the whole `connection_recovery` record: once `connection_recovery.create` exists, later attempts do not reserve another endpoint creation.
7. After proxy preparation, Finder samples `probe_before`/`probe_after` and computes `probe_ip_changed`.
8. The recovery path then requests a fresh Avito document even when `probe_ip_changed=false`; the fresh document request is not itself proof of a new egress.
9. The terminal user report currently exposes only the attempt count and generic exhaustion reason, not the per-attempt `probe_before`, `probe_after`, provider-rotation state or endpoint-create state.

These are source-proven facts. They do **not yet prove** which one caused the installed v1.0.42 failure.

## 6. Causal questions that must be answered by RED/diagnostics

Before any runtime patch, exact v1.0.42 must distinguish at least these branches:

A. provider change-IP request acknowledged but canary egress did not change;

B. API key was unavailable after extension reload, so attempts >=3 could not create a fresh endpoint;

C. endpoint creation was attempted but could not identify/reconcile a new sticky profile;

D. a new endpoint/profile was identified and applied but canary egress still did not change;

E. canary egress changed but Avito continued blocking that new route;

F. endpoint creation succeeded once, Avito still blocked it, and attempt 4 reused the same created endpoint because the one-create-per-operation reservation prevented a second bounded endpoint creation;

G. Chrome reused an existing CONNECT/session despite PAC reconfiguration, so provider-side mutation was not reflected in the Avito route;

H. another transport/auth failure occurred and was collapsed into generic recovery exhaustion.

No patch may select one of these by guess.

## 7. Required RED authority

The next work must create exact-v1.0.42 RED/diagnostic fixtures for the actual recovery state machine, including:

1. `probe_before == probe_after` after provider rotation acknowledgement;
2. attempts >=3 with API key unavailable;
3. attempts >=3 with endpoint creation available and a newly identified sticky endpoint;
4. new endpoint still blocked by Avito;
5. attempt 4 after an already-used endpoint-create reservation;
6. exact terminal report contents after recovery exhaustion.

The RED must prove the mismatch between the live contract and old behavior. At minimum it must demonstrate whether exact v1.0.42 can knowingly request another Avito document while the measured egress is unchanged and no new recovery capability remains, and whether the terminal report loses the evidence necessary to distinguish the failure class.

If a candidate behavioral fix is proposed, a second RED must prove that the broken v1.0.42 implementation fails the exact new invariant.

## 8. Permitted v1.0.43 patch boundary after RED

Only the proven network/proxy recovery defect may change.

Allowed scope after RED:

- `service_worker.js` recovery decision/telemetry logic;
- `proxy_manager.js` only if RED proves provider-profile semantics are wrong there;
- exact tests/fixtures and release identity files;
- terminal recovery report may expose measured proxy/recovery evidence, but must redact secrets.

Forbidden scope:

- Writing Block capture/validator;
- report send/receipt semantics;
- explicit queue order/cursor;
- child-tab ownership model except if a separate RED proves it is causal;
- product selection/ranking;
- search methodology or baseline `150/150`;
- CAPTCHA automation;
- storing Proxy.Market API key persistently merely to avoid a session-scoped limitation unless separately justified and security-reviewed.

## 9. Required invariants for any accepted recovery patch

- no claim of IP change without measured evidence;
- no blind provider mutation retry after uncertain outcome;
- no unbounded endpoint creation;
- no reload loop when no recovery capability remains;
- terminal state must be `SUCCESS`, `RETRYABLE`, `MANUAL_REQUIRED`, or `FAILED_WITH_EXACT_REASON`;
- API-key absence, provider-rotation failure, endpoint-create skip/failure, unchanged canary egress, and Avito-still-blocked-after-new-egress must be distinguishable in evidence;
- same target URL and same operation ownership must be preserved;
- all prior live regressions remain permanent tests;
- final ZIP must be tested after fresh extraction;
- installed owner-Chrome E2E on the exact final build remains mandatory.

## 10. Process failures retained

The prior project ledger remains binding. In particular:

- do not treat `probe_ip_changed=false` as proof of why Avito stayed blocked without the rest of the recovery record;
- do not assume a session API key was present during attempts merely because it was present later in a popup;
- do not call a provider acknowledgement an IP-change proof;
- do not patch classifier/capture again: both have separate evidence and this failure is downstream;
- do not blind-run another four-attempt navigation just to gather the same generic exhaustion report.

## 11. Rule-20 verdict

`FULL_HISTORY_AUDIT=PASS` for the prospective v1.0.43 **RED gate**.

Reason:

- the exhaustive authority through v1.0.42 is inherited without narrowing;
- exact v1.0.42 source and final artifact are present in GitHub;
- the installed v1.0.42 network failure is persisted;
- post-release repository delta contains no executable runtime change;
- the affected proxy/IP-block state machine and historical regressions have been re-established;
- unresolved causal branches are explicitly listed rather than guessed.

**Next legal action:** create exact-v1.0.42 RED/diagnostic evidence.  
**Still forbidden:** executable v1.0.43 runtime patch until the RED proves the root cause.