# FULL_HISTORY_AUDIT=PASS

Дата: 2026-09-13.

Rule 20 full-history audit завершён и прошёл independent remote readback.

Authority:

- `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md`
- `подбор авито расширение/PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.json`
- `PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13_RECEIPT.json`
- `FULL_HISTORY_AUDIT_REMOTE_READBACK.json`

Покрытие:

- 352 reachable Git commits на момент основной inventory;
- 193 runtime/test/history commits;
- 13 refs;
- 4 PR;
- 61 historical archive variant;
- 56 уникальных pre-1.0 версий;
- 60 exact historical runtimes;
- 54 unambiguous adjacent runtime diffs;
- exact current source roots v1.0.23, v1.0.24, v1.0.34–v1.0.38;
- bounded source gaps и hash mismatch сохранены явно, без реконструкции по догадке.

Главный процессный вывод: предыдущий выборочный исторический анализ был недостаточен. `rotation=0` recovery policy существовала минимум в exact v1.0.23 и v1.0.24 и была унаследована до v1.0.37. В v1.0.12 семантика уже была документирована (`-1` sticky, `0` every request), однако v1.0.23 regressions проверяли изменение canary egress IP, но не отдельный инвариант стабильности multi-request Avito session.

Independent readback проверил main commit `9892db180170cc443439d66a92cac2b08f5f3a9f` и получил:

- audit MD SHA-256 `ab0d5fcdbc8ab788f70cf18a9cca687d4b5a7e8a202c3124095d4784ece7cf35`;
- audit JSON SHA-256 `4c66c580c3bf286196f230d66d466bfefe982cef23e03648da6931f91d334028`;
- top-level copies byte-identical = true;
- runtime changes since Rule 20 = none.

Readback receipt persistence commit: `048d6cf965e69a04c3c4f69c9f9b0b354a35d956`.

Этот PASS закрывает только Rule 20 historical-analysis gate. **v1.0.38 остаётся `LIVE_UNVERIFIED / installed Chrome E2E NOT_RUN`.** Любой следующий runtime patch всё равно требует нового живого FAIL → exact-source RED → минимальный patch → полный regression → final ZIP → installed E2E.
