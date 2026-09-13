# Avito Finder v1.0.38 — Avito Sticky Recovery

Дата: 2026-09-13.

База: exact опубликованный и remote-verified `v1.0.37`, ZIP SHA-256 `4eaf64038ffd6c5b08ed7d97fdb0d13848edd8a7a9db04ad928f74b1f371ac9d`.

Финальный кандидат:

`AVITO_FINDER_v1.0.38_AVITO_STICKY_RECOVERY_2026-09-13.zip`

- bytes: `489352`;
- SHA-256: `2f1282e2262b322ef5f17a3852a388dd5480363b9fa5a60346f3264084d477f4`;
- source files: `146`;
- manifest / Avito adapter: `1.0.38`;
- worktree grouped QA: `35 PASS / 0 FAIL`;
- final ZIP fresh-extract grouped QA: `35 PASS / 0 FAIL`;
- Node aggregate: `368 PASS / 0 FAIL`;
- independent GitHub checkout/readback: PASS;
- installed user Chrome acceptance: **NOT_RUN**.

До живой установки статус: **OFFLINE_QA_PASS / REMOTE_BYTES_VERIFIED / LIVE_UNVERIFIED**.

## Живой FAIL v1.0.37, из которого получен патч

После установки exact v1.0.37 задача `af-20260913040603-4j0t` не прочитала ни одной карточки TOP_REVALIDATE_PRE.

Первая попытка дала `AVITO_IP_BLOCK_RECOVERY_EXHAUSTED`, сохранённый cursor `0/3`, `attempted=0`, `read=0`.

После этого read-only `DIAGNOSE_DOM` на уже загруженной странице Dell показал обычную страницу Avito без видимого IP-block/CAPTCHA. Но корректный `RESUME_EXPLICIT_LISTING_QUEUE` снова немедленно дал `AVITO_IP_BLOCK`, всё ещё `cursor=0/3`, `attempted=0`, `read=0`.

То есть сохранённый документ мог быть читаем, а следующая реальная навигация снова попадала в заблокированный маршрут. v1.0.37 живую приёмку не прошёл.

## История, проверенная перед изменением

Сохранены границы предыдущих патчей:

- v1.0.7 — pre-proxy exact target / owned child / bounded readiness authority;
- v1.0.24 — collection-first IP-block recovery, bounded recovery;
- v1.0.30 — исторический `about:blank` regression;
- v1.0.31 — restored exact-target navigation lifecycle;
- v1.0.32 — report reconciliation без blind resend;
- v1.0.33 — Writing Block-only execution + manual CAPTCHA;
- v1.0.34 — writing body stability / validation-before-ownership;
- v1.0.35 — rejected package-version mismatch;
- v1.0.36 R2 — package/adapter consistency, proxy runtime не менялся;
- v1.0.37 — proxy telemetry/state integrity, но алгоритм создаваемого recovery endpoint оставался с прежней rotation policy.

Этот патч не меняет queue/navigation/cursor, ChatGPT capture, report delivery, generic proxy manager или CAPTCHA policy.

## Доказанная первопричина

В exact v1.0.37 `service_worker.js::maybeCreateRecoveryEndpoint` при escalation попытке создавал residential endpoint так:

`rotation: 0`

и затем принимал только новый профиль с:

`rotation_settings.rotate === 0`.

В проектной семантике Proxy.Market `rotation=0` — режим «Каждый запрос», то есть новый IP может использоваться для каждого нового HTTP-запроса. `rotation=-1` — Sticky session.

Это было особенно опасно именно для браузерного Avito: один документ/переход состоит из нескольких HTTP-запросов, поэтому созданный recovery endpoint не давал стабильную сетевую сессию после IP-block. Наблюдавшийся live-паттерн — читаемый уже загруженный DOM, затем новый переход снова в `AVITO_IP_BLOCK` — согласуется с этой ошибкой.

Патч не утверждает, что sticky endpoint гарантированно снимет любой блок Avito. Он исправляет конкретный доказанный дефект policy в recovery-created endpoint и оставляет live acceptance отдельным gate.

## Валидный RED → GREEN

Первые попытки написать RED были отклонены и сохранены как harness failures:

1. workflow `34737580379`: сам тест падал, но workflow имел лишний brittle grep; runtime не был изменён;
2. workflow `34737737052`: RED оказался невалидным из-за неправильного relative `require`, GREEN падал по той же harness-причине;
3. первоначальный v3 `34737809020`: тест пытался monkeypatch замороженный `ProxyCore` и падал до проверяемого инварианта;
4. run `34737917297`: RED уже был валидным (`actual 0`, expected `-1`) и targeted GREEN прошёл, но full Node group показал два test-only дефекта: новый regression требовал `AF_SOURCE_ROOT` внутри aggregate runner и старый `proxy_profiles.test.js` намеренно фиксировал прежнюю `rotation=0` policy. После исправления только тестового harness локальная Node-группа дала `368/368 PASS`.

Финальный authority run: GitHub Actions `34738398529`.

На exact v1.0.37 тот же regression реально перехватывает HTTP body запроса `/dev-api/v2/package/create-proxy/` и получает:

- actual `rotation = 0`;
- expected `rotation = -1`;
- RED: `0 PASS / 1 FAIL`.

После минимального patch тот же тест получает `rotation=-1`, новый list endpoint с `rotation_settings.rotate=-1` корректно reconciles и test становится GREEN: `1 PASS / 0 FAIL`.

После этого:

- worktree full grouped QA: `35 PASS / 0 FAIL`;
- Node aggregate внутри него: `368 PASS / 0 FAIL`;
- final ZIP fresh-extract targeted sticky regression: PASS;
- final ZIP fresh-extract grouped QA: `35 PASS / 0 FAIL`;
- exact ZIP/source/QA persisted in GitHub: PASS;
- independent remote checkout byte/hash/source comparison: PASS.

Independent readback verified commit: `17d8018872f6f1834bf5582ee5210797733a7d0a`.
Readback receipt commit: `b87d493445c106be465f82fb53d9edc3450f80da`.

## Минимальный production diff

Production runtime относительно exact v1.0.37 изменён только в трёх файлах:

1. `service_worker.js`
   - provider create request: `rotation:0` → `rotation:-1`;
   - reconciliation нового recovery endpoint: `rotate===0` → `rotate===-1`.
2. `manifest.json`
   - release version `1.0.38` и description/version_name.
3. `avito_content.js`
   - adapter identity `1.0.38`.

Побайтно сохранены относительно v1.0.37:

- `chatgpt_content.js`;
- `core.js`;
- `proxy_manager.js`;
- `recovery.js`;
- `popup.js`;
- `popup.html`;
- `popup.css`.

Test-only изменения обновляют release-version literals, старый regression expectation для recovery-created endpoint и добавляют новый exact request-body RED/GREEN test.

## Что намеренно НЕ сделано

- user-selected proxy profiles глобально не переводятся в sticky;
- manual endpoint creation semantics не переписаны;
- random profile failover не добавлен;
- DIRECT fallback не добавлен;
- CAPTCHA автоматически не решается;
- API key не переносится в persistent plaintext storage;
- queue/cursor не сбрасываются;
- baseline поиска `150/150` не меняется;
- ни одного live/provider запроса при разработке patch не выполнялось.

API key Proxy.Market остаётся session-scoped. После extension reload/update Chrome очищает `storage.session`, поэтому для живого recovery пользователю может потребоваться один раз снова загрузить/ввести ключ. Это сохранённая security boundary, а не регрессия хранения.

## НАРУШЕННЫЕ ПРАВИЛА

### Предыдущий код / процесс

- **Rule 1** — предыдущие patch-и исправляли diagnostics/state, но не дошли до policy recovery-created endpoint, хотя live сценарий зависел от неё.
- **Rule 2** — до этого не проверялся фактический provider create HTTP body (`rotation`) на живом сценарии Avito recovery.
- **Rule 3** — v1.0.37 имел полный offline PASS, но live run снова провалился; offline PASS не был live acceptance.
- **Rule 7** — до текущего прохода causal link `recovery create policy → every-request endpoint → unstable Avito session` не был закреплён точным RED на request-body уровне.
- **Rule 10/16** — не существовало regression, который ловит реальное значение `rotation` в provider create запросе.
- **Rule 12/13** — v1.0.37 остался LIVE_UNVERIFIED и живой FAIL правильно отклонил acceptance.

### Текущий patch process

Три ранние RED/harness попытки были невалидны и **не засчитаны как доказательство**. Runtime по ним не принимался. Финальный patch принят только после валидного request-body RED, того же GREEN, полного regression и exact final ZIP readback.

## Проверка 19 правил

| № | Правило | Статус v1.0.38 | Доказательство |
|---:|---|---|---|
| 1 | Чинить root cause/state machine, не ближайший симптом | PASS для текущего дефекта | Прослежено live navigation → recovery endpoint creation → provider rotation policy → следующий Avito переход. |
| 2 | Проверять правильный уровень/invariant | PASS | RED перехватывает реальный provider create HTTP body и проверяет `rotation`. |
| 3 | Local PASS != working release | PASS процесс | Статус остаётся LIVE_UNVERIFIED до установленного Chrome E2E. |
| 4 | Рабочий baseline неприкосновенен | PASS | Queue/navigation/capture/proxy manager не менялись. |
| 5 | ChatGPT↔Finder — API contract | PASS | `chatgpt_content.js` byte-identical. |
| 6 | Сначала воспроизвести RED | PASS | Exact v1.0.37: actual rotation 0, expected -1. |
| 7 | Observation→state→code→causal link→regression | PASS для исправляемого дефекта | Live v137 fail + exact hardcode + request-body RED. |
| 8 | Минимальный patch | PASS | 3 production files; реальная policy-правка только в `service_worker.js`. |
| 9 | Тот же defect исчезает в том же сценарии | PASS offline | Тот же targeted test GREEN; live scenario ещё NOT_RUN. |
| 10 | Реальные bugs становятся regressions | PASS | `sticky_recovery_v138.test.js` входит в final source и aggregate Node. |
| 11 | Проверять final installable artifact | PASS | fresh-extract targeted + 35/35 + byte/hash readback. |
| 12 | Full installed E2E | **NOT_RUN** | Следующий обязательный gate. |
| 13 | Live FAIL rejects acceptance | PASS процесс | v1.0.37 rejected live; v1.0.38 не называется live-working. |
| 14 | Proxy остаётся transport layer | PASS | `proxy_manager.js` unchanged; queue/navigation untouched. |
| 15 | Нет infinite waits | PASS regressions | Bounded existing recovery/queue tests остаются зелёными. |
| 16 | Test обязан ловить живой bug | PASS | Exact previous version RED на фактическом create body. |
| 17 | Exact source target | PASS | База — remote-verified v1.0.37 exact ZIP/source. |
| 18 | Rules + violations в каждом patch report | PASS | Этот документ сохраняет текущие и исторические нарушения. |
| 19 | Exact source + ZIP + hashes + QA в GitHub | PASS на release branch | 146 source files, ZIP, build manifest, QA, readback сохранены. После merge требуется main receipt/readback. |

## Следующий gate

После merge установить exact v1.0.38 ZIP поверх текущей распакованной папки без удаления extension storage. После update/reload убедиться в версии `1.0.38`, обновить вкладки ChatGPT/Avito и при необходимости снова загрузить Proxy.Market API key в session.

Затем повторить **тот же** сохранённый `TOP_REVALIDATE_PRE`, cursor `0/3`. Новый baseline не строить.

Если v1.0.38 снова получает IP-block/CAPTCHA, сохранить exact diagnostics. Этот живой FAIL снова отклоняет acceptance; следующий patch без нового RED запрещён.
