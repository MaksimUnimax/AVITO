# v1.0.37 R2 — REJECTED: stale SHA256SUMS

R2 final ZIP SHA-256: `b9c1717fdca16d1a1f3e39681128e4556aaed27b4b83b7c2c7e55ba54b65ba75`.

Full final-ZIP runtime QA completed: **35 PASS / 0 FAIL**. This does not make R2 acceptable because a separate source-integrity audit found `SHA256SUMS.txt` inherited unchanged from v1.0.36.

Audit result on R2 source:
- rows in `SHA256SUMS.txt`: 140;
- actual files excluding `SHA256SUMS.txt`: 143;
- stale/mismatching rows: 8;
- missing new files: 3.

Stale rows: `README.md`, `manifest.json`, `avito_content.js`, `service_worker.js`, `tests/ip_block_verified_egress_v123.test.js`, `tests/v135_prompt_form_terminal_gate.test.py`, `tests/traffic_lite_zero_media.test.js`, `tests/ip_block_ui_plan_recovery_v124.test.js`.

Missing rows: `BUILD_ORIGIN_v1.0.37.json`, `QA_HARNESS_REVISION_v1.0.37_R2.json`, `tests/ip_block_first_attempt_rotation_v137.test.js`.

R2 is therefore **REJECTED_SOURCE_INTEGRITY_METADATA** despite 35/35 runtime QA. Runtime behavior is not changed for R3. R3 regenerates exhaustive SHA256SUMS after adding an R3 revision receipt, then repackages and reruns the complete final-ZIP QA.
