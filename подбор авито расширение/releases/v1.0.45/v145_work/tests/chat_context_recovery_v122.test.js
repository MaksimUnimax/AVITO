"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Core = require("../core.js");

const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "service_worker.js"), "utf8");
const chat = fs.readFileSync(path.join(root, "chatgpt_content.js"), "utf8");
const uuid = "6a9158ba-c84c-83eb-8f5e-a0c1bce65bb7";

test("conversation identity survives nested ChatGPT project routes that still contain /c/<id>", () => {
  const direct = Core.conversationIdentityFromUrl(`https://chatgpt.com/c/${uuid}`);
  const nested = Core.conversationIdentityFromUrl(`https://chatgpt.com/g/g-p-project/c/${uuid}`);
  assert.equal(direct.conversation_id, uuid);
  assert.equal(nested.conversation_id, uuid);
  assert.equal(Core.sameConversationIdentity(direct, nested), true);
});

test("same conversation ID is authoritative even when ChatGPT rewrites the route path", () => {
  const expected = { origin: "https://chatgpt.com", chat_path: `/c/${uuid}`, conversation_id: uuid };
  const actual = { origin: "https://chatgpt.com", chat_path: `/g/g-p-project/c/${uuid}`, conversation_id: uuid };
  assert.equal(Core.sameConversationIdentity(expected, actual), true);
  assert.equal(Core.samePinnedChatContext({ ...expected, tab_id: 7, window_id: 8 }, { ...actual, tab_id: 7, window_id: 8 }), true);
});

test("temporary project/root route becomes a recoverable pause instead of a terminal conversation block", () => {
  assert.match(worker, /status: "PAUSED_CHAT_CONTEXT_CHANGED"/);
  assert.match(worker, /phase: "CHATGPT_CONTEXT_RECOVERY"/);
  assert.match(worker, /blocked_reason: "RETURN_TO_PINNED_CHAT_TO_RESUME"/);
  assert.match(worker, /CHATGPT_CONTEXT_PAUSED_RECOVERABLE/);
  assert.match(worker, /samePinnedTab && actualOrigin === state\.chat_origin/);
  assert.match(worker, /pauseConversationContext\(state, message\.reason/);
});

test("return to the pinned chat automatically restores prompt polling after SPA navigation", () => {
  assert.match(worker, /AF_CAPTURE_RECOVER_CONTINUOUS/);
  assert.match(worker, /CHATGPT_CONTEXT_RECOVERED/);
  assert.match(worker, /NEXT_FORM_POLL_RECOVERY_GRANTED/);
  assert.match(chat, /AF_CAPTURE_RECOVER_CONTINUOUS/);
  assert.match(chat, /PROMPT_CONTINUATION_RECOVERED_AFTER_SPA_CONTEXT_RETURN/);
  assert.match(chat, /startPromptPolling\(data\.search_id, data\.conversation_id, data\.anchor_turn_id/);
});

test("generic pinned-chat assertions also pause recoverably on same-tab same-origin route drift", () => {
  const start = worker.indexOf("async function assertPinnedChatContext");
  const end = worker.indexOf("function isAvitoPageReady", start);
  const fn = worker.slice(start, end);
  assert.match(fn, /ensureChatAdapterForContextCheck\(selected\.id\)/);
  assert.match(fn, /const recoverable = selected\.id === expected\.tab_id/);
  assert.match(fn, /actual\.origin === expected\.origin/);
  assert.match(fn, /pauseConversationContext/);
  assert.match(fn, /error\.recoverable = recoverable/);
});


test("context-check handshake accepts a ChatGPT project route with no conversation id so it can pause instead of crashing", () => {
  assert.match(worker, /function validCaptureProtocolPing\(ping\)/);
  assert.match(worker, /async function ensureChatAdapterForContextCheck\(tabId\)/);
  assert.match(worker, /function validCaptureProtocolPing\(ping\) \{[\s\S]{0,420}typeof ping\.identity\.chat_path === "string"/);
  assert.match(worker, /function validCapturePing\(ping\) \{[\s\S]{0,180}Core\.isConversationIdentity/);
});
