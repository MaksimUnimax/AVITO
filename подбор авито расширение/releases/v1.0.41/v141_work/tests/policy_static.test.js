'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'service_worker.js'), 'utf8');
const files = ['core.js', 'service_worker.js', 'avito_content.js', 'chatgpt_content.js'].map((name) => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');

test('fresh user run reuses visible Avito or creates exactly one active public root, then may visibly navigate to the supplied public search URL', () => {
  assert.match(worker, /const tabsCreate =/);
  assert.match(worker, /async function createInitialPublicAvitoTab/);
  assert.match(worker, /url: "https:\/\/www\.avito\.ru\/", active: true, windowId: state\.current_window_id/);
  assert.match(worker, /state\?\.user_started === true && state\?\.avito_target_bound_once !== true/);
  assert.match(worker, /AVITO_INITIAL_PUBLIC_ROOT_CREATED/);
  assert.match(worker, /source: "initial_active_public_root"/);
  assert.match(worker, /function directPublicAvitoUrl/);
  assert.match(worker, /AVITO_DIRECT_URL_NAVIGATED/);
  assert.match(worker, /tabsUpdate\(tab\.id, \{ url, active: true \}\)/);
  assert.equal(worker.includes('Page.navigate'), false);
});

test('bootstrap cannot repeat after the run has bound a target', () => {
  const start = worker.indexOf('async function createInitialPublicAvitoTab');
  const end = worker.indexOf('async function ensureAvitoTarget', start);
  const bootstrap = worker.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(bootstrap, /!state\?\.user_started \|\| state\?\.avito_target_bound_once/);
});

test('first AVITO_UI plan is not intercepted as a separate initial report', () => {
  assert.equal(/INITIAL_CONTEXT_REPORTED|INITIAL_VISIBLE_AVITO_CONTEXT|initial_observation/.test(worker), false);
  assert.match(worker, /const routePreflight = await preflightRouteContext\(working, verified\);/);
  assert.match(worker, /if \(routePreflight\.changed\) return;/);
  assert.match(worker, /if \(working\.command_mode === "AVITO_UI"\)/);
});

test('restricted debugger and no hidden-page APIs remain enforced', () => {
  for (const forbidden of ['Runtime.evaluate', 'Page.navigate', 'Network.', 'Fetch.', 'Input.insertText', 'chrome.cookies', 'document.cookie']) {
    assert.equal(files.includes(forbidden), false, `forbidden token found: ${forbidden}`);
  }
  assert.match(worker, /Input\.dispatchMouseEvent/);
  assert.match(worker, /Input\.dispatchKeyEvent/);
});

test('uncertain report delivery is reconciled without a second Send click or new run', () => {
  const start = worker.indexOf('async function reconcileBlockedReport');
  const end = worker.indexOf('async function begin()', start);
  const reconciliation = worker.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(reconciliation, /AF_CAPTURE_RECONCILE_REPORT/);
  assert.equal(reconciliation.includes('AF_CAPTURE_SEND_REPORT'), false);
  assert.match(worker, /PENDING_REPORT_MUST_BE_DELIVERED/);
  const chat = fs.readFileSync(path.join(root, 'chatgpt_content.js'), 'utf8');
  const hStart = chat.indexOf('if (message?.type === "AF_CAPTURE_RECONCILE_REPORT")');
  const discardStart = chat.indexOf('if (message?.type === \"AF_CAPTURE_DISCARD_OWNED_REPORT_STAGE\")', hStart);
  const sendStart = chat.indexOf('if (message?.type === \"AF_CAPTURE_SEND_REPORT\")', hStart);
  const hEnd = discardStart > hStart ? discardStart : sendStart;
  const handler = chat.slice(hStart, hEnd);
  assert.match(handler, /state: "confirmed"/);
  assert.match(handler, /state: "staged"/);
  assert.equal(handler.includes('.click('), false);
  assert.equal(handler.includes('setComposerText('), false);
});


test('direct search-route lifecycle remains restricted to a validated public Avito URL in the selected visible tab', () => {
  const start = worker.indexOf('function directPublicAvitoUrl');
  const end = worker.indexOf('async function visibleAvitoDelay', start);
  assert.ok(start >= 0 && end > start);
  const lifecycle = worker.slice(start, end);
  assert.match(lifecycle, /url\.protocol !== "https:"/);
  assert.match(lifecycle, /Core\.isPublicAvitoUrl/);
  assert.match(lifecycle, /url\.username \|\| url\.password/);
  assert.match(lifecycle, /tabsUpdate\(tab\.id, \{ url, active: true \}\)/);
  assert.equal(lifecycle.includes('Page.navigate'), false);
});

test('ChatGPT capture preserves pinned-dialog safety and can recover after a temporary project route', () => {
  const chat = fs.readFileSync(path.join(root, 'chatgpt_content.js'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.match(chat, /sameConversationReference/);
  assert.match(chat, /AF_CAPTURE_CONTEXT_BLOCKED/);
  assert.match(chat, /AF_CAPTURE_RECOVER_CONTINUOUS/);
  assert.match(chat, /PROMPT_CONTINUATION_RECOVERED_AFTER_SPA_CONTEXT_RETURN/);
  assert.match(popup, /canResumeSequential/);
  assert.match(popup, /Продолжить сбор/);
  assert.match(popupHtml, /CAPTCHA проходит пользователь/i);
});

test('timing profiles keep visible-control behavior while sequential card gap is an explicit checkpoint setting', () => {
  const content = fs.readFileSync(path.join(root, 'avito_content.js'), 'utf8');
  assert.match(worker, /function uiTimingProfile\(plan\)/);
  assert.match(worker, /function uiPlanStartDelayMs\(plan\)/);
  assert.match(worker, /CLICK.*COLLECT_LISTING_DETAILS/s);
  assert.match(worker, /function uiClickReconcileCollectionDelayMs\(plan, remainingSteps\)/);
  assert.match(content, /TIMING_PROFILE_CONTROL_VISIBLE/);
  assert.match(content, /TIMING_PROFILE_COLLECTION_FAST/);
  assert.match(content, /stepPreActionDelay\(plan, steps, offset\)/);
  assert.match(content, /stepPostActionDelay\(plan, steps, offset\)/);
  assert.match(content, /current\.type.*CLICK.*isCollectionStep\(next\)/s);
  assert.doesNotMatch(worker, /timing_profile[^\n]{0,120}(?:Number|parseInt|parseFloat)/);
  assert.match(worker, /function checkpointCardGapMs\(plan, checkpoint\)/);
});


test('new child tab created by an allowed visible listing click is tracked without webNavigation or hidden-page APIs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.ok(manifest.permissions.includes('tabs'));
  assert.equal(manifest.permissions.includes('webNavigation'), false);
  assert.match(worker, /chrome\.tabs\.onCreated\.addListener/);
  assert.match(worker, /openerTabId/);
  assert.match(worker, /expectedNavigationPathMatches/);
  assert.match(worker, /pendingUiClickNavigationMatches/);
  assert.match(worker, /sourceTab && String\(tab\?\.url \|\| \"\"\) !== String\(pending\.page_url \|\| \"\"\)/);
  assert.match(worker, /AVITO_UI_CHILD_TAB_CAPTURED/);
  assert.match(worker, /visible_child_tab/);
  assert.doesNotMatch(worker, /Page\.navigate|Runtime\.evaluate|Network\.|Fetch\.|Input\.insertText/);
});

test('child handoff validates exact listing pathname and keeps the source-page lifecycle intact', () => {
  assert.match(worker, /candidate\.pathname === expected\.pathname/);
  assert.match(worker, /pending\.expected_navigation_path/);
  const initialStart = worker.indexOf('async function selectVisibleAvitoTab');
  const initialEnd = worker.indexOf('async function visibleAvitoDelay', initialStart);
  assert.ok(initialStart >= 0 && initialEnd > initialStart);
  const lifecycle = worker.slice(initialStart, initialEnd);
  assert.equal(lifecycle.includes('onCreated'), false);
  assert.equal(lifecycle.includes('expectedNavigationPathMatches'), false);
});
