# Avito Finder v1.0.32 — аудит report-delivery deadlock

## 1. Наблюдаемый live-дефект

После успешного `COLLECT_LISTINGS count=30` Finder вернулся в ChatGPT и подготовил отчёт. Live-журнал зафиксировал:

- `REPORT_DELIVERY_REQUESTED`;
- `CAPTURE_REPORT_PRIMARY_COMPOSER_BOUND`;
- `CAPTURE_REPORT_TEXT_STAGE_OWNERSHIP_MARKED`;
- затем `CAPTURE_REPORT_SEND_BUTTON_MISSING`;
- затем `REPORT_DELIVERY_BLOCKED` с `send_attempted=false`.

Пользователь вручную нажал видимую кнопку Send. Отчёт появился в conversation как user message. Следующий assistant Writing Block был уже создан, но Finder его не забрал.

Это не Avito failure: p1 был собран полностью. Это deadlock ChatGPT delivery lifecycle.

## 2. Точная причина в v1.0.31

### Ошибка A — pre-click reports исключались из wake reconciliation

В `recoverRuntimeOnWake()` было:

```js
if (['REPORT_DELIVERY_BLOCKED','REPORT_DELIVERY_IN_PROGRESS','REPORT_DELIVERY_UNCERTAIN'].includes(state.status)
    && state.report
    && state.report_send_attempted !== false) {
  return reconcileBlockedReport(state);
}
```

При `PRIMARY_COMPOSER_SEND_BUTTON_MISSING` adapter возвращал `send_attempted=false`. Следовательно, после ручного Send worker специально не вызывал read-only reconciliation и не мог обнаружить exact sent user-turn.

### Ошибка B — pre-click reconciliation сам себя останавливал

После read-only reconcile состояние `staged`/`empty` помечалось как resumable pre-click. Scheduling следующей проверки выполнялся только для `!resumablePreClick`. Поэтому даже единичная ручная сверка не создавала watcher ручной отправки.

### Ошибка C — Send discovery имел хрупкое фиксированное окно

После заполнения composer выполнялся фиксированный `sleep(2000)`, затем одна попытка `resolvePrimaryComposerSendButton()`. Live-сессия за несколько секунд до дефекта успешно находила ту же Send-кнопку, поэтому отсутствие control во второй операции было transient DOM state, а не доказательством отсутствия возможности Send.

## 3. Исправление

### 3.1 Bounded Send discovery

Добавлен `waitForPrimaryComposerSendButton()`:

- deadline 6 секунд;
- poll 100 ms;
- только внутри подтверждённого primary composer;
- semantic/manual-profile resolution остаётся прежним;
- STOP fenced через `reportSendGeneration`;
- conversation identity проверяется на каждой итерации;
- после deadline никакая случайная кнопка не нажимается.

Это не бесконечное ожидание и не расширение области кликов.

### 3.2 Manual-send reconciliation

Wake/read-only reconciliation теперь применяется к сохранённым report states независимо от `report_send_attempted=false`:

- `REPORT_DELIVERY_BLOCKED`;
- `REPORT_DELIVERY_IN_PROGRESS`;
- `REPORT_DELIVERY_UNCERTAIN`;
- `REPORT_READY_IN_COMPOSER`.

Read-only reconciliation:

1. проверяет exact report в composer (`staged`);
2. проверяет exact new user-turn после сохранённого anchor/receipt (`confirmed`);
3. не кликает Send;
4. не меняет Avito;
5. не пересобирает report.

Если exact user-turn подтверждён, worker:

- очищает retained report lifecycle;
- сохраняет новый `anchor_turn_id`;
- переводит состояние в `WAITING_FOR_NEXT_ASSISTANT_FORM`;
- вызывает `AF_CAPTURE_BEGIN_PROMPT_POLL`;
- уже существующий следующий assistant Writing Block снова становится доступен capture loop.

### 3.3 Нет blind resend

Автоматический acknowledgement scheduler после pre-click failure выполняет только `AF_CAPTURE_RECONCILE_REPORT`.

Он не вызывает `AF_CAPTURE_SEND_REPORT`.

Поэтому сценарий:

`Finder staged → user manual Send → reconciliation`

не создаёт второго сообщения.

Explicit `Continue report` сохраняет прежний контракт и может повторить только proven pre-click report, если reconciliation не обнаружил отправленный exact user-turn.

## 4. Что не менялось

v1.0.32 не переписывает:

- Avito collection;
- explicit listing queue;
- v1.0.31 direct target child-tab lifecycle;
- proxy routing/recovery;
- CAPTCHA boundary;
- direct-delivery proof;
- ranking/analytics (их по-прежнему делает assistant).

## 5. Migration текущего зависшего run

Состояние v1.0.31 сохранено в `chrome.storage`. При update/reload v1.0.32 не требует его удаления.

Если вручную отправленный p1 report всё ещё существует в этом pinned conversation, `recoverRuntimeOnWake()` должен выполнить read-only reconcile, подтвердить exact turn и начать poll следующего Writing Block. Никакой повторный `COLLECT_LISTINGS` p1 для этого не нужен.

## 6. Граница доказательства

Проверены production JS в Node VM и production content adapter в offline Chromium fixtures. Installed MV3 в пользовательском Chrome после update является live acceptance. Ни один offline test не называется live ChatGPT acceptance.
