import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright

REPO = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get("AF_SOURCE_ROOT", REPO / "подбор авито расширение" / "releases" / "v1.0.42" / "v142_work")).resolve()
OUT = Path(os.environ.get("AF_GREEN_OUT", REPO / "подбор авито расширение" / "v142_prepatch_tests" / "GREEN_LOCAL.json"))
CID = "11111111-1111-4111-8111-111111111111"
BASE = '''<!doctype html><body><main id="turns"><section data-turn="user" data-turn-id="start"><div data-message-author-role="user">Ищи</div></section></main><form><textarea id="prompt-textarea"></textarea><button type="button" data-testid="send-button">Send</button></form></body>'''
SHIM = '''(()=>{const ls=new Set();window.__AF_TEST_EXPORTS={};window.sentMessages=[];window.chrome={runtime:{onMessage:{addListener:f=>ls.add(f),removeListener:f=>ls.delete(f)},sendMessage:(m,cb)=>{sentMessages.push(m);const r={ok:true,data:{accepted:true}};cb?.(r);return Promise.resolve(r);}}};window.AF_FIXTURE_SEND=m=>new Promise(r=>{for(const l of [...ls])l(m,{},r)});window.__AF_TEST_PROMPT_STABILITY_MS=80;window.__AF_TEST_PROMPT_PAYLOAD_SAMPLE_MS=40;window.__AF_TEST_PROMPT_PAYLOAD_STABILITY_MS=120;window.__AF_TEST_PROMPT_INVALID_PAYLOAD_STABILITY_MS=240;window.__AF_TEST_PROMPT_PAYLOAD_MIN_SAMPLES=3;window.__AF_TEST_PROMPT_PAYLOAD_EXTRACTION_MAX_MISSES=3;window.__AF_TEST_PROMPT_PAYLOAD_EXTRACTION_TIMEOUT_MS=500;})();'''
VALID = "Режим:\nAVITO_UI\nСтраница:\nhttps://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864\nШаги:\nСобери до 20 видимых объявлений."

async def inject_runtime(page):
    await page.set_content(BASE)
    await page.add_script_tag(content=SHIM)
    await page.add_script_tag(path=str(SOURCE / "core.js"))
    code = "(()=>{const location=window.AF_FIXTURE_LOCATION=new URL('https://chatgpt.com/c/" + CID + "');" + (SOURCE / "chatgpt_content.js").read_text(encoding="utf-8") + "})();"
    await page.add_script_tag(content=code)

async def add_current_writing_block(page, with_unrelated=False):
    await page.evaluate('''(x)=>{const s=document.createElement('section');s.dataset.turn='assistant';s.dataset.turnId='a1';const root=document.createElement('div');root.id='wb-root';const body=document.createElement('pre');body.id='wb';body.textContent=x.text;root.append(body);const edit=document.createElement('button');edit.dataset.testid='writing-block-header-magic-edit-button';edit.ariaLabel='Редактировать';edit.textContent='Редактировать';root.append(edit);const copy=document.createElement('button');copy.ariaLabel='Копировать';copy.textContent='Копировать';root.append(copy);s.append(root);if(x.unrelated){const u=document.createElement('button');u.id='unrelated';u.ariaLabel='Предложение 0';u.title='Предложение 0';u.textContent='Предложение';s.append(u);}document.querySelector('main').append(s);}''', {"text": VALID, "unrelated": with_unrelated})

async def start(page):
    await page.evaluate("c=>__AF_TEST_EXPORTS.chatCapture.startFixturePromptPoll({run_id:'fixture',conversation_id:c,anchor_turn_id:'start'})", CID)

async def snapshot(page):
    return await page.evaluate('''()=>({full:sentMessages.filter(m=>m.type==='AF_CAPTURE_FULL_TEXT').map(m=>m.candidate?.prompt_text||''),diagnostics:sentMessages.filter(m=>m.type==='AF_CAPTURE_DIAGNOSTIC').map(m=>({code:m.details?.code||'',structural_signature:m.details?.structural_signature||'',rejection_reason:m.details?.rejection_reason||''})),clone_count:window.__afWbCloneCount||0})''')

async def scenario_transient(page):
    await inject_runtime(page); await add_current_writing_block(page)
    await page.evaluate('''()=>{const nativeClone=Element.prototype.cloneNode;window.__afWbCloneCount=0;Element.prototype.cloneNode=function(deep){const clone=nativeClone.call(this,deep);if(this instanceof Element&&this.id==='wb-root'){window.__afWbCloneCount+=1;if(window.__afWbCloneCount%10===0){const body=clone.querySelector('#wb');if(body)body.textContent='';}}return clone;};}''')
    await start(page); await page.wait_for_timeout(1250); s=await snapshot(page)
    codes=[x['code'] for x in s['diagnostics']]
    ok=s['full']==[VALID] and codes.count('PROMPT_PAYLOAD_EXTRACTION_RETRY')>=1
    return {'name':'transient same-block extraction miss','full_text_count':len(s['full']),'retry_count':codes.count('PROMPT_PAYLOAD_EXTRACTION_RETRY'),'structural_restarts':codes.count('PROMPT_DOM_STABILITY_STARTED'),'pass':ok}

async def scenario_churn(page):
    await inject_runtime(page); await add_current_writing_block(page,True)
    await page.evaluate("()=>{let n=0;window.__afChurn=setInterval(()=>{const b=document.querySelector('#unrelated');if(!b)return;n+=1;b.title='Предложение '+n;b.setAttribute('aria-label','Предложение '+n);},20);}")
    await start(page); await page.wait_for_timeout(650); await page.evaluate("()=>clearInterval(window.__afChurn)"); s=await snapshot(page)
    starts=[x for x in s['diagnostics'] if x['code']=='PROMPT_DOM_STABILITY_STARTED']; sigs={x['structural_signature'] for x in starts if x['structural_signature']}
    ok=s['full']==[VALID] and len(starts)<=2
    return {'name':'unrelated assistant control churn','full_text_count':len(s['full']),'structural_restarts':len(starts),'distinct_structural_signatures':len(sigs),'pass':ok}

async def scenario_bounded_failure(page):
    await inject_runtime(page); await add_current_writing_block(page)
    await page.evaluate('''()=>{const nativeClone=Element.prototype.cloneNode;window.__afWbCloneCount=0;Element.prototype.cloneNode=function(deep){const clone=nativeClone.call(this,deep);if(this instanceof Element&&this.id==='wb-root'){window.__afWbCloneCount+=1;if(window.__afWbCloneCount%6===0){const body=clone.querySelector('#wb');if(body)body.textContent='';}}return clone;};}''')
    await start(page); await page.wait_for_timeout(900); s=await snapshot(page)
    codes=[x['code'] for x in s['diagnostics']]
    bounded=codes.count('PROMPT_PAYLOAD_EXTRACTION_FAILED_BOUNDED')==1
    ok=len(s['full'])==0 and bounded
    return {'name':'persistent extraction loss bounded terminal','full_text_count':len(s['full']),'retry_count':codes.count('PROMPT_PAYLOAD_EXTRACTION_RETRY'),'bounded_failure_count':codes.count('PROMPT_PAYLOAD_EXTRACTION_FAILED_BOUNDED'),'pass':ok}

async def main():
    manifest=json.loads((SOURCE/'manifest.json').read_text(encoding='utf-8'))
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None,headless=True,args=['--no-sandbox','--disable-gpu'])
        ctx=await browser.new_context(viewport={'width':1000,'height':700});await ctx.route('**/*',lambda route:route.abort())
        results=[]
        for fn in (scenario_transient,scenario_churn,scenario_bounded_failure):
            p=await ctx.new_page();results.append(await fn(p));await p.close()
        await browser.close()
    report={'schema':'avito_finder_v142_capture_green_v1','source_version':manifest.get('version'),'source_root':str(SOURCE),'scenarios':results,'status':'PASS' if all(x['pass'] for x in results) else 'FAIL'}
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report['status']=='PASS' else 1)

if __name__=='__main__':
    asyncio.run(main())
