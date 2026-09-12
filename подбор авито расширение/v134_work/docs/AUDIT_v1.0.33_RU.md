# Avito Finder v1.0.33 — аудит CAPTCHA command gate

## Живой дефект

После `CAPTCHA_MANUAL_REQUIRED` ассистент отправил обычный поясняющий ответ с Markdown code block. Finder v1.0.32 сообщил два `MODE_UNRESOLVED`:

- `62:30239b07`
- `44:57003269`

Эти fingerprint воспроизведены через production `Core.fingerprint()` и точно совпадают с двумя некомандными диагностическими фрагментами ассистента:

- 62 символа: состояние поиска `Монитор / p1 / p2 / CAPTCHA`;
- 44 символа: сокращённое состояние `p1 / p2 / CAPTCHA_MANUAL_REQUIRED`.

Следовательно, валидатор не получил скрытую или неизвестную команду: ChatGPT DOM adapter ошибочно классифицировал обычный code block как Writing Block.

## Корневая причина 1 — #code-block-viewer считался командой

В v1.0.32 `legacyWritingBlockElement()` искал:

`[data-writing-block], [data-writing-block-id], #code-block-viewer`

Обычный Markdown/code block ChatGPT также может использовать `#code-block-viewer` и иметь кнопку `Копировать`. Поэтому кодовый фрагмент получал `writing_block=true`, его текст передавался Worker и закономерно не проходил `parseCommandForm()`.

### Исправление

`#code-block-viewer` удалён из legacy executable roots.

Теперь команда существует только если:

- есть явный legacy root `[data-writing-block]` или `[data-writing-block-id]`; либо
- текущая Writing Block связана собственной локальной парой Edit + Copy через `currentWritingBlockBinding()`.

Обычный code block с Copy, но без Writing Block contract, игнорируется и не создаёт validator report.

## Корневая причина 2 — ручной user-turn после CAPTCHA не имел continuation contract

После отправки CAPTCHA-отчёта Finder продолжал poll от user-turn этого отчёта. Когда пользователь затем писал ручное сообщение, scanner видел `manual_interruption`, но Worker не имел CAPTCHA-specific re-anchor path. В результате следующий настоящий Writing Block после ручного сообщения не имел нового authoritative anchor.

### Исправление

При подтверждённой доставке `avito_failure` с `CAPTCHA_MANUAL_REQUIRED` Worker сохраняет `manual_gate_kind=CAPTCHA` и фазу `CAPTCHA_MANUAL_WAIT`.

Если scanner сообщает ручной user-turn во время этого gate:

- Worker не читает текст user-turn;
- проверяет только turn ID и pinned conversation;
- сохраняет новый `anchor_turn_id`;
- content adapter перезапускает prompt poll на новом anchor;
- следующий реальный Writing Block принимается обычным контрактом;
- после принятия валидной команды `manual_gate_kind` очищается.

## Миграция текущего v1.0.32 live-state

Текущий запуск уже успел пройти через validator reports, поэтому старое состояние не содержит `manual_gate_kind`.

На wake v1.0.33 выполняет только read-only проверку: если статус `WAITING_FOR_NEXT_ASSISTANT_FORM`, есть bound Avito tab и видимая страница всё ещё классифицируется как CAPTCHA, Worker восстанавливает `CAPTCHA_MANUAL_WAIT` без URL navigation, reload или чтения текста пользователя.

## Safety boundaries

Не изменены:

- CAPTCHA не решается автоматически;
- телефон/сообщения/покупка/оплата не используются;
- скрытые Avito API не используются;
- user text для re-anchor не читается;
- ordinary code blocks не могут стать executable command surfaces;
- pinned chat identity сохраняется.
