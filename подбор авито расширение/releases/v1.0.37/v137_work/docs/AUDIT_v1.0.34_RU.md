# Avito Finder v1.0.34 — аудит исправления Writing Block body stability

## 1. Live-дефект

Во время поиска монитора ChatGPT уже показывал полноценный длинный Writing Block с `Режим: AVITO_UI`, `Страница`, очередью из 6 URL и `Шаги: Собери публичные данные лотов из очереди пакетом 6.`. Finder, однако, передал локальному валидатору только раннюю 660-символьную версию тела. Она содержала режим, но ещё не содержала конечную секцию шага, поэтому валидатор вернул `UI_PLAN_STEP_REQUIRED`. Позже в DOM появился полный payload примерно 6.8 KB, но Worker отвечал `COMMAND_ALREADY_IN_FLIGHT`.

Это был не дефект Avito, не proxy и не ошибка синтаксиса итоговой команды. Это был race между готовностью toolbar Writing Block и завершением стриминга его body.

## 2. Почему v1.0.33 ошибалась

### 2.1 Toolbar/Copy readiness ошибочно использовалась как finality body

Старая логика считала структуру Writing Block стабильной после короткого окна и затем извлекала текст один раз. Структурная сигнатура не включала точный body fingerprint. Поэтому Copy-кнопка могла стать готовой до завершения потока текста.

Детерминированная регрессия воспроизвела этот класс ошибки на неизменённой v1.0.33: раннее тело длиной около 565 символов было принято до прихода хвоста `Шаги:`. Это доказывает сам дефект алгоритма, а не конкретный серверный тайминг ChatGPT.

### 2.2 Worker потреблял candidate до deterministic validation

Промежуточное состояние `FORM_TEXT_CAPTURED_UNVALIDATED` сохранялось до `parseCommandForm`. При падении MV3 worker оно могло остаться durable, хотя команда ещё не была валидирована.

### 2.3 Partial validation report блокировал более полный payload того же assistant turn

Когда укороченный candidate уже породил unsent validation report, нормальная защита `COMMAND_ALREADY_IN_FLIGHT` не позволяла полному candidate из того же assistant turn заменить заведомо более короткую версию.

## 3. Что изменено

### 3.1 Payload-body stability gate

`chatgpt_content.js` теперь после структурной готовности:

1. извлекает локальный body;
2. вычисляет fingerprint точного текста;
3. повторно семплирует body;
4. при любом изменении fingerprint сбрасывает окно стабильности;
5. требует несколько одинаковых samples;
6. только после стабильности передаёт candidate Worker.

Основные production-параметры:
- `PROMPT_PAYLOAD_SAMPLE_MS = 600`;
- `PROMPT_PAYLOAD_STABILITY_MS = 1800`;
- `PROMPT_INVALID_PAYLOAD_STABILITY_MS = 4000`;
- `PROMPT_PAYLOAD_MIN_SAMPLES = 3`.

Invalid-looking body ждёт дольше, потому что именно отсутствие поздней секции `Шаги:` является типичным признаком незавершённого стриминга.

### 3.2 Validation before durable ownership

Worker сначала выполняет `Core.parseCommandForm(text)`, пишет `LOCAL_COMMAND_VALIDATION_COMPLETED`, и только затем фиксирует нормальное command ownership/state. Невалидная команда не получает provisional durable execution ownership.

### 3.3 Read-only migration старого unvalidated state

Состояние `FORM_TEXT_CAPTURED_UNVALIDATED`, оставшееся от старой версии, мигрируется в `WAITING_FOR_NEXT_ASSISTANT_FORM` без Avito action/replay. Provisional operation/form ownership очищается.

### 3.4 Safe supersede большего payload того же assistant turn

Разрешено только если одновременно выполняются все условия:
- старый report — `validation_error`;
- report ещё не был фактически Send-clicked;
- новый candidate принадлежит тому же `assistant_turn_id`;
- payload extraction успешен;
- новый payload строго больше предыдущего captured length;
- content script подтверждает точное Finder ownership staged report в primary composer.

Content script очищает composer только при точном совпадении run/delivery/report text/fingerprint. Если в composer пользовательский draft, другой report, другой assistant turn или ownership не доказано — supersede запрещён.

### 3.5 Protocol/version handshake

Во время тестирования был найден вторичный дефект самой новой ветки: после bump `chatgpt_content.js` до `0.6.17` Worker ещё ожидал `0.6.16`, что давало `CONTENT_ADAPTER_HANDSHAKE_FAILED`. Исправлено: Worker `CAPTURE_VERSION=0.6.17`.

Отдельно был обнаружен release-consistency дефект: `manifest.json` уже был `1.0.34`, а `avito_content.js` ещё объявлял `1.0.33`. Исправлено: `ADAPTER_VERSION=1.0.34`.

## 4. Что НЕ сделано

- Не увеличивали бесконечно таймаут и не заменяли race на «sleep подольше».
- Не отключали `COMMAND_ALREADY_IN_FLIGHT` глобально.
- Не разрешали новому assistant turn перехватывать старую транзакцию.
- Не разрешали очищать пользовательский composer без exact ownership proof.
- Не меняли очередь Avito, сортировку, критерии мониторов или proxy routing ради этого дефекта.

## 5. Тестовая стратегия

Из-за ограничения длинного монолитного run тесты разбиты на независимые процессы/блоки. Каждый блок пишет JSON на диск и завершается; следующий блок стартует отдельно. Выбранная cross-layer матрица содержит 128 сценариев и покрывает capture, parser, Worker state, start receipt, ChatGPT DOM, Avito DOM, composer/report delivery, sent-message receipt и end-to-end queue/recovery.

Результат selected matrix: **128/128 PASS**.

Дополнительные regression suites:
- все Node tests: **346/346 PASS**;
- queue/navigation focused Node: **30/30 PASS**;
- recovery/proxy/network focused Node: **120/120 PASS**;
- direct/proxy browser isolation: PASS;
- 30-detail large report: cursor=30, report=233804 chars, PASS.

Полный список — `docs/SCENARIO_MATRIX_128_v1.0.34_RU.md`.
