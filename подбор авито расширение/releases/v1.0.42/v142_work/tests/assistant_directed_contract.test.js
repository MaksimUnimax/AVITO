"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Core = require("../core.js");
const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const runtime = ["core.js", "service_worker.js", "avito_content.js", "chatgpt_content.js"].map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("\n");

function explicitQueueForm({ gap = "0 мс", page = "https://www.avito.ru/zlatoust/noutbuki?q=example", queue = ["https://www.avito.ru/zlatoust/noutbuki/item_one_123", "https://www.avito.ru/zlatoust/noutbuki/item_two_456"], step = "Собери публичные данные лотов из очереди пакетом 2." } = {}) {
  return [
    "Цель: получить public facts по выбранным лотам.",
    "Режим: AVITO_UI",
    `Страница: ${page}`,
    `Пауза между карточками: ${gap}`,
    "Очередь:",
    ...queue,
    "Шаги:",
    step,
    "Исключить:",
    "Не писать продавцам, не покупать и не открывать телефон."
  ].join("\n");
}

test("assistant supplies exact collection URLs; the extension preserves order and does not select or rank", () => {
  const parsed = Core.parseCommandForm(explicitQueueForm());
  assert.equal(parsed.valid, true, JSON.stringify(parsed.errors));
  const step = parsed.ui_plan.steps[0];
  assert.equal(step.type, "COLLECT_EXPLICIT_LISTING_QUEUE");
  assert.deepEqual([...step.selected_urls], [
    "https://www.avito.ru/zlatoust/noutbuki/item_one_123",
    "https://www.avito.ru/zlatoust/noutbuki/item_two_456"
  ]);
  assert.equal(parsed.ui_plan.page_url, "https://www.avito.ru/zlatoust/noutbuki?q=example");
});

test("queue URLs never become an implicit page-navigation target", () => {
  const parsed = Core.parseCommandForm([
    "Цель: собрать public facts на уже открытой странице Avito.",
    "Режим: AVITO_UI",
    "Контекст: использовать текущую видимую вкладку Avito.",
    "Очередь:",
    "https://www.avito.ru/zlatoust/noutbuki/item_one_123",
    "Шаги:",
    "Собери публичные данные лотов из очереди.",
    "Исключить:",
    "Не писать продавцам."
  ].join("\n"));
  assert.equal(parsed.valid, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.ui_plan.page_url, null);
  assert.equal(parsed.ui_plan.reuse_existing_avito, true);
});

test("an explicit queue is mandatory for detail collection and an assistant-owned selection command is rejected", () => {
  const withoutQueue = Core.parseCommandForm([
    "Цель: собрать details.", "Режим: AVITO_UI", "Страница: https://www.avito.ru/zlatoust/noutbuki?q=x", "Шаги:",
    "Собери публичные данные лотов из очереди.", "Исключить:", "Не писать продавцам."
  ].join("\n"));
  assert.equal(withoutQueue.valid, false);
  assert.ok(withoutQueue.errors.includes("UI_PLAN_EXPLICIT_PUBLIC_QUEUE_REQUIRED"));
  const selection = Core.parseCommandForm([
    "Цель: выбрать карточки.", "Режим: AVITO_UI", "Страница: https://www.avito.ru/zlatoust/noutbuki?q=x", "Шаги:",
    "Сформируй очередь из 30 объявлений.", "Исключить:", "Не писать продавцам."
  ].join("\n"));
  assert.equal(selection.valid, false);
  assert.ok(selection.errors.includes("UI_PLAN_SELECTION_BELONGS_TO_ASSISTANT"));
});

test("generic visible UI commands remain available for search, filters and sorting", () => {
  const parsed = Core.parseCommandForm([
    "Цель: изменить видимые параметры поиска.", "Режим: AVITO_UI", "Страница: https://www.avito.ru/", "Темп: CONTROL_VISIBLE", "Шаги:",
    "Нажми \"Фильтры\".",
    "Введи \"Златоуст\" в \"Город\".",
    "Собери видимое меню.",
    "Выбери \"Златоуст\" в списке.",
    "Нажми \"По возрастанию цены\".",
    "Собери до 12 видимых объявлений.",
    "Исключить:", "Не писать продавцам, не покупать."
  ].join("\n"));
  assert.equal(parsed.valid, true, JSON.stringify(parsed.errors));
  assert.deepEqual([...parsed.ui_plan.steps].map((step) => step.type), ["CLICK", "TYPE", "COLLECT_MENU", "SELECT_OPTION", "CLICK", "COLLECT_LISTINGS"]);
});

test("runtime has no product-domain evaluator, automatic retry selector, ranking or full-result discovery path", () => {
  for (const forbidden of ["CorelDRAW", "coreldraw", "seller_rating_reviews_desc", "sort_strategy", "all_candidates", "missingRequiredFieldCandidates", "RECHECK_PREPARED_MISSING_FIELDS", "current_avito_order", "FILTERED_SEQUENTIAL_REVIEW", "PREPARE_FILTERED_CANDIDATE_QUEUE", "START_PREPARED_FILTERED_QUEUE", "RESUME_FILTERED_SEQUENTIAL_REVIEW", "AF_COLLECT_FILTERED_CANDIDATE_INVENTORY", "collectFilteredCandidateInventory", "listingMissingFields", "missing_fields", "О ноутбуке", "тип\\s+ноутбук"]) {
    assert.equal(runtime.includes(forbidden), false, forbidden);
  }
  const runStart = worker.indexOf("async function runExplicitListingQueue");
  const runEnd = worker.indexOf("function continuationSequentialCheckpoint", runStart);
  const queueRunner = worker.slice(runStart, runEnd);
  assert.match(queueRunner, /assistant_explicit_public_url_queue/);
  assert.match(queueRunner, /EXPLICIT_PUBLIC_QUEUE_ACCEPTED/);
  assert.equal(queueRunner.includes("readFilteredCandidateInventory"), false);
  assert.equal(queueRunner.includes("sort"), false);
});

test("completed collected payload is transient; only an unfinished technical checkpoint can remain", () => {
  assert.match(worker, /await storageRemove\(\[INSPECTION_KEY\]\);/);
  assert.match(worker, /sequential_review: continuationSequentialCheckpoint\(staged\.sequential_review\)/);
  const continuation = worker.slice(worker.indexOf("function continuationSequentialCheckpoint"), worker.indexOf("async function deliverReportToPinnedChat"));
  assert.match(continuation, /"running", "paused_after_test_batch", "paused_for_manual_captcha"/);
  assert.doesNotMatch(continuation, /completed/);
});

test("one child tab, visible-page readiness and manual CAPTCHA boundary remain in the generic collector", () => {
  assert.match(worker, /openerTabId:\s*parentTab\.id/);
  assert.match(worker, /waitForSequentialCardReady/);
  assert.match(worker, /closeSequentialOwnedCard/);
  assert.match(worker, /CAPTCHA_MANUAL_REQUIRED/);
  assert.equal(worker.includes("captchaSolver"), false);
  assert.equal(worker.includes("Runtime.evaluate"), false);
});
