# v1.0.36 R2 — завершение проверки и передачи сборки

Дата: 2026-09-12. Это продолжение существующей R2, не новая версия и не повторная загрузка v134/v135.

## Точно подтверждено в этом продолжении

Проверен live main `a5bd2e0b24170815abf28259e1491b009cf3f607`. PR #2 merged, commit `0a69165f9715489d974f7c500896fdb38a493bd7`.

Скачан настоящий GitHub Actions artifact 10298429813 из run 34695322848. Его SHA-256 `067b5f41b0399860aa2438b902a87edd4744bdfa2bff2c7627256cf5494d651c` совпал с metadata GitHub. Вложенный ZIP R2: 481259 bytes, SHA-256 `c703c9875687d69b2d2ab5e265268cb5fd9ef44d86a95c305a6ae24e4589104c`, Git blob `917f51b90c57c729b29c10475c27dd984847eacd`.

ZIP заново распакован; CRC PASS; все 141 файла совпали с BUILD_v1.0.36.json и source tree скачанного artifact. Manifest 1.0.36. Исходный ZIP не изменялся.

## Незакрытый результат предыдущего CI

`releases/v1.0.36-r2/QA/final_zip/summary.json` содержит complete=true, 34 PASS / 1 FAIL. Единственный FAIL — popup_lifecycle: test_deadline_exceeded, 30.002 секунды, лог пустой. Последующий format-recovery handoff не выполнялся из-за предыдущего FAIL. Старый отчёт не изменять и не переименовывать в PASS.

При текущем повторе без изменения исходников или лимита времени настоящий tests/v129/browser_popup_lifecycle.py из свежей распаковки прошёл 31/31; exit 0 в исходном 30-секундном лимите. Это не доказывает точную причину старого таймаута. Причина старого таймаута остаётся неустановленной; новый PASS — отдельное наблюдение.

## Следующий исполняемый блок

В отдельном verification-проходе проверить неизменный опубликованный ZIP: весь исходный run_all_v136.py, дополнительные повторы popup в том же лимите, полный tools/check_v136_format_recovery_cycle.py. Не пересобирать ZIP и не менять production/test assertions ради PASS. Результаты хранить отдельно от QA/final_zip первого CI, после каждой группы создавать commit. После успешной проверки — независимый checkout и сверка ZIP/141 файлов, затем выдача того же ZIP пользователю и обновление входных checkpoint/AGENTS.

## Границы

v135 остаётся REJECTED. R2 пока FULL_CONFIRMATORY_QA_PENDING / LIVE_UNVERIFIED. Никаких live provider calls, покупок, отправки продавцам, сброса baseline 150/150. Installed Chrome acceptance NOT_RUN. Публикация v134/v135 уже завершена. Runtime и архивы в этом продолжении не изменялись.
