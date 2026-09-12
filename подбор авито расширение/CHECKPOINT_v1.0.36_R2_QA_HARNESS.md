# v1.0.36 — ревизия тестовой обвязки R2

Дата: 2026-09-12. Это продолжение того же runtime-патча, не новая функция и не изменение capture/navigation/proxy.

Первый кандидат v1.0.36 SHA-256 207fcb99afcf163efafb4987cecf945182fea720d90b744332ef2e8a97ae39e7 сохраняется без изменения. Его локальный полный прогон дал 34 группы PASS, 1 FAIL, 1 проверку среды. FAIL: процесс block03_worker_payload_state.js не завершился за 30 секунд, хотя все 8 утверждений уже прошли. Этот FAIL не переименован в PASS.

Диагностика глобальных таймеров показала 4 отложенных callback с ms=3000, созданных после dispose через scheduleReportAcknowledgement → reconcileBlockedReportUnlocked. Fake worker VM продолжала планировать таймеры после завершения тестового экземпляра. Реальная остановка worker должна уничтожать его контекст; поздние callbacks из уничтоженного тестового экземпляра не должны оживать.

Новый regression test tools/worker_fixture_disposal_v136.test.js:
- прежняя обвязка: callback после dispose исполнился; FAIL, exit 1;
- R2: disposed-флаг запрещает повторное планирование таймера; PASS, exit 0;
- block03 на R2: 8/8 PASS и естественный exit 0 в пределах 10 секунд.

Исправляется только tests/helpers/worker_vm.cjs, добавляется тест, обновляются README и контрольные суммы. Production timers, worker, adapters, manifest, capture, очередь, отчёты и proxy побайтно одинаковы с R1. Нет process.exit(0), удаления утверждений или увеличения лимита проблемного теста.

R2 ZIP локально создан: c703c9875687d69b2d2ab5e265268cb5fd9ef44d86a95c305a6ae24e4589104c, 481259 bytes, 141 файл. Полный повтор из распакованного R2 ZIP выполняется; до его завершения QA не объявлять пройденным. Новый ZIP будет сохранён в releases/v1.0.36-r2/ отдельно от R1.

Дополнительно выполнен полный offline handoff на неизменном production runtime: ordinary Markdown → один same-chat format report → две Writing Block-команды → два отчёта по 30 карточек → WAITING_FOR_NEXT_ASSISTANT_FORM. PASS: 4 Send включая старт, 1 format report, 2 UI dispatch, никакого dispatch до format report. Воспроизводимый тест: tools/check_v136_format_recovery_cycle.py. Это не пользовательский Chrome.

Эта ветка хранит инструменты и checkpoint отдельно, пока предыдущий CI пишет свои QA-коммиты в main. После завершения предыдущего CI — перенести эту добавку в main, собрать R2 из сохранённого R1, повторить всю регрессию на финальном ZIP, проверить remote readback, затем выдать ZIP с LIVE_UNVERIFIED. Исходники и архивы v134/v135/R1 не перезаписывать.
