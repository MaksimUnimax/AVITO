# Avito Finder v1.0.31 — сравнение с pre-proxy navigation lifecycle

Дата: 2026-09-12

## 1. Что является pre-proxy authority

Последняя документированная версия до добавления Proxy.Market — **v1.0.7 Page Ready / Navigation Resilience**.

Её release/test authority фиксирует:

- explicit listing queue;
- child-tab handoff;
- sequential detail readiness;
- readiness по `tab.status=complete` **или** локальному DOM probe;
- guard от старого document до navigation commit;
- bounded polling;
- manual CAPTCHA boundary.

Архивная контрольная сумма v1.0.7 ZIP:

`6f2e83a2c15faaf8aca5114f891bd0da973a33e1e03b19ab552cd992382984a7`

Автоматический результат того релиза: `55 PASS / 0 FAIL / 0 skipped`.

Следующая версия **v1.0.8** впервые добавила Proxy.Market. Её собственный release document отдельно заявил, что от v1.0.7 сохраняются без изменения контракта:

- page-ready DOM fallback;
- equivalent URL suppression;
- sequential detail readiness;
- explicit listing queue;
- visible UI policy;
- manual CAPTCHA boundary;
- ChatGPT capture protocol.

Также v1.0.8 прямо определила provider network access как изолированный `proxy_manager.js`-слой для `api.dashboard.proxy.market`.

Важно: в этой среде доступна документированная authority v1.0.7 и точный текущий runtime v1.0.30. Исходный ZIP v1.0.7 не был доступен как распакованный runtime, поэтому v1.0.31 **восстанавливает документированный контракт**, а не заявляет byte-for-byte копирование старого кода.

## 2. Как должен выглядеть lifecycle по pre-proxy контракту

Логическая последовательность:

`queue[cursor] target URL`
→ `navigation intent`
→ `owned child navigates to target`
→ `target pending/committed acknowledgement`
→ `readiness(target)`
→ `visible detail read`
→ `persist observation/cursor`
→ `close owned child`
→ `gap / next URL`.

Proxy не входит в выбор target URL и не владеет переходом карточки. Proxy влияет на сетевой маршрут этого уже заданного перехода.

Это согласуется с Chrome Tabs API: `tabs.create({url})` принимает URL, на который вкладка должна первоначально навигироваться, а `Tab.pendingUrl` — URL незавершённой навигации до commit.

Официальный источник:
https://developer.chrome.com/docs/extensions/reference/api/tabs

## 3. Что было нарушено в v1.0.30

Runtime v1.0.30 выполнял normal sequential item так:

```js
child = await tabsCreate({
  url: 'about:blank',
  active: true,
  windowId: parentTab.windowId,
  openerTabId: parentTab.id
});
...
if (!child.pendingUrl && (!child.url || child.url === 'about:blank')) {
  await prepareTrafficLiteForNavigation(child.id);
  ...
  child = await tabsUpdate(child.id,{url:summary.href,active:true});
}
```

То есть появилось два разных lifecycle:

1. создать bootstrap `about:blank`;
2. затем попытаться отдельно dispatch target URL.

### Конкретный дефект

Допустимое состояние Chrome API:

```text
url        = about:blank
pendingUrl = about:blank
status     = loading
```

В нём `!child.pendingUrl == false`, поэтому `tabs.update(target)` **не выполняется вообще**.

Детерминированное воспроизведение v1.0.30 показало:

- requested create URL = `about:blank`;
- target dispatch count = `0`;
- child остаётся `about:blank`;
- дальнейшая readiness не может получить target DOM.

Это соответствует живому статусу:

`SEQUENTIAL_CARD_READY_TIMEOUT:<tabId>:transient_blank:no_probe`

с `cursor=0`, `attempted=0`.

## 4. Почему это архитектурный дефект, а не только неверное условие

Можно было заменить условие на частный случай `pendingUrl === about:blank`. Это был бы очередной костыль: навигация всё равно оставалась бы двухфазной и зависела бы от промежуточного bootstrap-состояния Chrome.

Проблема глубже:

- queue уже знает exact target URL;
- `tabs.create` умеет получить этот exact target;
- proxy/PAC работает на сетевом уровне и не требует `about:blank` trampoline;
- temporary DNR/traffic-lite rule не должна владеть target navigation;
- MV3 worker может завершиться между любыми двумя асинхронными шагами, поэтому побочный эффект нужно окружать durable intent/receipt, а не добавлять ещё один navigation side effect.

Официальные источники:

- Tabs API: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Storage: https://developer.chrome.com/docs/extensions/reference/api/storage
- Proxy API: https://developer.chrome.com/docs/extensions/reference/api/proxy

## 5. Что делает v1.0.31

### 5.1 Нормальный новый item

Перед созданием вкладки сохраняется:

```text
TARGET_TAB_CREATE_INTENT
cursor
exact target URL
started_at
```

После этого выполняется один browser navigation side effect:

```js
chrome.tabs.create({
  url: expectedHref,
  active: true,
  windowId: parentTab.windowId,
  openerTabId: parentTab.id
})
```

Normal path **не создаёт `about:blank`** и не выполняет второй `tabs.update(target)`.

### 5.2 `pendingUrl=target`

Если Chrome возвращает:

```text
url        = about:blank
pendingUrl = https://www.avito.ru/...listing...
status     = loading
```

это считается подтверждением, что target navigation уже началась. Второй dispatch запрещён. Readiness ждёт commit/usable target DOM.

### 5.3 Restart после `tabs.create`

Если service worker завершился после создания вкладки, но до сохранения child id, recovery ищет только вкладки:

- в том же window;
- с тем же `openerTabId`;
- exact committed/pending target URL.

Ровно одна — принимается. Две — безопасная ошибка `SEQUENTIAL_TARGET_TAB_AMBIGUOUS`; третья вкладка не создаётся.

### 5.4 Legacy checkpoint

Для существующего checkpoint, созданного v1.0.30, может уже существовать **одна owned `about:blank` вкладка**. v1.0.31 имеет отдельный one-time migration branch:

- только для retained/intent recovery;
- только при однозначном ownership;
- только один `tabs.update(target)`;
- normal v1.0.31 run этот путь не создаёт.

Это compatibility migration, а не normal architecture.

### 5.5 Proxy/data-saver isolation

Target navigation не зависит от proxy mode. После получения tab id traffic-lite configuration применяется как отдельная best-effort transport optimization. Ошибка этой optional tab-rule логируется, но не должна блокировать сам target navigation.

Browser-level offline comparison прогоняет одинаковую queue в `DIRECT` и `PROXY` runtime и проверяет идентичные target URL/order.

Chrome описывает `chrome.proxy` как управление `ProxyConfig`/PAC маршрутизацией соединений, то есть это transport configuration, а не API жизненного цикла вкладок:
https://developer.chrome.com/docs/extensions/reference/api/proxy

## 6. Что намеренно НЕ откатывалось

v1.0.31 не откатывает полезные последующие исправления:

- durable ChatGPT start receipt;
- report receipt/reconciliation;
- STOP/cancellation ownership;
- rate-limit backoff и Retry-After;
- proxy authentication/credentials bounds;
- zero-media transport policy;
- direct-delivery proof;
- explicit queue persistence;
- large report delivery;
- CAPTCHA manual boundary.

Исправлена именно граница ответственности navigation ↔ transport.
