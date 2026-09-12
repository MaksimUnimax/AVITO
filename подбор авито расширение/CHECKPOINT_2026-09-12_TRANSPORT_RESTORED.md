# Checkpoint: исходный транспорт восстановлен

Дата 2026-09-12. Продолжение `CHECKPOINT_2026-09-12_PUBLICATION_RECOVERY.md`.

Полный прежний транспорт ВОССТАНОВЛЕН, а не заменён новым. Размер 300976 bytes, SHA-256 `bf89642eb4120fbebd70b45432ea0c6939591f0eb25527f352ae32d1b7a8ba07`. Все 11 ранее сохранённых частей 000–009 и 025 совпали побайтно. Оба ZIP реконструированы локально с исходными SHA-256: v134 `27e2049522663bc3d2925c7bc847ad04304979e166e8428fafaaa91d37085f5d`, v135 `3a1de9f67af1554038193adb9bf6a63f0e7ca5ef7c26690236e2fd57a287abd3`.

## Как восстановить без памяти чата

1. `tools/exact_archive_transport.py` — сохранённый детерминированный упаковщик и материализатор.
2. `.github/avito-exact-archives-20260912/MANIFEST.json` — все 26 ожидаемых размеров, Git blob SHA, SHA-256, параметры потока и исходных ZIP.
3. Алгоритм: ZIP infolist-order; исходные headers/gaps сохранены; дедупликация содержимого по SHA-256; UTF-8 compact JSON, LZMA preset9, Base64 chunks16000. Содержимое файлов — text или base64. Для точных deflate payloads использовать Info-ZIP `zip -6`, не Python zlib.
4. Команда упаковки: `python tools/exact_archive_transport.py build --output OUT ORIGINAL_V134_ZIP ORIGINAL_V135_ZIP`.
5. Команда материализации: `python tools/exact_archive_transport.py materialize --parts .github/avito-exact-archives-20260912 --manifest .github/avito-exact-archives-20260912/MANIFEST.json --output OUT`.

## Реальный удалённый прогресс

Части 010, 011, 012, 013 добавлены отдельными коммитами. Последний до checkpoint: `c717efea14c055665b83108693c3510f87f81e12`. Для 010 и 013 readback Git blob SHA совпал; полную сверку всех частей обязательно выполнить перед материализацией.

Теперь сохранены 000–013 и025, всего15/26. Продолжать с **part-014.b64**, осталось014–024. При рестарте пересчитать фактические пути/хеши — не перезаписывать уже сохранённое.

Локальные исходники и полный воспроизводимый поток: `/mnt/data/avito_recovery/deterministic/`. Проверенная локальная материализация: `/mnt/data/avito_recovery/materialization_checked/`. Даже при потере этих временных путей алгоритм и полный манифест уже находятся в Git.

Части — ещё НЕ полные опубликованные ZIP. После26/26 выполнить saved materializer в GitHub Actions, сохранить сами ZIP+все исходные файлы+publication report отдельным коммитом, затем remote byte/hash readback. v135 остаётся REJECTED из-за manifest/adapter mismatch. Runtime в этом блоке не менялся; новый патч не выпускался. Поиск150/150 не сбрасывался.
