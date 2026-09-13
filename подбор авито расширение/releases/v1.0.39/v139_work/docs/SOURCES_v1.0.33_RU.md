# Avito Finder v1.0.33 — основания исправления

1. Live user reports 2026-09-12: two `MODE_UNRESOLVED` fingerprints `62:30239b07` and `44:57003269` after CAPTCHA.
2. Production `Core.fingerprint()` in `core.js`: confirmed those hashes exactly match the assistant's two diagnostic Markdown code blocks.
3. Production `chatgpt_content.js` v1.0.32: `legacyWritingBlockElement()` accepted `#code-block-viewer`, making ordinary code blocks executable candidates.
4. Production `chatgpt_content.js`: current genuine Writing Block contract is already represented by `currentWritingBlockBinding()` and its local Edit + Copy controls.
5. Production `service_worker.js`: `handleFullText()` and report continuation showed no CAPTCHA-specific manual-turn re-anchor state.
6. Project operator protocol: CAPTCHA is a manual boundary and continuation must preserve the existing operation rather than restart the search.
7. Existing v1.0.32/v1.0.31 regression suites: report delivery, receipt fencing, sequential collection, proxy isolation and CAPTCHA boundaries retained as anti-regression authorities.

No external web assumption was needed for the root cause: both defects were established from the user's live reports and the exact shipped runtime code.
