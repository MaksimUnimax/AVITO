"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function loadCore() {
  const source = fs.readFileSync(path.join(__dirname, "..", "core.js"), "utf8");
  const context = { globalThis: {}, module: { exports: {} }, console, URL, Date, Math };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "core.js" });
  return context.AvitoFinderCore;
}

function planWithTempo(tempoLine = "") {
  return [
    "Цель: тест профиля темпа.",
    "Режим: AVITO_UI",
    "Страница: https://www.avito.ru/",
    tempoLine,
    "Шаги:",
    "Введи «ноутбуки» в поле data-marker='search-form/suggest/input'.",
    "Собери первые 10 объявлений.",
    "Исключить:",
    "Не открывать объявления."
  ].filter(Boolean).join("\n");
}

test("absent timing profile preserves CONTROL_VISIBLE", () => {
  const Core = loadCore();
  const parsed = Core.parseCommandForm(planWithTempo());
  assert.equal(parsed.valid, true);
  assert.equal(parsed.ui_plan.timing_profile, "CONTROL_VISIBLE");
  assert.equal(parsed.ui_plan.timing_profile_source, "default_control_visible");
});

test("COLLECTION_FAST is an explicit fixed allowlisted profile", () => {
  const Core = loadCore();
  const parsed = Core.parseCommandForm(planWithTempo("Темп: COLLECTION_FAST"));
  assert.equal(parsed.valid, true);
  assert.equal(parsed.ui_plan.timing_profile, "COLLECTION_FAST");
  assert.equal(parsed.ui_plan.timing_profile_source, "explicit_field");
  assert.equal(parsed.ui_plan.steps.length, 2);
});

test("arbitrary timing values are rejected instead of becoming milliseconds", () => {
  const Core = loadCore();
  const parsed = Core.parseCommandForm(planWithTempo("Темп: 0"));
  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.includes("UI_PLAN_TIMING_PROFILE_NOT_ALLOWED"));
});
