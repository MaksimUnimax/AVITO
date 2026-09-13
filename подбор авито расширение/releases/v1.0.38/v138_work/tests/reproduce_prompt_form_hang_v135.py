import asyncio, os, sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(os.environ.get('AF_SOURCE_ROOT', Path(__file__).resolve().parents[1])).resolve()
CID='11111111-1111-4111-8111-111111111111'
BASE='''<!doctype html><body><main><section data-turn="user" data-turn-id="start"><div data-message-author-role="user">Ищи</div></section></main><form><textarea id="prompt-textarea"></textarea><button type="button" data-testid="send-button">Send</button></form></body>'''
SHIM='''(()=>{const ls=new Set();window.__AF_TEST_EXPORTS={};window.sentMessages=[];window.chrome={runtime:{onMessage:{addListener:f=>ls.add(f),removeListener:f=>ls.delete(f)},sendMessage:(m,cb)=>{sentMessages.push(m);cb?.({ok:true,data:{accepted:true,disposition:"continuation_started",continuation_anchor_turn_id:"next-anchor"}});}}};window.AF_FIXTURE_LOCATION=new URL("https://chatgpt.com/c/'''+CID+''' ".trim());window.__AF_TEST_PROMPT_STABILITY_MS=80;window.__AF_TEST_PROMPT_PAYLOAD_SAMPLE_MS=40;window.__AF_TEST_PROMPT_PAYLOAD_STABILITY_MS=120;window.__AF_TEST_PROMPT_INVALID_PAYLOAD_STABILITY_MS=240;window.__AF_TEST_PROMPT_PAYLOAD_MIN_SAMPLES=3;})();'''
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-gpu'])
  page=await browser.new_page(); await page.set_content(BASE); await page.add_script_tag(content=SHIM); await page.add_script_tag(path=str(ROOT/'core.js'))
  code='(()=>{const location=window.AF_FIXTURE_LOCATION;'+(ROOT/'chatgpt_content.js').read_text(encoding='utf-8')+'})();'; await page.add_script_tag(content=code)
  await page.evaluate('''()=>{const s=document.createElement("section");s.dataset.turn="assistant";s.dataset.turnId="assistant-code";const w=document.createElement("div");w.id="code-block-viewer";const p=document.createElement("pre");p.textContent="Режим:\\nAVITO_UI";w.append(p);const local=document.createElement("button");local.ariaLabel="Копировать";local.textContent="Копировать";w.append(local);s.append(w);const turn=document.createElement("button");turn.dataset.testid="copy-turn-action-button";turn.ariaLabel="Копировать ответ";turn.textContent="Копировать ответ";s.append(turn);document.querySelector("main").append(s)}''')
  await page.evaluate('c=>__AF_TEST_EXPORTS.chatCapture.startFixturePromptPoll({run_id:"fixture",conversation_id:c,anchor_turn_id:"start"})',CID)
  await page.wait_for_timeout(700)
  commands=await page.evaluate('sentMessages.filter(m=>m.type==="AF_CAPTURE_FULL_TEXT").length')
  errors=await page.evaluate('sentMessages.filter(m=>m.type==="AF_CAPTURE_FORM_ERROR").length')
  await browser.close()
  print({'source':str(ROOT),'command_count':commands,'form_error_count':errors})
  if commands!=0 or errors!=1: raise SystemExit(1)
asyncio.run(main())
