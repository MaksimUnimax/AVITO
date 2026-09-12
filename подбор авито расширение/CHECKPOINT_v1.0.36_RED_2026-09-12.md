# v1.0.36 — RED перед исправлением

Дата: 2026-09-12. Продолжение PUBLICATION_COMPLETE, не повторная загрузка архивов.

Начальный live main: a949daabf05c5db1c59034a0c901cb2d220b35c6. Прочитаны AGENTS.md, PATCH_ENGINEERING_RULES.md, ТЕКУЩИЙ_ПРОГРЕСС.md, CHECKPOINT_2026-09-12_PUBLICATION_COMPLETE.md.

Оригинальные ZIP CRC/SHA повторно проверены локально: v134 27e2049522663bc3d2925c7bc847ad04304979e166e8428fafaaa91d37085f5d; v135 3a1de9f67af1554038193adb9bf6a63f0e7ca5ef7c26690236e2fd57a287abd3. Архивы уже опубликованы; их не переписывать.

До изменения runtime повторно исполнен настоящий core.js + avito_content.js из exact v135 в offline Chromium с блокировкой сетевых запросов. AF_AVITO_PING вернул {ok:true,version:"1.0.34",busy:false}, manifest.version="1.0.35". Результат FAIL / exit 1 / AVITO_ADAPTER_VERSION_MISMATCH_RELOAD_REQUIRED. SHA-256 avito_content.js: 6bca275747e08f7e7508111342e0c33bf240762a23d608c89cb4f9f09f946d8f.

План корректирующей сборки v1.0.36: согласовать literal ADAPTER_VERSION и manifest.version. Не использовать runtime.getManifest() как подмену версии уже загруженного адаптера: старый скрипт должен оставаться распознаваемым как старый. Строгую проверку worker не менять. Другие runtime-механизмы не менять.

Тестовый пробел: tests/helpers/worker_vm.cjs подставляет manifest.version в AF_AVITO_PING; две независимые проверки DOM fixture принимали разные версии. В новой тестовой инфраструктуре требуется сравнение фактического PING с manifest и проверка защитного отказа; все старые сценарии сохранить. Изменения тестовых ожиданий по версии отдельно учитывать в diff.

Следующие блоки: минимальный source candidate и воспроизводимый builder → полный offline QA с сохранением каждого результата → конечный ZIP → повтор полного QA из распакованного ZIP → публикация source/ZIP/QA → независимое remote readback. Installed/live Chrome пока NOT_RUN, это не причина останавливаться до готового к проверке ZIP.

Поиск ПК не запускался; baseline 150/150 сохранён. Ordinary Markdown/code block остаётся zero-command. Закрытый PR #1 не использовать.
