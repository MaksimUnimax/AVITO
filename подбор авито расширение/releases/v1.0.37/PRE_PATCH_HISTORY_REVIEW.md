# v1.0.37 — pre-patch history review and regression boundaries

Дата: 2026-09-13. Ветка: `fix/v137-proxy-recovery-integrity-2026-09-13`.

Это обязательная контрольная точка ДО изменения runtime. База патча — exact опубликованный `v1.0.36 R2`, ZIP SHA-256 `c703c9875687d69b2d2ab5e265268cb5fd9ef44d86a95c305a6ae24e4589104c`. Runtime этой контрольной точкой не изменён.

## Прочитанная история и запреты на повтор регрессий

### Pre-proxy authority / v1.0.31

`docs/PRE_PROXY_COMPARISON_v1.0.31_RU.md`, `AUDIT_v1.0.31_RU.md`, `runtime-v130-to-v131.patch` подтверждают: pre-proxy v1.0.7 имел explicit queue → exact target child → target readiness → DOM read → persist cursor → close child. v1.0.30 сломал это `about:blank → conditional tabs.update`, после чего target мог вообще не быть отправлен. v1.0.31 восстановил direct target creation и отделил navigation ownership от proxy/traffic transport.

**Граница:** v1.0.37 не меняет target URL/order, child-tab lifecycle, cursor, direct-target creation, readiness ownership и не вводит новый navigation trampoline.

### v1.0.32 report-delivery recovery

`AUDIT_v1.0.32_RU.md`, `runtime-v131-to-v132.patch`: pre-click staged report мог deadlock после ручного Send; исправлены bounded Send discovery и read-only acknowledgement/reconciliation без blind resend.

**Граница:** v1.0.37 не увеличивает blindly ack budgets, не повторяет Send автоматически и не меняет report-delivery ownership ради proxy.

### v1.0.33 CAPTCHA command gate

`AUDIT_v1.0.33_RU.md`, `runtime-v132-to-v133.patch`: ordinary `#code-block-viewer` ошибочно считался executable Writing Block; добавлен CAPTCHA manual re-anchor. CAPTCHA остаётся ручной границей.

**Граница:** ordinary Markdown/code block остаётся zero-command; user text не читается для re-anchor; CAPTCHA не решается и не кликается автоматически.

### v1.0.34 Writing Block body stability

`AUDIT_v1.0.34_RU.md`, `runtime-v133-to-v134.patch`: toolbar readiness != body finality; body stability gate, validation-before-durable-ownership и exact same-turn supersede. Также проявились handshake/version consistency defects.

**Граница:** v1.0.37 не ослабляет body-stability, `COMMAND_ALREADY_IN_FLIGHT`, exact ownership или protocol handshake.

### v1.0.23/v1.0.24 IP-block recovery

`AVITO_FINDER_v1.0.24_UI_PLAN_IP_BLOCK_RECOVERY_2026-09-08.md`: collection-time `AVITO_IP_BLOCK` должен входить в существующий bounded recovery, replay разрешён только для read-only collection; arbitrary mutations не повторяются. CAPTCHA остаётся manual. Старый документ использовал язык VERIFY→ROTATE→VERIFY и запрещал выдавать косвенный признак за доказанную смену IP.

**Граница:** v1.0.37 не добавляет generic replay, не переключает на случайный существующий профиль, не считает PAC/profile/request новым Avito egress и не делает DIRECT fallback.

### v1.0.35/v1.0.36 R2

v1.0.35 отклонён из-за manifest/adapter mismatch. v1.0.36 исправил только manifest + ADAPTER_VERSION. R2 изменил только cleanup offline test VM, production R1/R2 одинаков. Первый CI R2 34 PASS/1 popup timeout сохранён; отдельный confirmatory run 35/35 PASS не стирает старый FAIL.

**Граница:** новая production-правка обязана bump manifest + adapter version согласованно и тестироваться на конечном ZIP; старые FAIL сохраняются как история.

## Живые дефекты, доказанные до патча

Источник: live user observations + `diagnostics/2026-09-13_proxy_chain_audit/`.

1. Worker producer: `probe_before/probe_after`; popup consumer: `egress_before/egress_after` — telemetry contract mismatch.
2. `last_ip_block_recovery.ok=false,target_status=PENDING` означает ожидание Avito target, но popup выводит «Диагностика IP не завершена» — смешаны transport probe и target verification.
3. При CAPTCHA текущая попытка может завершиться до обновления `last_ip_block_recovery`, поэтому отчёт attempt=3 и popup record attempt=2 возможны.
4. `auth_seen_after_apply` сбрасывается логически при каждом same-profile PAC apply, потому что `proxy_applied_at` двигается позже прежнего credential-supply event.
5. `PROXY_CONFIGURED` не требует `controlled_by_this_extension` + exact PAC match; чужой/неверный PAC может получить тот же headline.
6. Ошибки IP probe логируются, но не сохраняются в durable recovery summary.
7. Raw DOM может одновременно иметь `ip_block=true` и `captcha=true`, а popup headline скрывает CAPTCHA.
8. При успешной доставке CAPTCHA failure report `blocked_reason` очищается до вычисления `manual_gate_kind`; wake затем вынужден восстанавливать gate повторным DOM probe.
9. API key хранится в session secret; runtime `key_check.valid` может пережить отсутствие текущего `key_present`. На попытке >=3 `maybeCreateRecoveryEndpoint()` при отсутствии key/package молча возвращает старый профиль, то есть planned bounded endpoint-create stage деградирует без явного terminal/telemetry reason. API key persistence на диск этим патчем не меняется без отдельного подтверждённого требования.

## Разрешённый scope v1.0.37

Только proxy recovery telemetry/state integrity + сохранение CAPTCHA manual gate:

- единый producer/consumer контракт probe/target;
- точная проверка current PAC ownership/profile route для диагностики;
- auth evidence привязать к active-profile epoch/host/port, не к последнему внутреннему PAC apply;
- persist current attempt result BEFORE CAPTCHA/terminal exit;
- persist probe errors и endpoint-create skip/result;
- popup показывает отдельно PAC, auth evidence, probe before/after/error, target IP-block, target CAPTCHA и номер текущей попытки;
- `key_check.valid` не выдавать за загруженный API key, если session key отсутствует;
- сохранять `manual_gate_kind=CAPTCHA` через report staging/delivery.

Не разрешено в этом патче: новая стратегия failover на существующие профили, смена search criteria, изменение navigation/queue/cursor, auto CAPTCHA, hidden Avito API, blind Send retry, покупка/сообщения/телефон, увеличение таймаутов вместо исправления причины.

## Release gate

До production diff должны существовать regression-тесты, которые падают на exact v1.0.36 R2 на перечисленных invariants. После patch: тот же RED scenario → GREEN, полный существующий runner, final ZIP, fresh-extract rerun, GitHub exact source+artifact+hash+QA+remote readback. Installed Chrome live E2E остаётся отдельным gate; без него статус не выше `LIVE_UNVERIFIED`.
