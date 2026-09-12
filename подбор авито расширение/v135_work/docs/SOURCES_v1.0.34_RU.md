# Avito Finder v1.0.34 — источники и authorities

## 1. Внутренний product contract

1. `AVITO_FINDER_OPERATOR_PROTOCOL_AND_ASSISTANT_PROMPT_v1.0.md` в репозитории `MaksimUnimax/AVITO` — роли ассистента/расширения, visible-UI boundary, explicit URL queue, manual CAPTCHA, STOP, same-chat reports.
2. Исторические pre-proxy/release authorities v1.0.7/v1.0.8, использованные в предыдущем восстановлении sequential lifecycle — proxy является транспортом и не должен менять контракт explicit queue/readiness.
3. Live diagnostic log 2026-09-12 — partial Writing Block → `UI_PLAN_STEP_REQUIRED` → full same-turn payload → `COMMAND_ALREADY_IN_FLIGHT`. Это непосредственный trigger v1.0.34.

## 2. Chrome Extensions — официальная документация

4. Message passing — https://developer.chrome.com/docs/extensions/develop/concepts/messaging  
   Использовано для границ content-script ↔ worker, JSON-serializable message contract, проверки sender/context и однократного message handoff.

5. Extension service worker lifecycle — https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle  
   Использовано для требования durable state и восстановления после неожиданного termination; global memory нельзя считать authority операции.

6. Storage API — https://developer.chrome.com/docs/extensions/reference/api/storage/  
   Использовано для durable checkpoints/state и учёта асинхронности storage write.

7. Tabs API — https://developer.chrome.com/docs/extensions/reference/api/tabs  
   Использовано для tab lifecycle, `pendingUrl`, message-to-tab и ownership/navigation проверок.

8. Proxy API — https://developer.chrome.com/docs/extensions/reference/api/proxy  
   Использовано для границы: proxy/PAC управляет сетевым маршрутом, но не должен владеть application-level explicit queue/navigation lifecycle.

9. Alarms API — https://developer.chrome.com/docs/extensions/reference/api/alarms  
   Использовано для bounded wake/recovery вместо ожидания бесконечным sleep внутри MV3 worker.

## 3. Web/DOM semantics

10. HTML Living Standard — disabled form controls: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#enabling-and-disabling-form-controls:-the-disabled-attribute  
    Использовано для определения доступности интерактивных элементов.

11. WAI-ARIA `aria-disabled`: https://www.w3.org/TR/wai-aria-1.2/#aria-disabled  
    Использовано совместно с native disabled/visible checks.

12. CSSOM View `elementFromPoint`: https://drafts.csswg.org/cssom-view/#dom-document-elementfrompoint  
    Использовано для безопасной проверки фактической click target surface.

## 4. Test methodology

13. Chrome extension service worker termination testing: https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer  
    Authority для явного тестирования restart/termination, а не предположения, что worker остаётся живым.

14. Playwright Chrome extensions: https://playwright.dev/docs/chrome-extensions  
    Использовано как reference для разделения installed-extension acceptance и обычных Chromium DOM fixtures. В текущей среде installed MV3 не заявляется как проверенный.

## 5. Принцип доказательства этой версии

Ни один внешний материал сам по себе не доказывает correctness Avito Finder. Основание релиза состоит из:
- product contract;
- exact runtime diff;
- детерминированного reproduction старого дефекта;
- 128-сценарной cross-layer матрицы;
- полного Node regression 346/346;
- focused queue/navigation 30/30;
- focused recovery/proxy/network 120/120;
- fresh-release verification конечного ZIP.
