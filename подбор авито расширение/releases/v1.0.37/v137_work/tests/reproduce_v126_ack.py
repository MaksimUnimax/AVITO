"""Offline reproduction using unchanged v1.0.26 adapter and synthetic folded UI.
The payload and DOM are fixtures, NOT a recovered live DOM or user report.
"""
import asyncio,json,os,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(os.environ.get('AF_SOURCE_ROOT',str(Path(__file__).resolve().parents[1])))
OUT=Path(os.environ.get('AF_ACK_REPRO_REPORT','/tmp/avito-ack-repro.json'))
CID='11111111-1111-4111-8111-111111111111'
IDENTITY={'origin':'https://chatgpt.com','conversation_id':CID,'chat_path':'/c/'+CID}
PAYLOAD=('Avito Finder: выполнен ограниченный UI-план\nЗадача: fixture-p1\n'+('Синтетическая строка — 10 000 ₽\n'*900))[:19495]
SHIM='''window.sentMessages=[];const listeners=new Set();window.chrome={runtime:{onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)},sendMessage:(m,cb)=>{sentMessages.push(m);cb?.({ok:true,data:null});}}};window.AF_SEND=m=>new Promise(r=>{for(const f of listeners)f(m,{},r)});'''
async def main():
 results=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
  ctx=await browser.new_context();await ctx.route('**/*',lambda r:r.abort())
  async def case(mode):
   p=await ctx.new_page();await p.set_content('<main><section data-turn="user" data-turn-id="initial"><div data-message-author-role="user">Ищи</div></section></main><form><textarea id="prompt-textarea" style="width:90%;height:80px"></textarea><button type="button" id="send" data-testid="send-button" aria-label="Отправить">Отправить</button></form>')
   await p.add_script_tag(content=SHIM)
   await p.evaluate('''mode=>{window.clicks=0;window.expansions=0;document.getElementById('send').onclick=()=>{clicks++;const e=document.querySelector('textarea'),s=document.createElement('section');s.dataset.turn='user';s.dataset.turnId='report-1';const role=document.createElement('div');role.dataset.messageAuthorRole='user';const body=document.createElement('div');body.id='report-body';body.className='whitespace-pre-wrap';body.style.whiteSpace='pre-wrap';body.textContent=e.value;const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Развернуть');b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls',body.id);b.textContent='РазвернутьСвернуть';b.onclick=()=>{expansions++;body.hidden=false;b.setAttribute('aria-expanded','true');b.textContent='Свернуть';};role.append(body,b);s.append(role);document.querySelector('main').append(s);body.hidden=mode==='folded';e.value='';};}''',mode)
   await p.add_script_tag(path=str(ROOT/'core.js'));await p.add_script_tag(content='(()=>{const location=new URL('+json.dumps('https://chatgpt.com/c/'+CID)+');'+(ROOT/'chatgpt_content.js').read_text()+'})();')
   t=time.monotonic();response=await p.evaluate('m=>AF_SEND(m)',{'type':'AF_CAPTURE_SEND_REPORT','expected_identity':IDENTITY,'search_id':'fixture','delivery_id':'fixture-p1','report_text':PAYLOAD})
   stats=await p.evaluate('''()=>({clicks,expansions,rawCandidateText:document.querySelector('section[data-turn-id="report-1"] [data-message-author-role="user"]').innerText,events:sentMessages.filter(m=>m.details?.code?.includes('CANDIDATE')).map(m=>m.details)})''')
   result={'scenario':mode,'response':response,'clicks':stats['clicks'],'expand_clicks':stats['expansions'],'candidate_length':len(stats['rawCandidateText']),'raw_candidate_if_short':stats['rawCandidateText'] if len(stats['rawCandidateText'])<50 else None,'candidate_events':stats['events'],'elapsed_ms':round(1000*(time.monotonic()-t))};results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True);await p.close()
  await asyncio.gather(case('folded'),case('visible_with_controls'))
  await browser.close()
 OUT.write_text(json.dumps({'scope':'OFFLINE_PRODUCTION_V126_SYNTHETIC_FOLDED_MESSAGE','live_DOM_available':False,'results':results},ensure_ascii=False,indent=2))
asyncio.run(main())
