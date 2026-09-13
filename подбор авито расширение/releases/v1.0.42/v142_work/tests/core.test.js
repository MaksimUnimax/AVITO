'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadCore() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'core.js'), 'utf8');
  const context = { globalThis: {}, module: { exports: {} }, console, URL, Date, Math };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'core.js' });
  return context.AvitoFinderCore;
}

test('valid AVITO_UI plan parses as executable work', () => {
  const Core = loadCore();
  const command = [
    'Цель: открыть текущий выбор города.',
    'Режим: AVITO_UI',
    'Контекст: использовать текущую видимую вкладку Avito.',
    'Действия:',
    "Нажми data-marker='popup-location/region'.",
    'Подожди 1 сек.',
    'Исключить:',
    'Не открывать объявления.'
  ].join('\n');
  const parsed = Core.parseCommandForm(command);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.mode, 'AVITO_UI');
  assert.equal(parsed.ui_plan.steps.length, 2);
  assert.equal(parsed.ui_plan.steps[0].type, 'CLICK');
});

test('first route observation is not a context change', () => {
  const Core = loadCore();
  const current = { url: 'https://www.avito.ru/', page_kind: 'main_or_search', city: 'Златоуст', query: '', dialog_open: false, local_first: null, login_popup: false };
  assert.equal(Core.routeContextChanged(null, current), false);
  assert.equal(Core.routeContextChanged(current, { ...current }), false);
});

test('manual change produces distinct route context fingerprint', () => {
  const Core = loadCore();
  const before = { url: 'https://www.avito.ru/zlatoust/noutbuki', page_kind: 'search_results', city: 'Златоуст', query: 'ноутбуки', dialog_open: false, local_first: true, login_popup: false };
  const after = { url: 'https://www.avito.ru/', page_kind: 'main_or_search', city: 'Советская Гавань', query: '', dialog_open: false, local_first: null, login_popup: false };
  assert.equal(Core.routeContextChanged(before, after), true);
  const journal = Core.appendRouteContext([], before, 'ui_plan_completed');
  const report = Core.formatRouteContextReport('af-test', before, after, journal, 'VISIBLE_AVITO_CONTEXT_CHANGED');
  assert.match(report, /действий на странице не выполнялось/i);
  assert.match(report, /Советская Гавань/);
});
