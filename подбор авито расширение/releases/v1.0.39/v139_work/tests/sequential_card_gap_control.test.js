"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Core = require("../core.js");

function form(gap, step = "Собери публичные данные лотов из очереди пакетом 2.") {
  return [
    "Цель: настроить темп чтения выбранных карточек.",
    "Режим: AVITO_UI",
    "Страница: https://www.avito.ru/zlatoust/noutbuki?q=x",
    gap === null ? "" : `Пауза между карточками: ${gap}`,
    "Очередь:",
    "https://www.avito.ru/zlatoust/noutbuki/item_one_123",
    "https://www.avito.ru/zlatoust/noutbuki/item_two_456",
    "Шаги:", step,
    "Исключить:", "Не писать продавцам."
  ].filter(Boolean).join("\n");
}

test("explicit card gap accepts zero and is carried into the generic explicit queue plan", () => {
  const parsed = Core.parseCommandForm(form("0 мс"));
  assert.equal(parsed.valid, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.ui_plan.sequential_card_gap_ms, 0);
  assert.equal(parsed.ui_plan.steps[0].type, "COLLECT_EXPLICIT_LISTING_QUEUE");
});

test("explicit card gap accepts a later manual slowdown on resume", () => {
  const parsed = Core.parseCommandForm(form("2750 мс", "Продолжи сбор лотов из очереди после решённой CAPTCHA."));
  assert.equal(parsed.valid, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.ui_plan.sequential_card_gap_ms, 2750);
  assert.equal(parsed.ui_plan.steps[0].type, "RESUME_EXPLICIT_LISTING_QUEUE");
});

test("omitted card gap preserves the unfinished checkpoint setting", () => {
  const parsed = Core.parseCommandForm(form(null));
  assert.equal(parsed.valid, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.ui_plan.sequential_card_gap_ms, null);
  assert.equal(parsed.ui_plan.sequential_card_gap_source, "preserve_checkpoint");
});

test("malformed and implementation-unsafe gaps are rejected locally", () => {
  const malformed = Core.parseCommandForm(form("быстро"));
  assert.equal(malformed.valid, false);
  assert.ok(malformed.errors.includes("UI_PLAN_CARD_GAP_INVALID"));
  const oversized = Core.parseCommandForm(form("2147483648 мс"));
  assert.equal(oversized.valid, false);
  assert.ok(oversized.errors.includes("UI_PLAN_CARD_GAP_OUT_OF_RANGE"));
});

test("worker applies command gap only between processed children", () => {
  const worker = fs.readFileSync(path.join(__dirname, "..", "service_worker.js"), "utf8");
  for (const token of ["function requestedSequentialCardGapMs(plan)", "function checkpointCardGapMs(plan, checkpoint)", "checkpoint.resume_after", "runExplicitListingQueue", "COLLECT_EXPLICIT_LISTING_QUEUE"]) assert.ok(worker.includes(token), token);
});
