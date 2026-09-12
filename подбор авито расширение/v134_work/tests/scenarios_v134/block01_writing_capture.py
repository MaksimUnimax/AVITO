import asyncio, json, os, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('AF_SCENARIO_OUT',ROOT/'qa/v134/blocks/block01.json'))
CID='11111111-1111-4111-8111-111111111111'
BASE='''<!doctype html><body><main id="turns"><section data-turn="user" data-turn-id="start"><div data-message-author-role="user">Ищи</div></section></main><form><textarea id="prompt-textarea"></textarea><button type="button" data-testid="send-button">Send</button></form></body>'''
SHIM='''(()=>{const ls=new Set();window.__AF_TEST_EXPORTS={};window.sentMessages=[];window.chrome={runtime:{onMessage:{addListener:f=>ls.add(f),removeListener:f=>ls.delete(f)},sendMessage:(m,cb)=>{sentMessages.push(m);const r={ok:true,data:{accepted:true}};cb?.(r);return Promise.resolve(r);}}};window.AF_FIXTURE_SEND=m=>new Promise(r=>{for(const l of [...ls])l(m,{},r)});window.__AF_TEST_PROMPT_STABILITY_MS=80;window.__AF_TEST_PROMPT_PAYLOAD_SAMPLE_MS=40;window.__AF_TEST_PROMPT_PAYLOAD_STABILITY_MS=120;window.__AF_TEST_PROMPT_INVALID_PAYLOAD_STABILITY_MS=240;window.__AF_TEST_PROMPT_PAYLOAD_MIN_SAMPLES=3;})();'''
VALID='Режим:\nAVITO_UI\nСтраница:\nhttps://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864\nШаги:\nСобери до 20 видимых объявлений.'
INVALID='Режим:\nAVITO_UI\nСтраница:\nhttps://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864\nПроверка:\n'+('x'*450)
TAIL='\nШаги:\nСобери публичные данные лотов из очереди пакетом 6.'
async def main():
 results=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-gpu'])
  ctx=await browser.new_context(viewport={'width':1000,'height':700});await ctx.route('**/*',lambda r:r.abort())
  page=None
  async def load():
   nonlocal page
   if page: await page.close()
   page=await ctx.new_page();await page.set_content(BASE);await page.add_script_tag(content=SHIM);await page.add_script_tag(path=str(ROOT/'core.js'))
   code="(()=>{const location=window.AF_FIXTURE_LOCATION=new URL('https://chatgpt.com/c/"+CID+"');"+(ROOT/'chatgpt_content.js').read_text()+"})();";await page.add_script_tag(content=code)
  async def add(text,copy=True,tid='a1',ordinary=False):
   if ordinary:
    await page.evaluate('(x)=>{const s=document.createElement("section");s.dataset.turn="assistant";s.dataset.turnId=x.tid;const w=document.createElement("div");w.id="code-block-viewer";const p=document.createElement("pre");p.textContent=x.text;w.append(p);const b=document.createElement("button");b.ariaLabel="Копировать";b.textContent="Копировать";w.append(b);s.append(w);document.querySelector("main").append(s)}',{'text':text,'tid':tid});return
   await page.evaluate('(x)=>{const s=document.createElement("section");s.dataset.turn="assistant";s.dataset.turnId=x.tid;const w=document.createElement("div");w.dataset.writingBlock="fixture";const p=document.createElement("pre");p.id="wb";p.textContent=x.text;w.append(p);const b=document.createElement("button");b.ariaLabel="Копировать";b.textContent="Копировать";b.disabled=!x.copy;w.append(b);s.append(w);document.querySelector("main").append(s)}',{'text':text,'copy':copy,'tid':tid})
  async def start(): await page.evaluate('c=>__AF_TEST_EXPORTS.chatCapture.startFixturePromptPoll({run_id:"fixture",conversation_id:c,anchor_turn_id:"start"})',CID)
  async def calls(): return await page.evaluate('sentMessages.filter(m=>m.type==="AF_CAPTURE_FULL_TEXT").map(m=>m.candidate.prompt_text)')
  async def run(id,name,input_desc,expected,fn):
   await load();actual={};ok=False;err=''
   try: actual=await fn();ok=actual.get('pass',False)
   except Exception as e: err=str(e);actual={'error':err}
   results.append({'id':id,'name':name,'input':input_desc,'emulation':'production chatgpt_content.js in Chromium DOM fixture','expected':expected,'actual':actual,'status':'PASS' if ok else 'FAIL'})
  async def s1(): await add(VALID);await start();await page.wait_for_timeout(500);c=await calls();return {'count':len(c),'exact':c==[VALID],'pass':c==[VALID]}
  await run('B01-S01','complete valid block','valid AVITO_UI block + ready Copy','one exact command',s1)
  async def s2(): await add(INVALID);await start();await page.wait_for_timeout(130);before=await calls();await page.evaluate('(t)=>document.querySelector("#wb").textContent+=t',TAIL);await page.wait_for_timeout(450);c=await calls();return {'before_tail':len(before),'count':len(c),'full_tail':bool(c and 'пакетом 6' in c[0]),'pass':len(before)==0 and len(c)==1 and 'пакетом 6' in c[0]}
  await run('B01-S02','toolbar ready before body tail','partial 565-ish body; tail arrives after initial stability','no partial submission; one final full command',s2)
  async def s3(): await add('Режим:\nAVITO_UI\n');await start();await page.wait_for_timeout(90);await page.evaluate('(t)=>document.querySelector("#wb").textContent+=t','Страница:\nhttps://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864\n');await page.wait_for_timeout(90);await page.evaluate('(t)=>document.querySelector("#wb").textContent+=t','Шаги:\nСобери до 20 видимых объявлений.');await page.wait_for_timeout(420);c=await calls();return {'count':len(c),'valid_tail':bool(c and 'Собери до 20' in c[0]),'pass':len(c)==1 and 'Собери до 20' in c[0]}
  await run('B01-S03','three-chunk stream','mode, then page, then steps','only final three-chunk body emitted',s3)
  async def s4(): await add(VALID.replace('20','19'));await start();await page.wait_for_timeout(100);await page.evaluate('(t)=>document.querySelector("#wb").textContent=t',VALID.replace('20','21'));await page.wait_for_timeout(350);c=await calls();return {'count':len(c),'contains_21':bool(c and '21 видимых' in c[0]),'pass':len(c)==1 and '21 видимых' in c[0]}
  await run('B01-S04','same-size payload mutation','valid block text changes 19→21 after toolbar appears','fingerprint reset; final 21 captured',s4)
  async def s5(): await add(VALID,copy=False);await start();await page.wait_for_timeout(180);a=await calls();await page.evaluate('document.querySelector("[data-writing-block] button").disabled=false');await page.wait_for_timeout(1100);c=await calls();return {'before_enable':len(a),'after':len(c),'pass':len(a)==0 and len(c)==1}
  await run('B01-S05','Copy initially disabled','complete body but disabled local Copy','wait, then one capture after enable',s5)
  async def s6(): await add(VALID,ordinary=True);await start();await page.wait_for_timeout(400);c=await calls();return {'count':len(c),'pass':len(c)==0}
  await run('B01-S06','ordinary markdown code block','code-block-viewer + Copy button, no writing block','zero commands',s6)
  async def s7(): await add('');await start();await page.wait_for_timeout(150);a=await calls();await page.evaluate('(t)=>document.querySelector("#wb").textContent=t',VALID);await page.wait_for_timeout(1200);c=await calls();return {'empty_phase':len(a),'final':len(c),'pass':len(a)==0 and len(c)==1}
  await run('B01-S07','empty shell then body','writing block root exists empty, body arrives later','ignore empty; capture final',s7)
  async def s8(): long=VALID+'\nПроверка:\n'+('данные '*3000);await add(long);await start();await page.wait_for_timeout(500);c=await calls();return {'count':len(c),'len':len(c[0]) if c else 0,'expected_len':len(long),'pass':len(c)==1 and c[0].startswith(VALID) and len(c[0])>=len(long)-1}
  await run('B01-S08','long writing block','~20k+ chars stable command','one full long payload',s8)
  async def s9(): await add('Режим:\nAVITO_UI');await start();await page.wait_for_timeout(180);a=await calls();await page.wait_for_timeout(180);c=await calls();return {'at_180ms':len(a),'at_360ms':len(c),'pass':len(a)==0 and len(c)==1}
  await run('B01-S09','stable invalid command','invalid block with no page/steps','longer invalid settle then one exact validator candidate',s9)
  async def s10(): await add(VALID);await start();await page.wait_for_timeout(90);await page.evaluate('(t)=>document.querySelector("#wb").textContent=t',VALID+'\nПроверка:\nпоследняя строка');await page.wait_for_timeout(360);c=await calls();return {'count':len(c),'has_last':bool(c and 'последняя строка' in c[0]),'pass':len(c)==1 and 'последняя строка' in c[0]}
  await run('B01-S10','late body mutation after first sample','valid body gains trailing section during payload settle','settle resets; final body only',s10)
  async def s11(): await add(VALID);await start();await page.wait_for_timeout(500);c1=await calls();await page.wait_for_timeout(400);c2=await calls();return {'first':len(c1),'later':len(c2),'pass':len(c1)==1 and len(c2)==1}
  await run('B01-S11','stable block repeated polling','same finished block remains visible','exactly one candidate, no duplicates',s11)
  async def s12(): await add(VALID,tid='a1');await start();await page.wait_for_timeout(500);c=await calls();await page.evaluate('()=>{const s=document.createElement("section");s.dataset.turn="assistant";s.dataset.turnId="a2";s.textContent="plain assistant";document.querySelector("main").append(s)}');await page.wait_for_timeout(250);c2=await calls();return {'before_new_assistant':len(c),'after':len(c2),'pass':len(c)==1 and len(c2)==1}
  await run('B01-S12','later plain assistant turn','command captured, later non-writing assistant appears','no duplicate/rebinding',s12)
  await browser.close()
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps({'block':'01 writing capture/finality','results':results,'pass':sum(x['status']=='PASS' for x in results),'fail':sum(x['status']=='FAIL' for x in results)},ensure_ascii=False,indent=2)+'\n');print(OUT.read_text())
 if any(x['status']=='FAIL' for x in results): raise SystemExit(1)
asyncio.run(main())
