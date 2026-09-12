import asyncio, json, os, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
CID='11111111-1111-4111-8111-111111111111'
ID={'origin':'https://chatgpt.com','chat_path':f'/c/{CID}','conversation_id':CID}
OUT=Path(os.environ.get('AF_START_RECEIPT_REPORT','/tmp/avito-v130-start-receipt.json'))
HTML='''<!doctype html><html><body><main id="turns"><section data-turn="user" data-turn-id="previous"><div data-message-author-role="user">previous question</div></section><section data-turn="assistant" data-turn-id="oldassistant"><div data-message-author-role="assistant">old answer</div></section></main><form><textarea id="prompt-textarea"></textarea><button type="button" id="send" data-testid="send-button" aria-label="Отправить">Отправить</button></form></body></html>'''
SHIM='''window.listeners=[];window.sent=[];window.intentOk=true;window.__AF_TEST_EXPORTS={};window.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f),removeListener:f=>listeners=listeners.filter(x=>x!==f)},sendMessage:(m,cb)=>{sent.push(m);let r={ok:true,data:null};if(m.type==='AF_CAPTURE_START_SEND_INTENT')r=intentOk?{ok:true,data:{committed:true}}:{ok:false,error:'fixture intent fail'};cb?.(r);return Promise.resolve(r)}}};window.AF_SEND=m=>new Promise(resolve=>{for(const f of [...listeners]){const ret=f(m,{tab:{id:1,windowId:1,url:location.href}},resolve);if(ret!==false)return;}});'''
APP='''window.clicks=0;window.expandClicks=0;window.mode='normal';window.lastText='';window.appendUser=(text,id='newuser')=>{const s=document.createElement('section');s.dataset.turn='user';s.dataset.turnId=id;const d=document.createElement('div');d.dataset.messageAuthorRole='user';d.textContent=text;s.append(d);turns.append(s);return s};window.appendFoldedUser=(text,id='newuser')=>{const s=document.createElement('section');s.dataset.turn='user';s.dataset.turnId=id;const role=document.createElement('div');role.dataset.messageAuthorRole='user';const body=document.createElement('div');body.id='folded-body';body.hidden=true;body.textContent=text;const b=document.createElement('button');b.type='button';b.setAttribute('aria-controls',body.id);b.setAttribute('aria-expanded','false');b.setAttribute('aria-label','Развернуть');b.textContent='РазвернутьСвернуть';b.onclick=()=>{window.expandClicks++;body.hidden=false;b.setAttribute('aria-expanded','true');b.textContent='Свернуть';};role.append(body,b);s.append(role);turns.append(s);return s};window.appendAssistant=(id='newassistant')=>{const s=document.createElement('section');s.dataset.turn='assistant';s.dataset.turnId=id;const d=document.createElement('div');d.dataset.messageAuthorRole='assistant';d.textContent='assistant streaming';s.append(d);turns.append(s);return s};window.appendIdlessUser=(text)=>{const a=document.createElement('article');const d=document.createElement('div');d.dataset.messageAuthorRole='user';d.textContent=text;a.append(d);turns.append(a);return a};document.querySelector('#send').onclick=()=>{window.clicks++;const composer=document.querySelector('#prompt-textarea');window.lastText=composer.value;composer.value='';if(window.mode==='normal')window.appendUser(window.lastText);if(window.mode==='folded_normal')window.appendFoldedUser(window.lastText);if(window.mode==='assistant_first')window.appendAssistant();if(window.mode==='idless_duplicate'){window.appendIdlessUser(window.lastText);window.appendAssistant();}if(window.mode==='manual_then_assistant'){window.appendUser('manual message','manual');window.appendAssistant();}};'''
RESULTS=[]
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
  ctx=await browser.new_context(); await ctx.route('**/*',lambda r:r.abort()); page=None; errors=[]
  async def load(mode='normal'):
   nonlocal page
   if page: await page.close()
   page=await ctx.new_page(); page.on('pageerror',lambda e:errors.append(str(e))); await page.set_content(HTML)
   await page.add_script_tag(content=SHIM); await page.add_script_tag(content=APP); await page.evaluate('(m)=>window.mode=m',mode)
   await page.add_script_tag(path=str(ROOT/'core.js'))
   code="(()=>{const location=window.AF_FIXTURE_LOCATION=new URL('https://chatgpt.com/c/"+CID+"');"+(ROOT/'chatgpt_content.js').read_text()+"})();"
   await page.add_script_tag(content=code)
  async def msg(m): return await page.evaluate('m=>AF_SEND(m)',m)
  async def run(name,fn,timeout=8):
   start=time.monotonic()
   try: await asyncio.wait_for(fn(),timeout); r={'name':name,'status':'PASS'}
   except Exception as e: r={'name':name,'status':'FAIL','error':str(e)}
   r['ms']=round((time.monotonic()-start)*1000); RESULTS.append(r); print(json.dumps(r,ensure_ascii=False),flush=True)
  async def normal():
   await load('normal'); r=await msg({'type':'AF_CAPTURE_START_AND_ANCHOR','search_id':'run','expected_identity':ID,'message_text':'Ищи'}); assert r['ok'] and r['anchor_turn_id']=='newuser' and not r.get('expected_assistant_turn_id'),r; assert await page.evaluate('clicks')==1; assert await page.evaluate("sent.filter(x=>x.type==='AF_CAPTURE_START_SEND_INTENT').length")==1
  await run('normal start uses exact new user turn and one durable intent',normal,8)
  async def folded_normal():
   await load('folded_normal'); r=await msg({'type':'AF_CAPTURE_START_AND_ANCHOR','search_id':'run','expected_identity':ID,'message_text':'Ищи'}); assert r['ok'] and r['anchor_turn_id']=='newuser',r; assert await page.evaluate('clicks')==1; assert await page.evaluate('expandClicks')==1
  await run('folded exact start is expanded presentation-only and acknowledged after one Send',folded_normal,8)
  async def idless_duplicate():
   await load('idless_duplicate'); await page.evaluate("appendUser('Ищи','old-search')")
   r=await msg({'type':'AF_CAPTURE_START_AND_ANCHOR','search_id':'run','expected_identity':ID,'message_text':'Ищи'}); assert r['ok'],r; assert r['anchor_turn_id']=='old-search' and r['expected_assistant_turn_id']=='newassistant' and r['start_receipt_mode']=='visible_user_plus_assistant_fallback',r; assert await page.evaluate('clicks')==1
  await run('live regression: second visible Ищи without data-turn-id is acknowledged via visible bubble plus assistant',idless_duplicate,8)
  async def assistant_first():
   await load('assistant_first'); r=await msg({'type':'AF_CAPTURE_START_AND_ANCHOR','search_id':'run','expected_identity':ID,'message_text':'Ищи'}); assert r['ok'],r; assert r['anchor_turn_id']=='previous' and r['expected_assistant_turn_id']=='newassistant' and r['start_receipt_mode']=='assistant_turn_fallback',r; assert await page.evaluate('clicks')==1
  await run('assistant-first DOM confirms start without requiring materialized user turn',assistant_first,8)
  async def conflict():
   await load('normal'); await page.evaluate("appendUser('manual message','manual');appendAssistant('newassistant')")
   receipt={'baseline_user_turn_ids':['previous'],'baseline_assistant_turn_ids':['oldassistant'],'previous_anchor_turn_id':'previous'}
   r=await page.evaluate('(x)=>__AF_TEST_EXPORTS.chatCapture.inspectStartReceipt(x,"Ищи")',receipt); assert not r['confirmed'] and r['receipt_mode']=='intervening_user_turn',r
  await run('assistant fallback is rejected when an intervening user turn exists',conflict)
  async def reconcile_user():
   await load('normal'); receipt={'baseline_user_turn_ids':['previous'],'baseline_assistant_turn_ids':['oldassistant'],'previous_anchor_turn_id':'previous'}; await page.evaluate("appendUser('Ищи','lateuser')")
   r=await msg({'type':'AF_CAPTURE_RECONCILE_START','search_id':'run','expected_identity':ID,'message_text':'Ищи','receipt':receipt}); assert r['ok'] and r['state']=='confirmed' and r['anchor_turn_id']=='lateuser',r
  await run('read-only start reconciliation accepts late exact user turn',reconcile_user)
  async def reconcile_assistant():
   await load('normal'); receipt={'baseline_user_turn_ids':['previous'],'baseline_assistant_turn_ids':['oldassistant'],'previous_anchor_turn_id':'previous'}; await page.evaluate("appendAssistant('lateassistant')")
   r=await msg({'type':'AF_CAPTURE_RECONCILE_START','search_id':'run','expected_identity':ID,'message_text':'Ищи','receipt':receipt}); assert r['ok'] and r['state']=='confirmed' and r['anchor_turn_id']=='previous' and r['expected_assistant_turn_id']=='lateassistant',r
  await run('read-only start reconciliation accepts one new assistant turn',reconcile_assistant)
  async def intent_fail():
   await load('normal'); await page.evaluate('intentOk=false'); r=await msg({'type':'AF_CAPTURE_START_AND_ANCHOR','search_id':'run','expected_identity':ID,'message_text':'Ищи'}); assert not r['ok'] and r['code']=='START_SEND_INTENT_NOT_PERSISTED' and not r.get('send_attempted'),r; assert await page.evaluate('clicks')==0
  await run('failed durable start intent prevents Send click',intent_fail,8)
  await browser.close()
  out={'scope':'OFFLINE_REAL_CHROMIUM_START_RECEIPT_V130','installed_extension':False,'live_chatgpt':False,'tests':RESULTS,'pass':sum(x['status']=='PASS' for x in RESULTS),'fail':sum(x['status']=='FAIL' for x in RESULTS),'page_errors':errors}; OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)); print(json.dumps(out,ensure_ascii=False),flush=True); assert not out['fail'] and not errors
asyncio.run(main())
