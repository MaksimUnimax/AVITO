# v1.0.38 live failure — visible Avito tab ambiguity

Date: 2026-09-13
Installed version reported by Finder: `1.0.38`
Task: `af-20260913062414-29ps`

Observed twice on the same task after the user requested continuation of TOP_REVALIDATE_PRE:

- stage: `COMMAND_CAPTURED`
- reason: `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`
- automatic recovery attempts: `0`
- mutations repeated: forbidden / none performed
- cards read: `0`
- queue cursor: not yet bound/used in this task
- target requested by assistant: exact Dell listing URL `https://www.avito.ru/yuzhno-sahalinsk/nastolnye_kompyutery/dell_vostro_3470_4750223208`

Exact v1.0.38 source root: `подбор авито расширение/releases/v1.0.38/v138_work/`.

Code-level causal observation before patch:

`selectVisibleAvitoTab(windowId)` enumerates every Avito tab in the current window and accepts only (a) exactly one active Avito tab or (b) exactly one Avito tab total. It does not receive or compare the already-known `requestedUrl`. `ensureAvitoTarget(...)` calls this selector before `applyRequestedVisibleAvitoUrl(...)`. Therefore multiple Avito tabs cause terminal ambiguity even when exactly one existing tab already matches the command's exact requested listing URL.

Required safe invariant for a future patch:

1. Preserve existing active-Avito preference.
2. If no single active Avito exists and `requestedUrl` is present, select an existing tab only when exactly one Avito candidate matches the normalized requested public route.
3. If exact requested-route matches are zero or more than one and total candidates remain >1, keep `AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB`.
4. No candidate tab may be navigated merely to resolve ambiguity.
5. Existing single-Avito-tab behavior remains unchanged.

Rule-20 authority `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md/json` was reread in full before any runtime modification. This file records live evidence only; no runtime patch is included.