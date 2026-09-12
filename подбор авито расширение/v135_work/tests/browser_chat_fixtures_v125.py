"""Offline Chromium tests of the production ChatGPT adapter, not a live ChatGPT session.
No website navigation occurs: page.set_content, synthetic URL dependency, Chrome message shim.
Run python tests/browser_chat_fixtures_v125.py (Python playwright + Chromium).
"""
import asyncio, json, os, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('AF_CHAT_BROWSER_REPORT','/tmp/avito-v125-chat-browser-results.json'))
CID='11111111-1111-4111-8111-111111111111'
IDENTITY={'origin':'https://chatgpt.com','chat_path':f'/c/{CID}','conversation_id':CID}
HTML='''<!doctype html><html><head><meta charset="utf-8"></head><body>
<main id="turns"><section data-turn="user" data-turn-id="start"><div data-message-author-role="user">Ищи</div></section></main>
<form style="position:fixed;bottom:10px;width:90%;height:100px"><textarea id="prompt-textarea" style="width:80%;height:50px"></textarea><button type="button" data-testid="send-button" aria-label="Отправить">Отправить</button></form>
<script>window.sendClicks=0;document.querySelector('button').onclick=()=>{window.sendClicks++;const t=document.querySelector('textarea');const s=document.createElement('section');s.dataset.turn='user';s.dataset.turnId='report'+window.sendClicks;const d=document.createElement('div');d.dataset.messageAuthorRole='user';d.textContent=t.value;s.append(d);document.querySelector('main').append(s);t.value='';};</script></body></html>'''
SHIM='''(()=>{const ls=new Set(); window.__AF_TEST_EXPORTS={};window.sentMessages=[];
window.chrome={runtime:{onMessage:{addListener:f=>ls.add(f),removeListener:f=>ls.delete(f)},sendMessage:(m,cb)=>{sentMessages.push(m);let r={ok:true,data:null};if(m.type==='AF_CAPTURE_FULL_TEXT')r=m.candidate?.manual_interruption?{ok:true,data:{reanchored:true,continuation_anchor_turn_id:m.candidate.next_user_turn_id}}:{ok:true,data:{accepted:true}};cb?.(r);return Promise.resolve(r);}}};
window.AF_FIXTURE_SEND=m=>new Promise(resolve=>{for(const l of [...ls])l(m,{},resolve)});})();'''
RESULTS=[]
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking','--disable-gpu'])
  ctx=await browser.new_context(viewport={'width':1200,'height':850});await ctx.route('**/*',lambda r:r.abort())
  errors=[];page=None
  async def load():
   nonlocal page
   if page:await page.close()
   page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   await page.set_content(HTML);await page.add_script_tag(content=SHIM);await page.add_script_tag(path=str(ROOT/'core.js'))
   code="(()=>{const location=window.AF_FIXTURE_LOCATION=new URL('https://chatgpt.com/c/"+CID+"');"+(ROOT/'chatgpt_content.js').read_text()+"})();"
   await page.add_script_tag(content=code)
  async def msg(m):return await page.evaluate('m=>AF_FIXTURE_SEND(m)',m)
  def report(**kw):return {'type':'AF_CAPTURE_SEND_REPORT','expected_identity':IDENTITY,'search_id':'fixture','delivery_id':'one','report_text':'Avito Finder: fixture report with CPU i5-8400 16 GB SSD 256 GB',**kw}
  async def run(name,fn):
   start=time.monotonic()
   try:await fn();r={'test':name,'status':'PASS'}
   except Exception as e:r={'test':name,'status':'FAIL','error':str(e)}
   r['elapsed_ms']=round(1000*(time.monotonic()-start));RESULTS.append(r);print(r,flush=True)
  async def deliver():
   await load();r=await msg(report());assert r['ok'] and r['anchor_turn_id']=='report1',r
   assert await page.evaluate('sendClicks')==1
   r=await msg({'type':'AF_CAPTURE_BEGIN_PROMPT_POLL','search_id':'fixture','conversation_id':CID,'expected_identity':IDENTITY,'anchor_turn_id':'report1'})
   assert r['ok'],r
   await msg({'type':'AF_CAPTURE_STOP','expected_identity':IDENTITY})
  await run('report sends once, returns new exact user turn and restores same-chat continuation identity',deliver)
  async def duplicate():
   await load();a=asyncio.create_task(msg(report()));b=asyncio.create_task(msg(report()));r=await asyncio.gather(a,b)
   assert all(x['ok'] for x in r),r;assert await page.evaluate('sendClicks')==1
   r=await msg(report());assert r['ok'] and await page.evaluate('sendClicks')==1
  await run('concurrent and later duplicate delivery IDs produce one Send click',duplicate)
  async def cancel():
   await load();a=asyncio.create_task(msg(report()));await page.wait_for_timeout(250);await msg({'type':'AF_CAPTURE_STOP','expected_identity':IDENTITY});r=await a
   assert not r['ok'] and r['code']=='REPORT_SEND_CANCELLED',r;assert await page.evaluate('sendClicks')==0
  await run('STOP during report staging prevents delayed Send click',cancel)
  async def occupied():
   await load();await page.locator('textarea').fill('UNSENT USER TEXT');r=await msg(report())
   assert not r['ok'] and r['code']=='PRIMARY_COMPOSER_OCCUPIED',r
   assert await page.locator('textarea').input_value()=='UNSENT USER TEXT';assert await page.evaluate('sendClicks')==0
  await run('user unsent composer text is preserved and report is not sent',occupied)
  async def changedtext():
   await load();a=asyncio.create_task(msg(report()));await page.wait_for_timeout(250);await page.locator('textarea').fill('USER EDIT DURING REACT WAIT');r=await a
   assert not r['ok'] and r['code']=='REPORT_STAGED_TEXT_CHANGED',r;assert await page.evaluate('sendClicks')==0
   assert await page.locator('textarea').input_value()=='USER EDIT DURING REACT WAIT'
  await run('user edit during report staging cancels Send and preserves edited text',changedtext)
  async def changedroute():
   await load();a=asyncio.create_task(msg(report()));await page.wait_for_timeout(250)
   await page.evaluate("AF_FIXTURE_LOCATION.href='https://chatgpt.com/c/22222222-2222-4222-8222-222222222222'")
   r=await a;assert not r['ok'],r;assert await page.evaluate('sendClicks')==0
  await run('conversation route change during staging prevents Send into another chat',changedroute)

  async def wrongchat():
   await load();other={'origin':'https://chatgpt.com','chat_path':'/c/22222222-2222-4222-8222-222222222222','conversation_id':'22222222-2222-4222-8222-222222222222'}
   r=await msg(report(expected_identity=other));assert not r['ok'],r;assert await page.evaluate('sendClicks')==0
  await run('wrong pinned conversation cannot receive report',wrongchat)
  async def startcancel():
   await load();a=asyncio.create_task(msg({'type':'AF_CAPTURE_START_AND_ANCHOR','search_id':'fixture','expected_identity':IDENTITY,'message_text':'Ищи'}));await page.wait_for_timeout(250)
   await msg({'type':'AF_CAPTURE_STOP','expected_identity':IDENTITY});r=await a
   assert not r['ok'] and r['code']=='REPORT_SEND_CANCELLED',r;assert await page.evaluate('sendClicks')==0
  await run('STOP during initial Start staging prevents delayed Start click',startcancel)
  async def writing():
   await load()
   text='Режим:\nAVITO_UI\n\nСтраница:\nhttps://www.avito.ru/all/nastolnye_kompyutery?q=fixture\n\nСобери до 20 видимых объявлений.'
   await page.evaluate('t=>{const s=document.createElement("section");s.dataset.turn="assistant";s.dataset.turnId="assistant1";const w=document.createElement("div");w.dataset.writingBlock="fixture";const p=document.createElement("pre");p.textContent=t;w.append(p);const b=document.createElement("button");b.ariaLabel="Копировать";b.textContent="Копировать";w.append(b);s.append(w);document.querySelector("main").append(s)}',text)
   await page.evaluate('c=>__AF_TEST_EXPORTS.chatCapture.startFixturePromptPoll({run_id:"fixture",conversation_id:c,anchor_turn_id:"start"})',CID)
   await page.wait_for_function('sentMessages.some(m=>m.type==="AF_CAPTURE_FULL_TEXT")',timeout=10000)
   calls=await page.evaluate('sentMessages.filter(m=>m.type==="AF_CAPTURE_FULL_TEXT")');assert len(calls)==1,calls
   assert text in json.dumps(calls,ensure_ascii=False).replace('\\n','\n'),calls
   await page.wait_for_timeout(900);assert await page.evaluate('sentMessages.filter(m=>m.type==="AF_CAPTURE_FULL_TEXT").length')==1
   await msg({'type':'AF_CAPTURE_STOP','expected_identity':IDENTITY})
  await run('completed Writing Block captured exactly once without external browser connector',writing)
  async def markdown_code_not_writing_block():
   await load()
   code_text='Монитор:\np1 = 30/30\np2 = 0/20 unique\nCAPTCHA = MANUAL_REQUIRED'
   assert len(code_text)==62
   await page.evaluate('t=>{const s=document.createElement("section");s.dataset.turn="assistant";s.dataset.turnId="assistant-code";const w=document.createElement("div");w.id="code-block-viewer";const p=document.createElement("pre");const c=document.createElement("code");c.textContent=t;p.append(c);w.append(p);const b=document.createElement("button");b.ariaLabel="Копировать";b.textContent="Копировать";w.append(b);s.append(w);const turnCopy=document.createElement("button");turnCopy.dataset.testid="copy-turn-action-button";turnCopy.ariaLabel="Копировать ответ";turnCopy.textContent="Копировать ответ";s.append(turnCopy);document.querySelector("main").append(s)}',code_text)
   await page.evaluate('c=>__AF_TEST_EXPORTS.chatCapture.startFixturePromptPoll({run_id:"fixture",conversation_id:c,anchor_turn_id:"start"})',CID)
   await page.wait_for_timeout(3200)
   calls=await page.evaluate('sentMessages.filter(m=>m.type==="AF_CAPTURE_FULL_TEXT")')
   form_errors=await page.evaluate('sentMessages.filter(m=>m.type==="AF_CAPTURE_FORM_ERROR")')
   assert len(calls)==0,calls
   assert len(form_errors)==1,form_errors
   await page.wait_for_timeout(1200)
   assert await page.evaluate('sentMessages.filter(m=>m.type==="AF_CAPTURE_FORM_ERROR").length')==1
   await msg({'type':'AF_CAPTURE_STOP','expected_identity':IDENTITY})
  await run('ordinary markdown code block is non-executable and terminates with one form error',markdown_code_not_writing_block)
  async def captcha_manual_reanchor():
   await load()
   await page.evaluate('c=>__AF_TEST_EXPORTS.chatCapture.startFixturePromptPoll({run_id:"fixture",conversation_id:c,anchor_turn_id:"start"})',CID)
   await page.evaluate('()=>{const s=document.createElement("section");s.dataset.turn="user";s.dataset.turnId="captcha-solved";const d=document.createElement("div");d.dataset.messageAuthorRole="user";d.textContent="капча решена";s.append(d);document.querySelector("main").append(s)}')
   await page.wait_for_function('sentMessages.some(m=>m.type==="AF_CAPTURE_FULL_TEXT" && m.candidate && m.candidate.manual_interruption===true)',timeout=5000)
   text='Режим:\nAVITO_UI\n\nСтраница:\nhttps://www.avito.ru/all/tovary_dlya_kompyutera/monitory_i_zapshasty/monitory-ASgBAgICAkTGB4BottgUlMuPAw?p=2&q=monitor&s=104\n\nСобери до 30 видимых карточек текущей второй страницы выдачи.'
   await page.evaluate('t=>{const s=document.createElement("section");s.dataset.turn="assistant";s.dataset.turnId="assistant-after-captcha";const w=document.createElement("div");w.dataset.writingBlock="fixture";const p=document.createElement("pre");p.textContent=t;w.append(p);const b=document.createElement("button");b.ariaLabel="Копировать";b.textContent="Копировать";w.append(b);s.append(w);document.querySelector("main").append(s)}',text)
   await page.wait_for_function('sentMessages.some(m=>m.type==="AF_CAPTURE_FULL_TEXT" && m.candidate && m.candidate.prompt_text && m.candidate.prompt_text.includes("p=2"))',timeout=10000)
   calls=await page.evaluate('sentMessages.filter(m=>m.type==="AF_CAPTURE_FULL_TEXT")')
   assert any(x.get('candidate',{}).get('manual_interruption') for x in calls),calls
   assert any('p=2' in x.get('candidate',{}).get('prompt_text','') for x in calls),calls
   await msg({'type':'AF_CAPTURE_STOP','expected_identity':IDENTITY})
  await run('manual user turn can re-anchor CAPTCHA gate and next real Writing Block is captured',captcha_manual_reanchor)
  await browser.close()
  out={'scope':'OFFLINE_REAL_CHROMIUM_CHATGPT_DOM_ADAPTER_WITH_MESSAGE_SHIM','live_chatgpt':False,'installed_extension':False,'tests':RESULTS,'browser_page_errors':errors,'pass':sum(r['status']=='PASS' for r in RESULTS),'fail':sum(r['status']=='FAIL' for r in RESULTS)}
  OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False),flush=True)
  if out['fail'] or errors:raise SystemExit(1)
asyncio.run(main())
