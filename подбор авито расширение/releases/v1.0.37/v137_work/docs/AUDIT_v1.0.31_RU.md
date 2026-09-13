# Avito Finder v1.0.31 — аудит pre-proxy sequential lifecycle restoration

Дата: 2026-09-12

## 1. Live defect

После успешного старта v1.0.30 ассистент передал очередь из трёх detail URL. Finder вернул:

```text
SEQUENTIAL_CARD_READY_TIMEOUT:<tabId>:transient_blank:no_probe
cursor=0/3
attempted=0
count=0
```

Это означает: операция остановилась до чтения первой карточки.

## 2. Точная причина в v1.0.30

Normal queue path v1.0.30 сначала создавал owned child:

```js
chrome.tabs.create({url:'about:blank', ...})
```

а затем target dispatch был условным:

```js
if (!child.pendingUrl && (!child.url || child.url === 'about:blank')) {
  ...
  child = await chrome.tabs.update(child.id,{url:summary.href,active:true});
}
```

Chrome Tabs API определяет `pendingUrl` как URL незавершённой навигации до commit. Поэтому сразу после `tabs.create({url:'about:blank'})` допустимо получить:

```text
url=about:blank
pendingUrl=about:blank
status=loading
```

Это состояние воспроизведено на неизменённом v1.0.30 test harness. Результат:

```text
requested_create_url = about:blank
target_dispatch_count_after_create = 0
child_url = about:blank
child_pending_url = about:blank
```

То есть target listing URL вообще не был отправлен браузеру. Readiness затем закономерно истекал на blank document.

Файл evidence:
`qa/v131/reproduced_v130_transient_blank.json`.

## 3. Почему пользователь был прав про pre-proxy версии

Архивный релиз v1.0.7 существовал до добавления Proxy.Market и уже содержал:

- explicit listing queue;
- child-tab handoff;
- sequential detail readiness;
- usable-DOM fallback;
- navigation commit guard.

v1.0.8 — первый Proxy.Market release — документировал, что эти свойства **сохраняются**, а provider network access изолируется в `proxy_manager.js`.

Следовательно, нормальный целевой контракт был: queue/navigation lifecycle существует сам по себе, proxy добавляется под него как network transport.

Поздний `about:blank` trampoline из v1.0.30 нарушил эту границу.

## 4. Какие «костыли» удалены из normal path

### 4.1 Удалён normal `about:blank` trampoline

Было:

`create about:blank → conditional update target`.

Стало:

`persist target intent → create exact target URL`.

### 4.2 Удалено ветвление «если pendingUrl пустой — тогда отправим target»

`pendingUrl` теперь используется только как observation navigation state:

- `pendingUrl == target` → navigation уже запущена;
- committed `url == target` → navigation committed;
- ни target, ни однозначный legacy blank → mismatch/ambiguity, безопасная остановка.

### 4.3 Traffic-lite больше не gate target dispatch

В v1.0.30 `prepareTrafficLiteForNavigation()` стоял до `tabs.update(target)`.

В v1.0.31 target navigation принадлежит queue. Tab-scoped traffic-lite применяется после получения owned tab id как отдельная best-effort transport optimization. Ошибка правила логируется и не превращает корректный target intent в blank timeout.

### 4.4 Proxy recovery не определяет normal navigation

Proxy/rate-limit/IP-block recovery запускается только **после фактической target navigation/evidence**, когда есть interruption. Normal direct/proxy execution использует одну и ту же target creation sequence.

## 5. Durable lifecycle v1.0.31

### Before side effect

Сохраняется:

```text
in_flight.stage = TARGET_TAB_CREATE_INTENT
cursor
href = exact canonical listing URL
started_at
```

### Side effect

```js
chrome.tabs.create({
  url: expectedHref,
  active: true,
  windowId: parentTab.windowId,
  openerTabId: parentTab.id
})
```

### Receipt

Сохраняется child id и stage `TARGET_NAVIGATION_DISPATCHED`.

### Worker restart between create and receipt

Recovery ищет owned child в том же window/opener:

- одна exact target вкладка → adopt;
- две → `SEQUENTIAL_TARGET_TAB_AMBIGUOUS`;
- нет exact target, но ровно один owned blank при pre-create intent/legacy checkpoint → one-time migration;
- иначе новая вкладка создаётся только если нет доказательства предыдущего side effect.

Это уменьшает риск двойного открытия при MV3 termination.

## 6. Legacy migration

Compatibility branch для уже сохранённых v1.0.30 checkpoints оставлен намеренно. Он **не используется новым normal execution**.

Если старый checkpoint указывает на ровно один owned blank child, v1.0.31 один раз отправляет target в эту существующую вкладку и продолжает. Две blank/target owned tabs считаются неоднозначностью и не лечатся созданием третьей.

## 7. Проверенные invariants

- normal explicit queue не создаёт `about:blank`;
- target URL передаётся в `tabs.create` ровно один раз;
- `pendingUrl=target` не вызывает duplicate `tabs.update`;
- loading + target DOM interactive проходит readiness;
- restart после target tab creation не создаёт duplicate;
- ambiguous ownership безопасно останавливается;
- legacy blank checkpoint мигрирует один раз;
- DIRECT/PROXY имеют одинаковый navigation URL/order;
- CAPTCHA остаётся manual boundary;
- rate-limit/IP-block сохраняют cursor;
- detail observation сохраняется до закрытия owned child;
- report receipt не делает blind resend;
- STOP блокирует позднее продолжение.

## 8. Что не заявляется

- Не заявляется byte-identical восстановление v1.0.7: в среде доступна его release/test authority, но не распакованный exact runtime.
- Не заявляется live-success на реальном Avito для v1.0.31 до установки пользователем.
- Не заявляется живой Proxy.Market provider pass из offline harness.
- Не заявляется, что сайт никогда не изменит DOM/anti-abuse поведение.

## 9. Следующий live gate

После установки v1.0.31 следующий `Ищи` должен продолжить `TOP_REVALIDATE_POST` с текущего baseline 150/150.

Ожидаемый новый sequential trace должен содержать target dispatch/creation для Dell listing URL, а не 18-секундное ожидание `about:blank`.
