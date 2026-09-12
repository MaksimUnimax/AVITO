# Avito Finder v1.0.37 R3 — packaged, full QA next

R3 changes no production runtime relative to R2. It fixes only source-integrity metadata: adds `QA_HARNESS_REVISION_v1.0.37_R3.json` and regenerates exhaustive `SHA256SUMS.txt` after all source/test changes.

Archive: `AVITO_FINDER_v1.0.37_FIRST_IPBLOCK_PROVIDER_ROTATION_R3_2026-09-12.zip`

- bytes: `486063`;
- SHA-256: `e497a543c04bc377423c85e3038ddca87c681e831c16d5cc8a07268cb92b3425`;
- source files: `145`;
- SHA256SUMS rows: `144` (all files except checksum manifest itself);
- checksum verification: PASS;
- runtime syntax: PASS;
- ZIP CRC: PASS;
- fresh extraction byte equality: `145/145 PASS`.

R2 SHA `b9c1717f...` is rejected for stale SHA256SUMS even though its runtime QA was 35/35. R1 SHA `7c142783...` was previously rejected for stale version assertions.

Next gate: run complete 35-group release suite from a fresh extraction of this exact R3 ZIP. Until full QA + GitHub exact publication + remote readback: `NOT_READY / LIVE_UNVERIFIED`.
