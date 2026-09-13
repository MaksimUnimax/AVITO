# PRE-PATCH FULL HISTORY AUDIT — Avito Finder

**Дата:** 2026-09-13  
**Статус:** `FULL_HISTORY_AUDIT=PASS`  
**Текущий release:** v1.0.38 остаётся `LIVE_UNVERIFIED`; этот PASS закрывает только Rule 20 history gate.

## 1. Охват

- Reachable Git: 352 commits; runtime/test/history commits: 193; refs: 13; PR: 4.
- Historical History.zip: 61 archive variants; 56 unique versions v0.1.0–v1.0.1; exact runtime manifests: 60.
- Unambiguous historical adjacent runtime diffs: 54. v0.6.1 intentionally remains two distinct runtime variants.
- Current exact roots: v1.0.23, v1.0.24, v1.0.34–v1.0.38. Source gaps are explicit below; no version is reconstructed by guess.
- Audit-only workflows enforce no manifest/runtime changes. Invalid audit-harness runs were rejected, not counted as evidence.

## 2. Главный вывод

Inherited `rotation=0` recovery policy existed at least in exact v1.0.23 and exact v1.0.24 and survived through v1.0.37. Previous analysis was too selective. v1.0.23 measured canary egress changes, but lacked the distinct invariant **canary IP change != stable multi-request Avito browser session**. v1.0.38 closes that specific gap with an exact provider create request-body regression requiring sticky `rotation=-1`.

## 3. Exact archived lineage v0.1.0–v1.0.1

| Version | Archive variant | Intent | Status | Tests | Changed runtime from prior unambiguous version |
|---|---|---|---|---:|---|
| 0.1.0 | `AVITO_FINDER_v0.1.0_stage1_readonly_dom_inspector (2).zip` | `stage1_readonly_dom_inspector (2)` | EXTRACTED_NO_AVITO_MANIFEST | 0 |  |
| 0.1.0 | `AVITO_FINDER_v0.1.0_stage1_readonly_dom_inspector.zip` | `stage1_readonly_dom_inspector` | EXACT_ARCHIVE_SOURCE | 0 |  |
| 0.1.0 | `AVITO_FINDER_v0.1.0_stage1_source_and_tests.zip` | `stage1_source_and_tests` | EXACT_ARCHIVE_SOURCE | 4 |  |
| 0.1.1 | `AVITO_FINDER_v0.1.1_source_tests_and_docs.zip` | `source_tests_and_docs` | EXACT_ARCHIVE_SOURCE | 4 | avito_content.js, chatgpt_content.js, manifest.json, service_worker.js |
| 0.1.1 | `AVITO_FINDER_v0.1.1_stage1_content_receiver_recovery.zip` | `stage1_content_receiver_recovery` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, manifest.json, service_worker.js |
| 0.2.0 | `AVITO_FINDER_v0.2.0_command_capture_filter_surface_candidate.zip` | `command_capture_filter_surface` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, popup.css, popup.html, popup.js, service_worker.js |
| 0.2.1 | `AVITO_FINDER_v0.2.1_writing_block_command_capture_candidate.zip` | `writing_block_command_capture` | EXACT_ARCHIVE_SOURCE | 4 | chatgpt_content.js, core.js, manifest.json, popup.html, service_worker.js |
| 0.2.2 | `AVITO_FINDER_v0.2.2_bridge-turn-anchor-command-wait_candidate.zip` | `bridge-turn-anchor-command-wait` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, core.js, manifest.json, popup.html, popup.js, service_worker.js |
| 0.2.3 | `AVITO_FINDER_v0.2.3_anchor-copy-only-live-log_candidate.zip` | `anchor-copy-only-live-log` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, core.js, manifest.json, popup.html, popup.js, service_worker.js |
| 0.2.4 | `AVITO_FINDER_v0.2.4_bridge-exact-capture_candidate.zip` | `bridge-exact-capture` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.2.5 | `AVITO_FINDER_v0.2.5_bridge-start-exact-anchor_candidate.zip` | `bridge-start-exact-anchor` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, core.js, manifest.json, popup.html, popup.js, service_worker.js |
| 0.3.0 | `AVITO_FINDER_v0.3.0_tz-command-contract-reset_candidate.zip` | `tz-command-contract-reset` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, popup.css, popup.html, popup.js, service_worker.js |
| 0.4.0 | `AVITO_FINDER_v0.4.0_bridge-exact-Ishchi-local-copy_TEST_CANDIDATE.zip` | `bridge-exact-Ishchi-local-copy` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, popup.css, popup.html, popup.js, service_worker.js |
| 0.4.2 | `AVITO_FINDER_v0.4.2_active-dialog-scope_TEST_CANDIDATE.zip` | `active-dialog-scope` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, core.js, manifest.json, popup.html, popup.js, service_worker.js |
| 0.4.3 | `AVITO_FINDER_v0.4.3_avito-page-ready_TEST_CANDIDATE.zip` | `avito-page-ready` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, manifest.json, service_worker.js |
| 0.5.0 | `AVITO_FINDER_v0.5.0_diagnostic-dom-dialog_TEST_CANDIDATE.zip` | `diagnostic-dom-dialog` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, popup.html, popup.js, service_worker.js |
| 0.5.1 | `AVITO_FINDER_v0.5.1_local-validator-error-return_TEST_CANDIDATE.zip` | `local-validator-error-return` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.5.2 | `AVITO_FINDER_v0.5.2_continuous-dialogue_TEST_CANDIDATE.zip` | `continuous-dialogue` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.5.3 | `AVITO_FINDER_v0.5.3_anchor-fence-visible-avito_TEST_CANDIDATE.zip` | `anchor-fence-visible-avito` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.5.4 | `AVITO_FINDER_v0.5.4_mode-anchor-handoff-search-surface_TEST_CANDIDATE.zip` | `mode-anchor-handoff-search-surface` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.5.5 | `AVITO_FINDER_v0.5.5_search-ancestry-evidence_TEST_CANDIDATE.zip` | `search-ancestry-evidence` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.5.6 | `AVITO_FINDER_v0.5.6_allowlisted-location-dialog_TEST_CANDIDATE.zip` | `allowlisted-location-dialog` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, popup.html, service_worker.js |
| 0.6.0 | `AVITO_FINDER_v0.6.0_generic-visible-ui-action-engine_TEST_CANDIDATE.zip` | `generic-visible-ui-action-engine` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.6.1 | `AVITO_FINDER_v0.6.1_bridge-html-parity-worker-handoff_TEST_CANDIDATE.zip` | `bridge-html-parity-worker-handoff` | EXACT_ARCHIVE_SOURCE | 0 |  |
| 0.6.1 | `AVITO_FINDER_v0.6.1_clean-start-and-bridge-differential_TEST_CANDIDATE.zip` | `clean-start-and-bridge-differential` | EXACT_ARCHIVE_SOURCE | 0 |  |
| 0.6.2 | `AVITO_FINDER_v0.6.2_continuation-anchor-generation-fence_TEST_CANDIDATE.zip` | `continuation-anchor-generation-fence` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.6.3 | `AVITO_FINDER_v0.6.3_ui-plan-snapshot-return_TEST_CANDIDATE.zip` | `ui-plan-snapshot-return` | EXACT_ARCHIVE_SOURCE | 0 | core.js, manifest.json |
| 0.6.4 | `AVITO_FINDER_v0.6.4_reactive-generic-type_TEST_CANDIDATE.zip` | `reactive-generic-type` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.6.5 | `AVITO_FINDER_v0.6.5_input-only-debugger_TEST_CANDIDATE.zip` | `input-only-debugger` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.6.6 | `AVITO_FINDER_v0.6.6_trusted-key-dropdown-selection_TEST_CANDIDATE.zip` | `trusted-key-dropdown-selection` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.6.7 | `AVITO_FINDER_v0.6.7_capture-watchdog-and-empty-payload-fence_TEST_CANDIDATE.zip` | `capture-watchdog-and-empty-payload-fence` | EXACT_ARCHIVE_SOURCE | 0 | chatgpt_content.js, manifest.json, service_worker.js |
| 0.6.8 | `AVITO_FINDER_v0.6.8_portal-bound-trusted-dropdown-selection_TEST_CANDIDATE.zip` | `portal-bound-trusted-dropdown-selection` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, chatgpt_content.js, core.js, manifest.json, service_worker.js |
| 0.6.9 | `AVITO_FINDER_v0.6.9_native-select-visible-option_TEST_CANDIDATE.zip` | `native-select-visible-option` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, core.js, manifest.json, service_worker.js |
| 0.7.0 | `AVITO_FINDER_v0.7.0_adaptive-visible-menu-model_TEST_CANDIDATE.zip` | `adaptive-visible-menu-model` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, core.js, manifest.json |
| 0.7.2 | `AVITO_FINDER_v0.7.2_temporal-menu-core-cleanup_TEST_CANDIDATE.zip` | `temporal-menu-core-cleanup` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, manifest.json, service_worker.js |
| 0.7.3 | `AVITO_FINDER_v0.7.3_query-correlated-temporal-menu_TEST_CANDIDATE.zip` | `query-correlated-temporal-menu` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, manifest.json, service_worker.js |
| 0.7.4 | `AVITO_FINDER_v0.7.4_settled-query-menu_TEST_CANDIDATE.zip` | `settled-query-menu` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, manifest.json |
| 0.7.5 | `AVITO_FINDER_v0.7.5_option-click-stage-evidence_TEST_CANDIDATE.zip` | `option-click-stage-evidence` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, manifest.json, service_worker.js |
| 0.7.6 | `AVITO_FINDER_v0.7.6_navigation-safe-click-handoff_TEST_CANDIDATE.zip` | `navigation-safe-click-handoff` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, core.js, manifest.json, service_worker.js |
| 0.7.7 | `AVITO_FINDER_v0.7.7_bound-readonly-target-guard_TEST_CANDIDATE.zip` | `bound-readonly-target-guard` | EXACT_ARCHIVE_SOURCE | 0 | manifest.json, service_worker.js |
| 0.8.0 | `AVITO_FINDER_v0.8.0_clean-run-owned-target-lifecycle_TEST_CANDIDATE.zip` | `clean-run-owned-target-lifecycle` | EXACT_ARCHIVE_SOURCE | 0 | core.js, manifest.json, service_worker.js |
| 0.8.1 | `AVITO_FINDER_v0.8.1_visible-filter-surface_TEST_CANDIDATE.zip` | `visible-filter-surface` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, core.js, manifest.json |
| 0.8.3 | `AVITO_FINDER_v0.8.3_public-listing-passport_TEST_CANDIDATE.zip` | `public-listing-passport` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, core.js, manifest.json |
| 0.8.4 | `AVITO_FINDER_v0.8.4_debugger-click-navigation_TEST_CANDIDATE.zip` | `debugger-click-navigation` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, manifest.json, service_worker.js |
| 0.8.5 | `AVITO_FINDER_v0.8.5_proactive-anchor-navigation_TEST_CANDIDATE.zip` | `proactive-anchor-navigation` | EXACT_ARCHIVE_SOURCE | 0 | avito_content.js, manifest.json, service_worker.js |
| 0.9.0 | `AVITO_FINDER_v0.9.0_route-journal-clean_TEST_CANDIDATE.zip` | `route-journal-clean` | EXACT_ARCHIVE_SOURCE | 3 | avito_content.js, chatgpt_content.js, core.js, manifest.json, popup.css, popup.html, popup.js, service_worker.js |
| 0.9.1 | `AVITO_FINDER_v0.9.1_working-baseline-current-context_TEST_CANDIDATE.zip` | `working-baseline-current-context` | EXACT_ARCHIVE_SOURCE | 2 | avito_content.js, chatgpt_content.js, core.js, manifest.json, popup.css, popup.html, popup.js, service_worker.js |
| 0.9.4 | `AVITO_FINDER_v0.9.4_minimal-login-classifier-fix_TEST_CANDIDATE.zip` | `minimal-login-classifier-fix` | EXACT_ARCHIVE_SOURCE | 3 | avito_content.js, manifest.json |
| 0.9.5 | `AVITO_FINDER_v0.9.5_restore-public-root-bootstrap-route-ledger_TEST_CANDIDATE.zip` | `restore-public-root-bootstrap-route-ledger` | EXACT_ARCHIVE_SOURCE | 3 | manifest.json, service_worker.js |
| 0.9.6 | `AVITO_FINDER_v0.9.6_command-timing-profiles-tab-lifecycle-locked_TEST_CANDIDATE.zip` | `command-timing-profiles-tab-lifecycle-locked` | EXACT_ARCHIVE_SOURCE | 4 | avito_content.js, core.js, manifest.json, service_worker.js |
| 0.9.8 | `AVITO_FINDER_v0.9.8_bulk-public-harvest-parallel-details_TEST_CANDIDATE.zip` | `bulk-public-harvest-parallel-details` | EXACT_ARCHIVE_SOURCE | 7 | avito_content.js, core.js, manifest.json, service_worker.js |
| 0.9.9 | `AVITO_FINDER_v0.9.9_form-submit-reconciliation-immediate-fast-harvest_TEST_CANDIDATE.zip` | `form-submit-reconciliation-immediate-fast-harvest` | EXACT_ARCHIVE_SOURCE | 7 | avito_content.js, core.js, manifest.json, service_worker.js |
| 0.9.10 | `AVITO_FINDER_v0.9.10_bulk-tab-startup-readiness-parent-window_TEST_CANDIDATE.zip` | `bulk-tab-startup-readiness-parent-window` | EXACT_ARCHIVE_SOURCE | 8 | manifest.json, service_worker.js |
| 0.9.11 | `AVITO_FINDER_v0.9.11_event-driven-bulk-dom-harvest_TEST_CANDIDATE.zip` | `event-driven-bulk-dom-harvest` | EXACT_ARCHIVE_SOURCE | 9 | avito_content.js, manifest.json, service_worker.js |
| 0.9.12 | `AVITO_FINDER_v0.9.12_filtered-sequential-captcha-checkpoint_TEST_CANDIDATE.zip` | `filtered-sequential-captcha-checkpoint` | EXACT_ARCHIVE_SOURCE | 9 | avito_content.js, core.js, manifest.json, popup.html, popup.js, service_worker.js |
| 0.9.14 | `AVITO_FINDER_v0.9.14_sort-selection-before-queue_TEST_CANDIDATE.zip` | `sort-selection-before-queue` | EXACT_ARCHIVE_SOURCE | 11 | avito_content.js, core.js, manifest.json, popup.html, popup.js, service_worker.js |
| 0.9.15 | `AVITO_FINDER_v0.9.15_search-card-ranking-before-details_TEST_CANDIDATE (1).zip` | `search-card-ranking-before-details` | EXACT_ARCHIVE_SOURCE | 12 | avito_content.js, core.js, manifest.json, service_worker.js |
| 0.9.15 | `AVITO_FINDER_v0.9.15_search-card-ranking-before-details_TEST_CANDIDATE.zip` | `search-card-ranking-before-details` | EXACT_ARCHIVE_SOURCE | 12 | avito_content.js, core.js, manifest.json, service_worker.js |
| 0.9.18 | `AVITO_FINDER_v0.9.18_runtime-card-gap-control_TEST_CANDIDATE.zip` | `runtime-card-gap-control` | EXACT_ARCHIVE_SOURCE | 15 | avito_content.js, core.js, manifest.json, service_worker.js |
| 1.0.0 | `AVITO_FINDER_v1.0.0_assistant-directed-generic-search-collector_TEST_CANDIDATE.zip` | `assistant-directed-generic-search-collector` | EXACT_ARCHIVE_SOURCE | 10 | avito_content.js, core.js, manifest.json, popup.html, service_worker.js |
| 1.0.1 | `AVITO_FINDER_v1.0.1_popup-assistant-protocol-prompt_TEST_CANDIDATE.zip` | `popup-assistant-protocol-prompt` | EXACT_ARCHIVE_SOURCE | 11 | manifest.json, popup.css, popup.html, popup.js |

### Milestones confirmed by exact archived code

- v0.2.0 assistant/command anchoring; v0.2.1 Writing Block capture.
- v0.4.3 page-ready lineage; v0.5.0 DIALOG_VISIBLE.
- v0.9.0 optional-login markers; v0.9.10 about:blank mechanism; v0.9.12 sequential machinery.
- v1.0.0 explicit listing queue. No proxy markers through exact v1.0.1.

## 4. v1.0.2–v1.0.38 authority ledger

| Version | Authority | Result |
|---|---|---|
| 1.0.2 | VERSION_NOT_CONFIRMED | Нет version-specific archive/commit/history-doc authority; существование отдельного релиза не предполагается. |
| 1.0.3 | VERSION_NOT_CONFIRMED | Нет version-specific authority. |
| 1.0.4 | VERSION_NOT_CONFIRMED | Нет version-specific authority. |
| 1.0.5 | VERSION_NOT_CONFIRMED | Нет version-specific authority. |
| 1.0.6 | PARTIAL_HISTORICAL_AUTHORITY | Materializer/README заявляет SHA 32e1523e…, но preserved pre-materialization Base64 stream даёт SHA 0b6adbc7… и не является валидным exact package; byte-exact source не подменяется. |
| 1.0.7 | DOC_HASH_AUTHORITY_SOURCE_UNAVAILABLE | Page-ready DOM fallback + navigation commit guard + bounded polling; manual CAPTCHA; historical ZIP SHA 6f2e83a2…; 55/55. |
| 1.0.8 | DOC_AUTHORITY_SOURCE_UNAVAILABLE | Первая Proxy.Market версия: Avito-only PAC, manual profiles/auth, session secrets, без auto-rotation. |
| 1.0.9 | DOC_AUTHORITY_SOURCE_UNAVAILABLE | Proxy Data Saver/traffic meter; DNR heavy-media only; no auto-rotation. |
| 1.0.10 | DOC_AUTHORITY_SOURCE_UNAVAILABLE | Key/package discovery; дефект: package lookup мог ложно пометить валидный key invalid; aggressive pagination. |
| 1.0.11 | DOC_AUTHORITY_SOURCE_UNAVAILABLE | Key validity отделена от package discovery; packages best-effort warning. |
| 1.0.12 | DOC_AUTHORITY_SOURCE_UNAVAILABLE | Manual endpoint create; documented rotation semantics: -1 sticky, 0 every request; no auto IP-block creation. |
| 1.0.13 | DOC_AUTHORITY_SOURCE_UNAVAILABLE | Residential package/profile compatibility and gateway normalization; manual switch. |
| 1.0.14 | BEHAVIORAL_AUTHORITY_FROM_V15 | Exact source не найден; predecessor behavior: credentials once/request and HTTPS-only, multiple Chrome challenges leaked to native prompt. |
| 1.0.15 | DOC_TEST_AUTHORITY_SOURCE_UNAVAILABLE | Auth fix: up to 3 matching challenges, HTTP+HTTPS, challenger bound; 93/93. |
| 1.0.16 | DOC_TEST_AUTHORITY_SOURCE_UNAVAILABLE | Proxy UI/storage cleanup; regression: user_started=true overblocked proxy mutation; 100/100. |
| 1.0.17 | DOC_TEST_AUTHORITY_SOURCE_UNAVAILABLE | State-specific proxy mutation gate; 101/101. |
| 1.0.18 | DOC_TEST_AUTHORITY_SOURCE_UNAVAILABLE | Visible AVITO_IP_BLOCK + bounded reload; defect: new timeOrigin/document mistaken for recovery; 106/106. |
| 1.0.19 | DOC_TEST_AUTHORITY_SOURCE_UNAVAILABLE | bypassCache + main-frame telemetry; proves fresh request, not new egress; 108/108. |
| 1.0.20 | VERSION_SPECIFIC_AUTHORITY_NOT_FOUND | Git/File Library search found no version-specific authority; no changes assigned. |
| 1.0.21 | VERSION_SPECIFIC_AUTHORITY_NOT_FOUND | Git/File Library search found no version-specific authority; no changes assigned. |
| 1.0.22 | LIVE_LOG_AUTHORITY_SOURCE_UNAVAILABLE | Profile failover every-request→sticky on same gateway without measured egress; profile change incorrectly stood in for new IP; readiness/network race. |
| 1.0.23 | EXACT_SOURCE | Verify→rotate→verify with IP canaries and transport epochs; fallback creates rotation=0 endpoint. Missing invariant: changed canary IP != stable multi-request Avito session. |
| 1.0.24 | EXACT_SOURCE | Collection-first IP-block recovery/replay; preserves counter; inherits rotation=0 fallback. |
| 1.0.25 | PRESERVED_TEST_AUTHORITY | Unified recovery/replay/cancellation/egress/queue/version/provider-create regression family. |
| 1.0.26 | PRESERVED_TEST_AUTHORITY | Report delivery: retry only proven pre-click; uncertain/sent read-only; no blind second Send. |
| 1.0.27 | PRESERVED_TEST_AUTHORITY | Durable navigation intent + report send receipt/ACK budgets + op fencing. |
| 1.0.28 | PRESERVED_TEST_AUTHORITY | Unified 429/rate-limit recovery, bounded/cancellable. |
| 1.0.29 | PRESERVED_TEST_AUTHORITY | Contract audit: queue persistence, Retry-After, proxy restore, provider POST uncertainty, same-chat/report/direct-delivery constraints. |
| 1.0.30 | PRESERVED_TEST_REPRO_AUTHORITY | about:blank trampoline regression: pendingUrl=about:blank prevented target dispatch; cursor=0 transient_blank timeout. |
| 1.0.31 | PATCH_DOC_TEST_AUTHORITY | Exact-target child create restored; durable target intent/receipt; owned-child adoption; legacy blank migration; proxy remains transport. |
| 1.0.32 | PATCH_DOC_TEST_AUTHORITY | Bounded report Send discovery/manual-send reconciliation; no blind resend. |
| 1.0.33 | PATCH_DOC_TEST_AUTHORITY | Exact Writing Block-only execution + ordinary Markdown zero-command + manual CAPTCHA re-anchor. |
| 1.0.34 | EXACT_SOURCE | Writing Block body-stability/finality + validation-before-ownership + safe same-turn supersede; 128 scenario matrix. |
| 1.0.35 | EXACT_SOURCE_REJECTED | Manifest 1.0.35 but actual Avito adapter PING 1.0.34; aggregate 9 groups PASS/15 FAIL; rejected. |
| 1.0.36 | EXACT_SOURCE_R2 | Minimal manifest/adapter identity fix; R1 test-VM disposal hang; R2 test-only cleanup; 35/35; proxy runtime unchanged. |
| 1.0.37 | EXACT_SOURCE_LIVE_REJECTED | Proxy telemetry/state integrity. Offline 35/35, live recovery exhausted at TOP queue cursor 0/3. |
| 1.0.38 | EXACT_SOURCE_CURRENT_MAIN | Recovery-created endpoint rotation 0→-1 sticky; exact provider request-body RED/GREEN; 35/35; Node 368/368; remote readback; live acceptance NOT_RUN. |

## 5. Critical state-machine evolution

| State machine | Evolution | Permanent boundary |
|---|---|---|
| ChatGPT capture/validator | v0.2.x anchor/Writing Block → v1.0.33 ordinary zero-command → v1.0.34 body stability | Writing Block only; ordinary text/code never executable; toolbar readiness != body finality. |
| Navigation/owned child | early visible UI → v0.7/0.8 handoff/ownership → v1.0.30 blank regression → v1.0.31 exact-target restore | Proxy cannot own target navigation; exact target + durable intent/receipt. |
| Queue/cursor | v0.9.12 sequential → v1.0.0 explicit queue → v1.0.25+ checkpoint authority | Assistant order preserved; observation/cursor before close; recovery never resets baseline. |
| Report delivery | early reports → v1.0.26/27 receipts → v1.0.32 manual reconciliation | Never blind-resend uncertain report; same pinned chat. |
| Proxy/auth | v1.0.8 Avito-only PAC → v1.0.12 endpoint semantics → v1.0.15 auth → v1.0.17 mutation gate | Proxy is transport; exact PAC ownership; challenger-bound auth; mutate by active step. |
| Rotation/egress | v1.0.12 -1 sticky/0 every request → v1.0.22 bad failover inference → v1.0.23 canary proof + rotation0 fallback → v1.0.38 sticky fallback | profile/request/canary IP/session stability are separate evidence levels. |
| IP/rate/CAPTCHA | v1.0.18 IP block → v1.0.19 request freshness → v1.0.23 egress → v1.0.25 unified recovery → v1.0.28 429 → v1.0.33 manual CAPTCHA → v1.0.37 mixed telemetry | CAPTCHA manual; bounded recovery; durable provider intent; exact terminal reason. |

## 6. Real defect → regression closure

| Exposed | Defect | Closed | Regression authority |
|---|---|---|---|
| v1.0.6→7 | tab.status complete only; usable DOM loading timed out | v1.0.7 | DOM-ready fallback + commit guard |
| v1.0.14 | one auth/request + HTTPS-only | v1.0.15 | multi-challenge HTTP/HTTPS challenger-bound |
| v1.0.16 | user_started conflated open run with active step | v1.0.17 | state-specific mutation gate |
| v1.0.18 | new document/timeOrigin treated as recovery | v1.0.19 | bypassCache/main-frame freshness |
| v1.0.19/22 | fresh request/profile change treated as egress change | v1.0.23 | measured canary egress, no reload without proof |
| v1.0.22 | readiness/network race + unproven failover egress | v1.0.23/25 | recovery/readiness evidence tests |
| v1.0.23 | rotation=0 can change canary IP but destabilize multi-request Avito session | v1.0.38 | provider create body rotation=-1 + sticky reconcile |
| v1.0.30 | about:blank pendingUrl prevented target dispatch | v1.0.31 | exact target create + transient-blank reproduction |
| v1.0.31 | manual report Send/restart uncertainty | v1.0.32 | send intent/receipt read-only reconciliation |
| v1.0.32 | ordinary code block mistaken for Writing Block; CAPTCHA anchor gap | v1.0.33 | Writing Block-only + CAPTCHA handoff |
| v1.0.33 | toolbar ready before Writing Block body final | v1.0.34 | body fingerprint stability + validation before ownership |
| v1.0.35 | manifest != actual adapter PING | v1.0.36 | actual adapter identity regression |
| v1.0.36 live | proxy diagnostic level/state defects | v1.0.37 | 10 static + 6 dynamic telemetry/state tests |
| v1.0.37 live | endpoint rotation semantics untested | v1.0.38 | exact provider create HTTP-body regression |

## 7. Исторические границы

- v1.0.6 exact package unresolved: advertised SHA `32e1523e1f0d9d8ff0b5f71f6e9df146542f80327628cd48d35bff73d90d31e9`, preserved stream SHA `0b6adbc72e4f0d4e935092b8da8aab8ab263c642d1541b2ce262565d731d9b63`, hash_match=False, extractable=False.
- v1.0.2–v1.0.5: VERSION_NOT_CONFIRMED; не найдено отдельной authority.
- v1.0.20/v1.0.21: VERSION_SPECIFIC_AUTHORITY_NOT_FOUND; изменения не приписываются.
- v1.0.14, v1.0.22 and v1.0.25–v1.0.33 have bounded non-exact authority as documented in the ledger.

## 8. Process failures found

1. Выборочный анализ «ключевых» версий пропустил inherited rotation=0 lineage.
2. v1.0.23 regression measured canary egress, not stable Avito session — wrong abstraction level for the eventual live failure.
3. Offline PASS repeatedly did not equal installed acceptance; v1.0.37 is the clearest example.
4. Harness errors in v1.0.37/v1.0.38 and this audit are preserved separately and never counted as runtime evidence.
5. Source availability gaps are explicit; no missing version/source is silently invented.

## 9. Rule 20 acceptance

`FULL_HISTORY_AUDIT=PASS` because every discovered historical archive variant, reachable runtime/test/history commit, ref and PR was inventoried; exact code was read/diffed where available; source gaps were exhaustively marked; known live defects were mapped to regression closure; and audit-only gates prove runtime remained unchanged.

**This PASS does not accept v1.0.38 live.** v1.0.38 remains `NOT_RUN / LIVE_UNVERIFIED` until installed Chrome E2E.

## 10. Evidence

- Current-history scanner: run `34740844051`.
- Early historical scan: run `34741618622` (first harness failure retained; second run success and v1.0.6 mismatch preserved).
- Nested exact archive scan: run `34741795769`.
- Machine evidence saved alongside this report: `FULL_HISTORY_RAW.json`, `NESTED_HISTORY.json`, `EARLY_HISTORY.json`, summaries and adjacent-diff index.
- Rule 20: `PATCH_ENGINEERING_RULES.md`.
