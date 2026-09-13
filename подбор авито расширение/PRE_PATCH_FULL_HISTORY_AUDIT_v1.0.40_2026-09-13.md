# PRE-PATCH FULL HISTORY AUDIT — Avito Finder v1.0.40 gate

**Дата:** 2026-09-13  
**Статус:** `FULL_HISTORY_AUDIT=PASS`  
**Target patch:** v1.0.40  
**Current installed/live authority:** v1.0.39 = `FAIL` for the multi-tab explicit-page scenario.  
**Current main before this audit file:** `024dfb467eb4e59bbfdf9564f71af0b5bd2b3370`.

## 1. Composite full-history authority

This is a **full-history** Rule-20 gate, not a selective last-version review. The already completed exhaustive audit is incorporated as immutable authority in full, and every repository/history addition after that gate is audited below.

Normative inherited authority, unchanged and still fully applicable:

- `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md` — blob SHA `2fea29810531683f4c01e32540be82fe9272c997`.
- `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.json` — blob SHA `33a17a765935ce64a30e3fa8f88457ea94b4ea3a`.
- Rule-20 closure commit: `893f5ac10f88dda68758d725e0942c9f3cf3c2c9`.

That authority already inventories and reads/diffs the complete discovered historical lineage:

- 61 `History.zip` archive variants;
- 56 unique archived versions v0.1.0–v1.0.1;
- 60 exact historical runtime manifests;
- 54 unambiguous historical adjacent runtime diffs;
- current exact roots then available: v1.0.23, v1.0.24, v1.0.34–v1.0.38;
- all known source gaps explicitly bounded (`SOURCE_UNAVAILABLE`/version authority not found), never reconstructed by guess;
- the full v0.1.0–v1.0.38 version table, critical state-machine evolution matrix, real-defect→regression matrix and source-gap ledger remain normative without omission.

No pre-v1.0.39 historical row is replaced or narrowed by this file.

## 2. Repository inventory after the previous full-history closure

Current branch inventory observed before any v1.0.40 executable change (12 branches):

`audit/full-history-2026-09-13`, `build/avito-v136-r2`, `docs/patch-rules-2026-09-12`, `fix/avito-v137-first-ipblock-rotation`, `fix/prompt-capture-contract-2026-09-12-rules`, `fix/prompt-capture-contract-2026-09-12`, `fix/v137-proxy-recovery-integrity-2026-09-13`, `fix/v138-avito-sticky-recovery-2026-09-13`, `fix/v139-exact-requested-tab-disambiguation-2026-09-13`, `main`, `rules/patch-contract`, `tmp-do-not-use`.

Current PR inventory: PR #1–#5. PR #5 is the only new PR after the previous exhaustive audit and was merged as v1.0.39.

All post-audit commits relevant to Avito Finder lineage were read from the current repository history through the present main head, including the v1.0.39 live evidence, RED, materializer, packager, CI/harness diagnostics, exact release persistence, remote readback, merge/main-authority receipts, startup/progress docs and the newly persisted installed-live failure. Important commits include:

`0b1bed6a57b7bea0deb263bec3678b8c6fe4e01b`, `f253ddbad90f313470804ea3136f56b25642cb7a`, `ff1fc3c0729afafc5666524e894b28b93c0f26e2`, `0d31f8caf12f6bdfbb305f6ce2ed596cdbcd3e59`, `be142eacb4ffba407b5ecb31dd467299fb6370b4`, `e0ea4b184a3d26397f825704a108220982b211fb`, `47691ce1cf5632c31b58e48953765b471c3ffe72`, `311466ae7b5edab17c319738480fa9f2a0c308d71b`, `fa4736672ddab17c319738480fa9f2a0c308d71b`, `542ae39e40bc4ac7d710a7f81c3029265d1e87bd`, `b4114fbeb06db50d1a3b2205ec390b835b57820c`, `8248b0075ce99a62ba47136faf0c180c5a8e1d41`, `8a5c9b9e8333ba617e6420db4352d972e3f6f0fd`, `51f811987013035c44641c1864aed52829fa3985`, `2da49040fa954524db0d804a25c7d5e967d8cd98`, `6ef898e5834d2af1e9acb3fafe56e3c1cd21443a`, `02b999b3104ec46bff1bdd23cb44b7edb087d823`, `38de00432960a109e7fd82804bced74c4bbe9d4c`, `024dfb467eb4e59bbfdf9564f71af0b5bd2b3370`.

## 3. v1.0.39 exact-source audit

v1.0.39 exact artifact authority:

- ZIP: `AVITO_FINDER_v1.0.39_EXACT_REQUESTED_TAB_DISAMBIGUATION_2026-09-13.zip`;
- SHA-256: `a4a0ae626de4692c62cd76d87be19e34749b488e76afa2764828a025db08bb98`;
- bytes: `492784`;
- source files: `148`;
- exact final source was independently read back from GitHub;
- final grouped QA: 35/35;
- final Node aggregate: 369/369;
- targeted exact-tab test: 5/5;
- production runtime changed from v1.0.38 only in `service_worker.js`, `manifest.json`, `avito_content.js`.

Production behavior introduced in `service_worker.js`:

1. preserve the historical unique active-Avito-tab preference;
2. when there is no unique active Avito tab and the Writing Block supplies `requestedUrl`, reuse exactly one existing Avito tab whose normalized visible route equals that requested URL;
3. duplicate exact matches remain ambiguous;
4. zero exact matches among multiple Avito tabs remain ambiguous;
5. a single Avito tab is reused as before;
6. zero Avito tabs may bootstrap a new public root on the first user-started target binding.

The first full v1.0.39 gate `34743154320` remains historical FAIL (33/35). The subsequent A/B run proved the failures were test-harness integration/cold-start-boundary issues; runtime was unchanged. The final authority run `34743734524` passed worktree, final ZIP, Node aggregate, targeted test and independent remote readback.

## 4. Installed v1.0.39 live result — NEW FAIL

Live task: `af-20260913075253-v24r`.

Writing Block supplied an explicit public Dell listing URL and an explicit three-item queue. Installed Finder reported:

- version `1.0.39`;
- stage `COMMAND_CAPTURED`;
- reason `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`;
- recovery attempts `0`;
- cursor unused;
- cards read `0`;
- no Avito mutation.

Evidence is persisted in:

- `live_evidence/2026-09-13/V139_INSTALLED_AMBIGUITY_AFTER_EXACT_TAB_PATCH.json`;
- `releases/v1.0.39/LIVE_ACCEPTANCE_STATE_2026-09-13.json` now marks v1.0.39 installed acceptance `FAIL`.

The live report does **not** prove whether the selector saw zero exact route matches or duplicate exact route matches. That distinction is explicitly not guessed.

## 5. Root-cause state-machine audit

The defect is broader than either subcase above and is fully demonstrated by the live state plus exact source:

`explicit public requested URL + first user-started target binding + multiple visible Avito candidates + no uniquely reusable target` currently ends in terminal ambiguity **before any Avito action**, even though the command already provides the complete public target URL.

Exact v1.0.39 code path:

- `selectVisibleAvitoTab(windowId, requestedUrl)` throws `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB` whenever multiple candidates remain without exactly one reusable match;
- `ensureAvitoTarget()` only calls `createInitialPublicAvitoTab()` when the selector throws `AVITO_VISIBLE_TAB_REQUIRED_OPEN_ONE_PUBLIC_AVITO_TAB` (zero candidates);
- therefore explicit requested-page authority is discarded at the allocation layer whenever there are multiple non-uniquely-reusable candidates.

This is the same abstraction family that v1.0.39 only partially corrected: v1.0.38 discarded the requested URL entirely during selection; v1.0.39 consults it for reuse but still fails to allocate a dedicated run-owned tab when safe reuse is impossible.

## 6. v1.0.40 permitted behavioral correction

The next patch may change only this target-allocation boundary:

- preserve unique active-tab preference;
- preserve unique exact-requested existing-tab reuse;
- preserve single-tab reuse;
- preserve zero-tab bootstrap;
- **NEW:** if selection is ambiguous but a valid explicit public `requestedUrl` exists, this is the first user-started binding, and navigation is allowed, do not guess which existing tab to mutate; instead create one new dedicated public Avito tab and route that new run-owned tab to the explicit requested URL;
- never create this fallback for a diagnostic with navigation forbidden;
- never create it after the run has already bound an Avito target;
- no queue/cursor, report, proxy, recovery, CAPTCHA, capture/validator or delivery semantics may change.

This avoids both unsafe choices: it neither guesses among unrelated tabs nor blocks a command whose target is already explicitly supplied.

## 7. Required RED before runtime change

After this audit is persisted/read back, the v1.0.40 RED must execute against exact v1.0.39 and prove:

1. selector ambiguity + explicit public requested URL + first user-started binding currently throws instead of allocating a dedicated tab (RED on v1.0.39);
2. unique exact requested route is still reused;
3. unique active Avito preference is preserved;
4. single Avito tab behavior is preserved;
5. diagnostics with navigation forbidden do not allocate a tab;
6. already-bound runs do not allocate another target tab.

Only after that RED may runtime/manifest/test expectations for v1.0.40 change.

## 8. Regression check against all prior history

The permitted correction does not return any behavior already rejected historically:

- it does not revive arbitrary tab guessing;
- it does not weaken exact-target navigation/owned-tab durability from v1.0.31;
- it does not alter Writing Block-only capture from v1.0.33/v1.0.34;
- it does not alter queue/cursor checkpoint semantics;
- it does not alter report-send receipts/reconciliation;
- it does not alter proxy ownership, auth, rotation, egress or recovery;
- it does not automate CAPTCHA;
- it does not interpret local/offline PASS as installed acceptance.

The dedicated-tab fallback is safer than selecting an unrelated existing tab because it leaves all ambiguous existing tabs untouched.

## 9. Rule-20 verdict

`FULL_HISTORY_AUDIT=PASS` for the v1.0.40 pre-patch gate.

Reason: the complete prior exhaustive audit remains incorporated as immutable normative authority; every release/PR/branch/commit/source/test/runtime change added after that authority was audited through exact v1.0.39 and the current main live-failure receipts; v1.0.39 exact source and tests were read; its new runtime contract and newly exposed installed failure were reconciled with the full historical state-machine matrix; source gaps remain unchanged and explicit.

This PASS authorizes creation of the v1.0.40 RED test only. It does **not** accept v1.0.39 and it does **not** accept any future v1.0.40 build until installed Chrome E2E passes.
