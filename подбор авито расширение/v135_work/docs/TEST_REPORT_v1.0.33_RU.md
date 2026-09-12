# Avito Finder v1.0.33 — test report

Все проверки ниже offline/synthetic, кроме уже полученных пользователем live-логов, которые послужили воспроизведением исходного дефекта. Installed/live acceptance v1.0.33 в Chrome пользователя ещё не выполнена.

## Точные regression tests v1.0.33

- Node runtime/static suite: 346/346 PASS, 0 fail, 0 skipped, 0 cancelled.
- Chromium Avito public-DOM adapter: 16/16 PASS.
- Chromium ChatGPT adapter: 11/11 PASS.
  - включает новый тест: ordinary `#code-block-viewer` + Copy не является Writing Block;
  - включает новый тест: manual user turn re-anchors CAPTCHA gate и следующий настоящий Writing Block принимается.
- Start receipt: 8/8 PASS.
- Rich composer/report lifecycle: 29/29 PASS (прогнан шестью bounded slices 1–5, 6–10, 11–15, 16–20, 21–25, 26–29).
- Sent-message receipt: 25/25 PASS (18 последовательных + 7 bounded targeted runs).
- Sequential detail: `six_details_two_batches` PASS, cursor 6/6.
- Sequential CAPTCHA same-child resume: PASS, cursor 3/3.
- Sequential rate-limit + worker restart: PASS, cursor 3/3.
- DIRECT/PROXY navigation isolation: PASS; identical 3 URL order in both modes.
- Three-page collection cycle: PASS, 30 + 30 + 30.
- Assistant-first START + three pages: PASS, 30 + 30 + 30.
- IP-block recovery + three pages: PASS, 30 + 30 + 30.
- Rate-limit recovery + three pages: PASS, 30 + 30 + 30.
- CAPTCHA manual boundary: PASS, no collection after CAPTCHA.

## New exact tests

### Markdown false-positive

Fixture reproduces the exact 62-character diagnostic block whose live fingerprint was `62:30239b07`, rendered inside `#code-block-viewer` with a local Copy button but no Writing Block contract. Expected: zero `AF_CAPTURE_FULL_TEXT` command candidates. PASS.

### CAPTCHA re-anchor

Worker test seeds `WAITING_FOR_NEXT_ASSISTANT_FORM + manual_gate_kind=CAPTCHA`. A manual turn candidate is supplied with a new turn ID and empty command payload. Expected: no Avito navigation/reload, new anchor stored, `user_text_read=false`. PASS.

Chromium adapter test then appends a real Writing Block after that manual turn. Expected: command payload captured exactly. PASS.

### v1.0.32 state migration

Worker test seeds a legacy waiting state with no `manual_gate_kind`, while the bound Avito tab reports visible CAPTCHA. `recoverRuntimeOnWake()` must set `CAPTCHA_MANUAL_WAIT` without navigation/reload. PASS.

## Not claimed

The release is not yet claimed as accepted in the user's installed Chrome. The next live gate is: reload v1.0.33 while the current CAPTCHA state is retained, solve CAPTCHA manually, send a manual user turn, and verify that Finder takes the following real p2 Writing Block without producing another `MODE_UNRESOLVED` from prose/code snippets.
