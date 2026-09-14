# Avito Finder v1.0.46 — PRE-PATCH FULL HISTORY AUDIT

**Status: `FULL_HISTORY_AUDIT=PASS`**  
**Date:** 2026-09-14  
**Repository:** `MaksimUnimax/AVITO`  
**Branch:** `fix/v146-terminal-avito-failure-capture-quiescence-2026-09-14`  
**Exact base:** v1.0.45 branch HEAD `2f50ffc0b07dd3125c162b6c0ecb01889aa6e078`  
**Release commit:** `90a032551493babb719f1128e78e63fe8cab4f95`  
**Exact source:** `подбор авито расширение/releases/v1.0.45/v145_work`  
**Runtime changed before RED:** **NO**.

## 1. Rule 20 boundary

This audit is the mandatory pre-runtime gate for the prospective v1.0.46 patch. No runtime JS, manifest, test expectation migration, release ZIP, or provider call was made before this audit. The only branch changes at this point are this Rule-20 authority and its JSON companion.

The audit is a composite full-history revalidation: it inherits the exhaustive canonical audit, verifies its preserved source-gap boundaries, reads the complete incremental Rule-20 chain through v1.0.45, verifies the exact v1.0.45 release lineage, and then maps the new live failure onto the exact current production state machine. It does not replace missing historical sources with guesses.

## 2. Exhaustive inherited history authority

Canonical authority remains:

- `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md`
- `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.json`
- `history_audit/2026-09-13/FULL_HISTORY_AUDIT_STATUS.md`

The canonical audit covers:

- 352 reachable commits at the base exhaustive pass;
- 193 runtime/test/history commits;
- 13 refs;
- 4 PRs at that pass;
- 61 historical archive variants;
- 56 unique archived pre-1.0 versions;
- 60 exact historical runtime manifests;
- 54 unambiguous adjacent runtime diffs.

Known historical source gaps remain explicit and unchanged: exact v1.0.6 package conflict; v1.0.2-v1.0.5 version confirmation limits; v1.0.20-v1.0.21 version-specific authority gaps; limited authority for v1.0.14/v1.0.22 and the bounded non-exact v1.0.25-v1.0.33 range recorded by the canonical audit.

## 3. Incremental Rule-20 chain revalidated

Every post-canonical pre-patch authority was re-read before authorizing a RED for v1.0.46:

| Target | Authority | Preserved contract |
| --- | --- | --- |
| v1.0.40 | `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.40_2026-09-13.json` | first-target allocation under ambiguous existing Avito tabs |
| v1.0.41 | `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.41_2026-09-13.json` | real IP-firewall landing is not generic CAPTCHA |
| v1.0.42 | `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.42_2026-09-13.json` | bounded Writing Block payload extraction; executable-form gate remains strict |
| v1.0.43 | `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.43_2026-09-14.json` | explicit proxy/egress recovery evidence and terminal accounting |
| v1.0.44 | `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.44_2026-09-14.json` | global fail-closed Avito request authority after a network block |
| v1.0.45 | `PRE_PATCH_FULL_HISTORY_AUDIT_v1.0.45_2026-09-14.json` | recovery attempts can escalate without interleaved target Avito requests |

The exact v1.0.45 release commit and current branch head differ by one evidence-only commit. Compare `90a032...` → `2f50ffc...` is ahead by 1/behind by 0 and adds only:

- `releases/v1.0.45/QA/remote_targeted_green.tap`
- `releases/v1.0.45/REMOTE_READBACK.json`

No runtime file changed after the v1.0.45 release commit.

## 4. Historical contract that must not regress: v1.0.35

`PATCH_REPORT_v1.0.35_RU.md` fixed a different capture bug. When prompt polling is legitimately active and a finalized assistant turn contains no Writing Block, the extension must not wait forever. It must produce one structured `ASSISTANT_WRITING_BLOCK_REQUIRED` same-chat outcome, while ordinary Markdown/text remains non-executable.

Therefore v1.0.46 **must not** globally disable `ASSISTANT_WRITING_BLOCK_REQUIRED`, weaken Writing Block-only execution, or disable normal report continuation. The new distinction is report lifecycle, not assistant-form validation.

## 5. Current live failure

Live task: `af-20260914103145-ps7t` on installed v1.0.44.

The triggering Avito runtime result was a terminal network failure:

- stage `AVITO_NAVIGATION`;
- reason `AVITO_REQUEST_SUPPRESSED_NO_EGRESS_CHANGE`;
- one recovery attempt;
- transport `PROBES_COMPLETE`;
- zero cards read.

After that report was delivered back to the same ChatGPT conversation, every ordinary assistant response was treated as a new required executable assistant form and returned `ASSISTANT_WRITING_BLOCK_REQUIRED`. Harmless `DIAGNOSE_DOM` forms merely re-read the same `AVITO_IP_BLOCK` page with repeated fingerprint `3568:8a657f63`, after which the capture loop resumed.

This is independent of whether v1.0.45 transport escalation itself works in an installed browser; v1.0.45 has not yet received installed live E2E. The capture-loop defect is inherited in the exact v1.0.45 source because `chatgpt_content.js` was unchanged and the Worker report lifecycle still re-arms prompt polling unconditionally.

## 6. Exact state-machine proof

The exact v1.0.45 chain is:

1. `returnAvitoRuntimeFailureToPinnedChat(...)` stages `report_kind="avito_failure"`.
2. `deliverReportToPinnedChatUnlocked(...)` confirms delivery of that report.
3. The confirmed-report path unconditionally treats the result as non-terminal, saves `WAITING_FOR_NEXT_ASSISTANT_FORM`, and sends `AF_CAPTURE_BEGIN_PROMPT_POLL`.
4. `chatgpt_content.js` correctly observes a finalized assistant turn with no Writing Block and emits `AUTOMATION_PROMPT_FORM_ERROR` / `ASSISTANT_WRITING_BLOCK_REQUIRED`.
5. `handlePromptFormError(...)` delivers that validation report.
6. Report delivery again re-arms `WAITING_FOR_NEXT_ASSISTANT_FORM`.

The reconciliation path for an uncertain/blocked report has the same unconditional continuation behavior after confirmed delivery.

### Root cause

**`TERMINAL_REPORT_CONTINUATION_POLICY_MISSING`**.

The no-Writing-Block validator is not the defect. The defect is that a terminal non-CAPTCHA Avito runtime failure is treated by report delivery as if it were an ordinary conversational result requiring another assistant form.

## 7. Required v1.0.46 invariant

After a **terminal non-CAPTCHA `avito_failure`** report is confirmed:

- do not start `AF_CAPTURE_BEGIN_PROMPT_POLL`;
- stop the ChatGPT capture adapter for the old operation;
- enter an explicit quiescent terminal state;
- clear transient report-delivery fields so a later explicit Start can create a new operation;
- preserve evidence/search ID/queue/cursor history;
- runtime wake must not resurrect prompt polling for the terminal state;
- do not introduce any Avito navigation/reload/request.

Must remain continuation-capable:

- CAPTCHA/manual-gate `avito_failure`;
- `validation_error` (v1.0.35 invariant);
- normal diagnostic/inspection/UI-action result reports.

## 8. Minimal permitted patch boundary after RED

Expected behavior-changing runtime scope: **`service_worker.js` only**.

Do not change without new evidence:

- `chatgpt_content.js`;
- `core.js`;
- `recovery.js`;
- `proxy_manager.js`.

Release identity files may change only when/if a v1.0.46 artifact is materialized after RED/GREEN.

The implementation should introduce an explicit report continuation policy rather than special-casing the validator. A terminal non-CAPTCHA `avito_failure` must quiesce capture; CAPTCHA/manual-gate and ordinary result kinds retain the existing continuation path.

## 9. Mandatory RED before runtime change

Exact v1.0.45 must prove RED for both parts of the live causal chain:

1. confirmed terminal non-CAPTCHA `avito_failure` delivery currently transitions to `WAITING_FOR_NEXT_ASSISTANT_FORM` and requests `AF_CAPTURE_BEGIN_PROMPT_POLL`;
2. with that poll active, the next finalized ordinary assistant turn produces `ASSISTANT_WRITING_BLOCK_REQUIRED` even though the preceding Avito failure was terminal.

The same regression suite must also establish preservation cases:

- CAPTCHA `avito_failure` still continues;
- `validation_error` still continues and preserves v1.0.35 semantics;
- v1.0.44 request-gate tests remain green;
- v1.0.45 transport-escalation tests remain green.

## 10. Audit verdict

`FULL_HISTORY_AUDIT=PASS`.

Provider calls during audit: **0**.  
Runtime changed before RED: **false**.  
Manifest changed before RED: **false**.  
Test expectations migrated before RED: **false**.  
Release built before RED: **false**.

**Authorized next action:** persist remote readback of this audit, then create an exact-v1.0.45 RED. No runtime patch is authorized before that RED exists and fails for the live reason.
