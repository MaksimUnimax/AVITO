# PRE-PATCH FULL HISTORY AUDIT — Avito Finder v1.0.42 gate

**Date:** 2026-09-13  
**Status:** `FULL_HISTORY_AUDIT=PASS`  
**Prospective target:** v1.0.42 — ChatGPT Writing Block local-body extraction oscillation / capture livelock only.  
**Installed target authority:** exact v1.0.41.  
**Main HEAD before this audit file:** `0ce12d054faf1efe46e4884afe335a2f9eaa9078`.

> This audit authorizes RED creation only. It does not authorize a runtime patch, release ZIP, manifest bump or acceptance claim.

## 1. Full-history authority inherited without narrowing

This is a composite Rule-20 audit. It incorporates the already completed exhaustive historical authority in full and audits every later patch/release/live failure through the current exact v1.0.41 state.

Inherited normative authorities:

1. `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md/json` — exhaustive v0.1.0–v1.0.38 authority.
2. `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.md/json` — exact v1.0.39, installed v1.0.39 FAIL and first-target allocation correction authority.
3. `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.41_2026-09-13.md/json` — exact v1.0.40, installed IP-firewall classifier FAIL and classifier-only correction authority.
4. `PATCH_ENGINEERING_RULES.md` — permanent Rules 1–20.

The base exhaustive authority covers, without selection:

- 61 historical `History.zip` variants;
- 56 unique archived pre-1.0 versions from v0.1.0 through v1.0.1;
- 60 exact historical runtime manifests;
- 54 unambiguous adjacent runtime diffs;
- 352 reachable Git commits at the exhaustive-audit checkpoint;
- 193 runtime/test/history commits;
- all then-discovered refs/PRs;
- two distinct v0.6.1 runtime variants preserved separately;
- complete critical state-machine evolution and defect→regression ledgers;
- explicit source gaps preserved rather than reconstructed by guess.

No prior row is replaced or narrowed by this audit.

## 2. Current repository delta after the verified v1.0.41 merge

v1.0.41 merge commit: `b259a1959c4ea72b98fc2afd5c7879f357ca3e92`.

Main before this audit: `0ce12d054faf1efe46e4884afe335a2f9eaa9078`.

Git compare: `ahead_by=13`, `behind_by=0`.

Changed paths after the v1.0.41 merge are authority/progress/live-evidence files only:

- `AGENTS.md`;
- live-evidence JSON for v1.0.41 recovery exhaustion, Mini ITX IP block, Writing Block hang and corrected payload-oscillation evidence;
- v1.0.40/v1.0.41 live-acceptance receipts;
- v1.0.41 main release/readback receipts;
- current-version/progress documentation.

**No runtime JS, manifest, queue/navigation, ChatGPT capture adapter, service worker or proxy manager changed after the verified v1.0.41 release.** Therefore exact v1.0.41 remains the correct RED target.

Current branch inventory contains 17 branches, including the preserved historical audit/build/rule branches and the patch branches through `fix/v141-ip-block-firewall-classifier-2026-09-13`. PR #7 is the v1.0.41 classifier merge; earlier PRs remain historical authority.

## 3. Patch-by-patch defect history and what each patch actually fixed

| Exposed / patch | Real defect or objective | Closure / invariant | What was wrong in the prior analysis/process |
|---|---|---|---|
| v1.0.6→7 | `tab.status=complete` was treated as usable DOM readiness | DOM-ready fallback + commit guard | readiness was measured at the browser-tab layer rather than usable DOM |
| v1.0.14→15 | proxy auth assumed one auth/request and HTTPS-only behavior | multi-challenge HTTP/HTTPS challenger-bound auth | auth state machine was oversimplified |
| v1.0.16→17 | `user_started` conflated an open run with an active mutable step | state-specific mutation gate | mutation authority was inferred from the wrong state variable |
| v1.0.18→19 | new document/timeOrigin was treated as successful connection recovery | bypass-cache/main-frame request freshness | document freshness was confused with network recovery |
| v1.0.19/22→23 | fresh request/profile change was treated as egress change | measured canary egress | profile/request evidence was stronger than the proof actually available |
| v1.0.22→23/25 | readiness/network race and unproven failover egress | recovery/readiness evidence separation | recovery state and target readiness were entangled |
| v1.0.23→38 | `rotation=0` could change a canary IP while destabilizing a multi-request Avito session | recovery-created endpoint must be sticky (`rotation=-1`) | selective history review missed inherited bad policy; canary-IP success was incorrectly treated as stable Avito-session success |
| v1.0.30→31 | `about:blank`/pendingUrl path could wait without dispatching the exact listing target | exact target child-tab creation + durable target intent | navigation lifecycle had been moved behind an unnecessary blank-tab handshake |
| v1.0.31→32 | report Send/restart uncertainty could cause unsafe resend/reconciliation behavior | durable send intent/receipt and read-only reconciliation | irreversible Send outcome had insufficient journaling |
| v1.0.32→33 | ordinary code block could be mistaken for executable Writing Block; CAPTCHA handoff anchor gap | Writing Block-only command contract + manual CAPTCHA handoff | ChatGPT rendered controls were not treated as a strict API boundary |
| v1.0.33→34 | toolbar/Copy readiness could appear before Writing Block body was final | repeated local body fingerprint stability before validation | control readiness was used as content-finality evidence |
| v1.0.34 lineage | body-stability correction introduced/solidified an empty-payload retry branch that clears `candidateFirstSeen` | **not yet closed** | it solved truncation but did not define a terminal policy for intermittent local-body unavailability; first exact proof of the defective branch is v1.0.34 |
| v1.0.35→36 | manifest version and actual adapter PING version diverged | exact adapter identity regression | packaging/identity consistency was not verified at the actual adapter boundary |
| v1.0.36→37 | proxy telemetry/state mixed config, request, egress and target evidence | separate PAC/config, probe, target and attempt telemetry; 10 static + 6 dynamic tests | diagnostics were stronger than measured evidence; offline PASS was overvalued |
| v1.0.37→38 | recovery-created endpoint used wrong rotation semantics | sticky endpoint create/reconcile | historical provider semantics existed but were not enforced as a permanent regression |
| v1.0.38→39 | exact requested listing URL existed but multi-tab selector ignored it | unique exact requested-route reuse | patch targeted tab ambiguity but only at selector reuse layer |
| v1.0.39→40 | unique-exact reuse still failed when no existing tab was safely reusable | dedicated run-owned tab allocation for explicit first target | v1.0.39 patch scope was too narrow; it fixed one subcase, not the full first-target allocation state |
| v1.0.40→41 | IP-firewall helper text mentioned a future CAPTCHA; broad text regex set `captcha=true` and blocked historical IP recovery | strong IP heading remains IP-block unless concrete CAPTCHA evidence exists | test asserted worker recovery structurally but never passed the real provider DOM through the classifier; Rules 2/16 |
| v1.0.41 live recovery | classifier now reaches `AVITO_IP_BLOCK`, but Mini ITX fresh navigation exhausted 4 recovery attempts | **unresolved separate proxy/egress track** | classifier patch itself did what it claimed; the next network layer remains unresolved and must not be mixed into capture patch |
| v1.0.41 live capture | visible Writing Block/Copy can enter an endless empty-body/non-empty-body restart loop | **current prospective v1.0.42 target** | existing body-finality logic has no bounded terminal state for intermittent local extraction failure; Rule 15 violation |

## 4. Current live Writing Block failure — corrected causal chain

Task: `af-20260913121226-xf3c`.
Assistant turn: `request-6aa685f0-e0cc-83ea-ad54-8d1e253ac1bf-17`.

The live journal repeatedly shows the same two states on the same Writing Block:

1. `PROMPT_EMPTY_WRITING_BLOCK_IGNORED` with:
   - `copy_ready=true`;
   - `writing_block=true`;
   - `payload_bytes=0`;
   - `payload_extracted=false`;
   - `payload_extraction_error=WRITING_BLOCK_LOCAL_BODY_UNAVAILABLE`.
2. roughly 0.7 seconds later `PROMPT_DOM_STABILITY_STARTED` with:
   - `payload_bytes=2447`;
   - `payload_extracted=true`.
3. roughly two seconds later the local body can be unavailable again, returning to step 1.
4. this repeats until a manual user turn interrupts polling.

Exact v1.0.41 `chatgpt_content.js` explains the loop:

- after structural settle, `confirmLocalWritingBlockCopyAndExtract()` attempts local-body extraction;
- if empty/unavailable, `PROMPT_EMPTY_WRITING_BLOCK_IGNORED` executes;
- that branch explicitly sets `candidateFirstSeen = null`;
- next non-empty observation therefore satisfies `!candidateFirstSeen`, so `structuralChanged=true` even if the actual Writing Block identity is unchanged;
- `PROMPT_DOM_STABILITY_STARTED` restarts the 2-second gate;
- there is no overall attempt/time budget for this empty/non-empty oscillation.

This is sufficient to explain the observed live livelock without any assistant-button mutation.

### Superseded earlier interpretation

`V141_WRITING_BLOCK_DOM_STABILITY_HANG_LIVE_FAIL_2026-09-13.json` correctly recorded the visible hang but only proposed unrelated assistant-button churn as a `HIGH_CONFIDENCE_CAUSAL_CANDIDATE_PENDING_SIGNATURE_DIFF_CAPTURE`.

That causal interpretation is now superseded by `V141_WRITING_BLOCK_PAYLOAD_EXTRACTION_OSCILLATION_LIVE_FAIL_2026-09-13.json`.

The button-signature issue remains a **secondary real design risk**: `detectCopyReadiness()` snapshots every button in the whole assistant section, and `writingBlockStructuralSignature()` includes all those snapshots. It therefore deserves its own RED regression, but it is not required to explain this live loop.

## 5. Historical origin of the current capture bug

The same empty-payload branch that performs:

`candidateFirstSeen = null -> schedulePromptCheck(...)`

is present in exact v1.0.34 `chatgpt_content.js` and remains present in exact v1.0.41.

Historical authority says v1.0.34 was the patch for `toolbar ready before Writing Block body final`. The correction was valid for truncation, but its retry policy did not distinguish:

- a genuinely not-yet-rendered/empty Writing Block shell;
- transient loss of local body extraction after the same block was already observed non-empty;
- permanent extraction failure.

Because exact v1.0.33 source is not available with the same confidence in the full authority, this audit does **not** claim the branch first appeared in v1.0.34. The safe boundary is: **v1.0.34 is the earliest exact source in which this defective retry behavior is proven.**

## 6. Separate live network failure — do not merge it into v1.0.42

The same v1.0.41 installed run also exposed a separate network/recovery failure:

- Dell current-page direct read succeeded;
- Mini ITX fresh navigation reached `AVITO_IP_BLOCK`;
- automatic recovery exhausted 4 attempts;
- post-failure DOM still showed `Доступ ограничен: проблема с IP`;
- no CAPTCHA challenge was visible.

Current popup evidence later shows an active `Каждый запрос` profile, valid API key/package, and `IP probe 31.131.200.254 -> 31.131.200.254` with no confirmed change and `Avito: PENDING`, attempt 4. This is useful evidence but does not by itself prove which recovery substep failed during the earlier attempts.

The proxy/egress issue is therefore a **separate state machine**. Rule 8 forbids mixing a speculative proxy fix into the capture patch.

## 7. Where the assistant/process failed

This audit records not only runtime bugs but the repeated engineering mistakes that caused unnecessary patch cycles.

1. **Selective history review.** Earlier analysis focused on recent/key versions and missed that `rotation=0` lineage was inherited since at least v1.0.23 despite documented `-1=sticky / 0=every request` semantics.
2. **Wrong abstraction tests.** Canary-IP change was accepted as evidence for a stable multi-request Avito session.
3. **Offline PASS was repeatedly overvalued.** Several builds had large green suites while installed Chrome still exposed new failures.
4. **v1.0.39 was too narrow.** It fixed unique exact-tab reuse but not the whole explicit first-target allocation state machine, forcing v1.0.40.
5. **v1.0.40 tests missed the real provider classifier fixture.** Structural worker tests stayed green while live DOM was misclassified.
6. **Current operator sent non-executable Markdown/ordinary text while Finder was waiting for Writing Block**, producing avoidable `ASSISTANT_WRITING_BLOCK_REQUIRED` reports.
7. **Current operator sent invalid DIAGNOSE_DOM action prose**, causing `DIAGNOSTIC_ACTION_NOT_ALLOWED`, despite the parser contract being available.
8. **Current operator guessed unsupported AVITO_UI phrases multiple times** before using the actual accepted `Собери паспорт лота` grammar.
9. **Current operator sent a WAIT/hold AVITO_UI plan on a blocked page.** Preflight runs before WAIT, so that command could re-enter recovery instead of doing a harmless hold.
10. **Current operator retried the 3-item TOP queue before the fresh-navigation recovery layer was understood**, immediately reproducing recovery exhaustion.
11. **Current causal diagnosis was premature.** The screenshot-based explanation blamed unrelated assistant-button churn before the live journal was read. That violated Rule 7's required causal chain. The journal now proves the stronger payload-extraction oscillation mechanism.
12. **Earlier v1.0.40 interpretation incorrectly called the IP-firewall landing a real CAPTCHA** and proposed manual CAPTCHA handling; later exact classifier audit corrected this.

These are assistant/process failures, not owner errors.

## 8. Required RED authority before any v1.0.42 runtime change

Exact v1.0.41 must fail a new regression that reproduces the live mechanism:

1. one anchored assistant turn contains a visible Writing Block and ready local Copy control;
2. the same block body is non-empty and valid on one sample;
3. a subsequent local extraction returns `WRITING_BLOCK_LOCAL_BODY_UNAVAILABLE`/empty without changing the block identity;
4. a later sample returns the same non-empty payload;
5. exact v1.0.41 must demonstrate that this sequence resets `candidateFirstSeen`, restarts the structural gate and can repeat instead of reaching a terminal state.

Separate secondary RED:

- keep Writing Block identity/body stable;
- continuously mutate unrelated assistant-turn controls;
- prove whether current all-button `structural_signature` can independently restart the structural gate.

No runtime change is authorized until these REDs exist and are persisted.

## 9. Permitted v1.0.42 behavioral boundary after RED

If RED confirms the exact mechanism, the patch may change **only ChatGPT capture stability/extraction behavior plus release identity/tests**.

Required invariants:

- an actually empty Writing Block shell is never executed;
- a transient local-body extraction miss does not erase already-proven Writing Block structural identity and restart the entire structural gate blindly;
- payload still requires repeated identical fingerprints before validation;
- unrelated assistant-turn controls must not decide Writing Block-local stability;
- capture has a bounded terminal budget: success, retryable/manual pause, or `FAILED_WITH_EXACT_REASON`; no infinite poll loop;
- ordinary text/Markdown remains non-executable;
- pinned conversation/anchor rules remain unchanged;
- validator, report delivery, Avito navigation, queue/cursor and proxy/recovery remain untouched.

## 10. Source gaps retained

No source gap is hidden:

- v1.0.6 exact package remains unresolved because advertised SHA and preserved stream SHA differ and the preserved stream is not extractable;
- v1.0.2–v1.0.5 remain `VERSION_NOT_CONFIRMED`;
- v1.0.20/v1.0.21 remain without version-specific authority;
- v1.0.14, v1.0.22 and v1.0.25–v1.0.33 retain bounded non-exact authority where documented.

## 11. Rule-20 verdict

`FULL_HISTORY_AUDIT=PASS` for the prospective v1.0.42 RED gate.

Reason:

- complete exhaustive v0.1.0–v1.0.38 authority is inherited without narrowing;
- v1.0.39/v1.0.40/v1.0.41 exact patch authorities and installed failures are included;
- all post-v1.0.41-merge repository changes were compared and are non-runtime evidence/docs;
- exact v1.0.34 and exact v1.0.41 confirm the inherited empty-payload reset branch;
- the new live journal provides the required direct observation→state→code causal chain;
- the separate IP/proxy failure is explicitly quarantined from the capture patch;
- historical source gaps remain explicit.

**This PASS authorizes RED creation only. v1.0.41 remains NOT READY / installed E2E FAIL. No v1.0.42 executable patch or build exists yet.**
