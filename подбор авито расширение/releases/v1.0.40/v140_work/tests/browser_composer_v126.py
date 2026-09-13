"""Production adapter in offline Chromium, not installed/live ChatGPT.
Rich editor model is a synthetic paragraph-normalizing fixture; not ProseMirror itself.
No network, browser policies, accounts, or hidden app APIs used by runtime.
"""
import asyncio,json,os,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('AF_COMPOSER_REPORT','/tmp/af-composer-v126.json'))
CID='11111111-1111-4111-8111-111111111111'
ID={'origin':'https://chatgpt.com','chat_path':'/c/'+CID,'conversation_id':CID}
PAYLOAD='Avito Finder: выполнен ограниченный UI-план\nЗадача: fixture-only\n\n1. Компьютер — 14 000 ₽\nCPU: i5-8400 / RAM: 16 GB\nhttps://www.avito.ru/test/nastolnye_kompyutery/fixture_1000000001\n\n2. ПК — 12 000 ₽\nSSD 480 GB;👩‍💻; A  B; <script>BAD</script>'
SHIM='''window.sentMessages=[];window.listeners=[];window.__AF_TEST_EXPORTS={};window.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f),removeListener:f=>{listeners=listeners.filter(x=>x!==f)}},sendMessage:(m,cb)=>{sentMessages.push(m);let r={ok:true,data:null};cb?.(r);return Promise.resolve(r);}}}; window.AF_SEND=m=>new Promise(resolve=>listeners.forEach(l=>l(m,{},resolve)));'''
EDITOR=r'''mode=>{window.clicks=0;window.delivered=[];window.editorModel='';window.normalizeMode='p';
 const e=document.querySelector('#prompt-textarea');e.style.cssText='white-space:pre-wrap;height:220px;overflow:auto;border:1px solid;width:100%';
 function inline(n){if(n.nodeType===3)return n.nodeValue;if(n.nodeName==='BR')return n.classList.contains('ProseMirror-trailingBreak')?'':'\n';return [...n.childNodes].map(inline).join('');}
 function read(){if(mode==='textarea')return e.value;const blocks=[...e.children].filter(n=>['P','DIV'].includes(n.tagName));if(!blocks.length)return e.textContent.replace(/\n/g,' ');return blocks.map(n=>n.childNodes.length===1&&n.firstChild.nodeName==='BR'?'':inline(n)).join('\n');}
 window.setFixtureModel=t=>{editorModel=t;if(mode==='textarea'){e.value=t;return;}const frag=document.createDocumentFragment();
 if(normalizeMode==='br'){const para=document.createElement('p');t.split('\n').forEach((line,i)=>{if(i)para.append(document.createElement('br'));para.append(document.createTextNode(line));});frag.append(para);}else{for(const line of t.split('\n')){let p=document.createElement(normalizeMode==='div'?'div':'p');if(line)p.textContent=line;else p.append(document.createElement('br'));frag.append(p);}}e.replaceChildren(frag);};
 e.addEventListener('input',()=>{setTimeout(()=>{const t=read();setFixtureModel(t);},25);});
 document.querySelector('button').onclick=()=>{clicks++;delivered.push(editorModel);const s=document.createElement('section');s.dataset.turn='user';s.dataset.turnId='report'+clicks;const d=document.createElement('div');d.dataset.messageAuthorRole='user';d.style.whiteSpace='pre-wrap';d.textContent=editorModel;s.append(d);document.querySelector('main').append(s);setFixtureModel('');};}'''
async def main():
 results=[];errors=[];test_number=0
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
  ctx=await b.new_context(viewport={'width':1000,'height':850});await ctx.route('**/*',lambda r:r.abort())
  p=None
  async def load(mode='rich',html=None):
   nonlocal p
   if p:await p.close()
   p=await ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
   control='<textarea id="prompt-textarea"></textarea>' if mode=='textarea' else '<div id="prompt-textarea" class="ProseMirror" contenteditable="true"><p><br></p></div>'
   await p.set_content('<main><section data-turn="user" data-turn-id="initial"><div data-message-author-role="user">Ищи</div></section></main><form style="position:fixed;bottom:0;height:300px;width:90%">'+control+'<button type="button" data-testid="send-button" aria-label="Отправить">Отправить</button></form>')
   await p.add_script_tag(content=SHIM);await p.evaluate(EDITOR,mode)
   await p.add_script_tag(path=str(ROOT/'core.js'))
   await p.add_script_tag(content="(()=>{const location=window.AF_LOC=new URL('https://chatgpt.com/c/"+CID+"');"+(ROOT/'chatgpt_content.js').read_text()+"})();")
   if html:await p.locator('#prompt-textarea').evaluate('(e,h)=>e.innerHTML=h',html)
  async def msg(m):return await p.evaluate('m=>AF_SEND(m)',m)
  def report(text=PAYLOAD,**kw):return {'type':'AF_CAPTURE_SEND_REPORT','expected_identity':ID,'search_id':'fixture-only','delivery_id':'delivery','report_text':text,**kw}
  async def count(n):assert await p.evaluate('clicks')==n
  async def run(name,fn):
   nonlocal test_number
   test_number+=1
   if test_number<int(os.environ.get('AF_TEST_FROM','1')) or test_number>int(os.environ.get('AF_TEST_TO','999')):return
   if os.environ.get('AF_TEST_FILTER') and os.environ['AF_TEST_FILTER'] not in name:return
   print('START '+name,flush=True)
   started=time.monotonic()
   try:await asyncio.wait_for(fn(),15);r={'test':name,'status':'PASS'}
   except Exception as e:r={'test':name,'status':'FAIL','error':str(e)}
   r['ms']=round((time.monotonic()-started)*1000);results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True)
  async def roundtrip(mode):
   await load(mode);r=await msg(report());assert r['ok'],r;await count(1)
   assert await p.evaluate('delivered[0]')==PAYLOAD
   assert await p.evaluate("document.querySelectorAll('#prompt-textarea script').length")==0
  await run('multiline textarea retains exact payload',lambda:roundtrip('textarea'))
  await run('multiline contenteditable preserves lines through asynchronous model reparse; one Send',lambda:roundtrip('rich'))
  for shape in ['div','br']:
   async def reshaped(shape=shape):
    await load();await p.evaluate('x=>normalizeMode=x',shape);r=await msg(report());assert r['ok'],r;await count(1);assert await p.evaluate('delivered[0]')==PAYLOAD
   await run('same report after editor converts paragraphs to '+shape,reshaped)
  async def long_report():
   await load();t='Avito Finder: synthetic long report\n\n'+'\n\n'.join(f'{i}. Системный блок — {8000+i} ₽\nCPU i5-8400 RAM 16 GB SSD 256 GB\nhttps://www.avito.ru/test/nastolnye_kompyutery/fixture_{1000000000+i}\n'+'Описание '*12 for i in range(1,121))
   assert len(t)>13247;r=await msg(report(t));assert r['ok'],r;assert await p.evaluate('delivered[0]')==t;await count(1)
  await run('120-row rich-editor report exceeds failed live size without truncation',long_report)
  async def exactly_live_length():
   await load();t=(PAYLOAD+'\n')*60;t=t[:13247];r=await msg(report(t));assert r['ok'],r;assert await p.evaluate('delivered[0]')==t
  await run('13,247-character synthetic report delivers in rich editor',exactly_live_length)
  async def blank_and_unicode():
   await load();t='\n\nА  Б\n\n\nRAM\t16 GB\n1\u00a0000 ₽\n👩\u200d💻\u200b\n\n';r=await msg(report(t));assert r['ok'],r;assert await p.evaluate('delivered[0]')==t
  await run('blank lines, tabs, double spaces, NBSP, ZWJ and zero-width text preserved',blank_and_unicode)
  async def duplicate():
   await load();r=await asyncio.gather(msg(report()),msg(report()));assert all(x['ok'] for x in r),r;r=await msg(report());assert r['ok'],r;await count(1)
  await run('concurrent duplicate and repeated delivery ID yield one click',duplicate)
  async def edit(kind):
   await load();task=asyncio.create_task(msg(report()));await p.wait_for_timeout(200)
   if kind=='real_input':await p.locator('#prompt-textarea').fill('MY DRAFT')
   elif kind=='no_button':
    await p.locator('#prompt-textarea').fill('MY DRAFT');await p.locator('button').evaluate('e=>e.remove()')
   elif kind=='price':await p.evaluate("setFixtureModel(editorModel.replace('14 000','99 000'))")
   elif kind=='blank_line':await p.evaluate("setFixtureModel(editorModel.replace('\\n\\n','\\n'))")
   elif kind=='zwj':await p.evaluate("setFixtureModel(editorModel.replace('👩‍💻','👩💻'))")
   elif kind=='undo_same':await p.locator('#prompt-textarea').fill('OTHER');await p.locator('#prompt-textarea').fill(PAYLOAD)
   r=await task;assert not r['ok'],r;await count(0)
   if kind in ['real_input','no_button']:assert await p.locator('#prompt-textarea').inner_text()=='MY DRAFT'
  for kind in ['real_input','no_button','price','blank_line','zwj','undo_same']:
   await run('protect against edit during staging: '+kind,lambda kind=kind:edit(kind))
  async def missing_button():
   await load();await p.locator('button').evaluate('e=>e.remove()');r=await msg(report());assert not r['ok'] and r['code']=='PRIMARY_COMPOSER_SEND_BUTTON_MISSING',r
   assert await p.evaluate('editorModel')==PAYLOAD;await count(0)
  await run('missing Send leaves complete report, does not clear composer',missing_button)
  async def delayed_send_button():
   await load();await p.locator('button').evaluate("e=>e.style.display='none'")
   task=asyncio.create_task(msg(report()));await p.wait_for_timeout(3500);await p.locator('button').evaluate("e=>e.style.display='block'")
   r=await task;assert r['ok'],r;await count(1);assert await p.evaluate('delivered[0]')==PAYLOAD
  await run('Send control appearing after old fixed 2s window is discovered without operator click',delayed_send_button)
  async def stopped():
   await load();t=asyncio.create_task(msg(report()));await p.wait_for_timeout(200);await msg({'type':'AF_CAPTURE_STOP','expected_identity':ID});r=await t;assert not r['ok'] and r['code']=='REPORT_SEND_CANCELLED',r;await count(0)
  await run('STOP fences later rich-editor Send',stopped)
  async def changedroute():
   await load();t=asyncio.create_task(msg(report()));await p.wait_for_timeout(200);await p.evaluate("AF_LOC.href='https://chatgpt.com/c/22222222-2222-4222-8222-222222222222'");r=await t;assert not r['ok'],r;await count(0)
  await run('route change before Send blocks different conversation',changedroute)
  async def stale_stage():
   await load();await p.evaluate("setFixtureModel('FOREIGN DRAFT');const e=document.querySelector('#prompt-textarea');e.setAttribute('data-avito-finder-staged-report','1');e.setAttribute('data-avito-finder-staged-run-id','fixture-only')")
   r=await msg(report());assert not r['ok'] and r['code']=='PRIMARY_COMPOSER_OCCUPIED',r;await count(0);assert await p.evaluate('editorModel')=='FOREIGN DRAFT'
  await run('ownership attributes cannot substitute equality or authorize draft overwrite',stale_stage)
  async def structured_preexisting():
   await load();await p.evaluate('t=>setFixtureModel(t)',PAYLOAD);r=await msg(report());assert r['ok'],r;await count(1)
  await run('exact preexisting p-block report can be delivered without rewriting',structured_preexisting)
  async def clear_input_false():
   await load();await p.evaluate("document.querySelector('#prompt-textarea').addEventListener('input',()=>setTimeout(()=>setFixtureModel(editorModel.replace(/\\n/g,' ')),50))")
   r=await msg(report());assert not r['ok'] and r['code']=='REPORT_TEXT_ROUNDTRIP_MISMATCH',r;await count(0)
   ds=await p.evaluate('sentMessages.flatMap(m=>[m.details,m.payload?.details]).filter(x=>x&&x.code==="REPORT_TEXT_READBACK_MISMATCH")')
   assert ds,await p.evaluate('sentMessages');assert ds[-1]['user_input_observed']==False
   assert ds[-1]['first_mismatch_index']>=0 and ds[-1]['readback_line_count']!=ds[-1]['expected_line_count']
   assert PAYLOAD not in json.dumps(ds,ensure_ascii=False)
  await run('unsupported editor transformation fails with readback diagnostics, not user blame',clear_input_false)
  async def reconcile(case):
   await load()
   if case=='staged':await p.evaluate('t=>setFixtureModel(t)',PAYLOAD)
   if case in ['confirmed','unrelated','prefix','missing_anchor']:
    text=PAYLOAD if case in ['confirmed','missing_anchor'] else 'Manual question' if case=='unrelated' else PAYLOAD[:140]+'CHANGED TAIL'
    await p.evaluate('t=>{const s=document.createElement("section");s.dataset.turn="user";s.dataset.turnId="new-user";const d=document.createElement("div");d.dataset.messageAuthorRole="user";d.style.whiteSpace="pre-wrap";d.textContent=t;s.append(d);document.querySelector("main").append(s)}',text)
   r=await msg({'type':'AF_CAPTURE_RECONCILE_REPORT','expected_identity':ID,'search_id':'fixture-only','previous_anchor_turn_id':'missing' if case=='missing_anchor' else 'initial','report_text':PAYLOAD})
   assert r['ok'],r;assert r['state']=={'confirmed':'confirmed','staged':'staged'}.get(case,'empty'),r;await count(0)
  for case in ['confirmed','staged','unrelated','prefix','missing_anchor']:
   await run('read-only reconciliation: '+case,lambda case=case:reconcile(case))
  async def selection():
   await load();task=asyncio.create_task(msg(report()));await p.wait_for_timeout(200);await p.locator('#prompt-textarea').click();r=await task;assert r['ok'],r
  await run('focus/selection alone is not a user edit',selection)
  async def competing():
   await load();a=asyncio.create_task(msg(report()));await p.wait_for_timeout(200)
   r=await msg(report('OTHER REPORT',delivery_id='other'));assert not r['ok'] and r['code']=='REPORT_COMPOSER_SEND_IN_PROGRESS',r
   first=await a;assert first['ok'],first;await count(1);assert await p.evaluate('delivered[0]')==PAYLOAD
  await run('different simultaneous reports cannot take over the same composer',competing)
  async def fingerprints():
   await load();r=await msg(report('A👩‍💻B'));assert r['ok'],r
   r=await msg(report('A👩💻B'));assert not r['ok'] and r['code']=='REPORT_DELIVERY_PAYLOAD_CONFLICT',r;await count(1)
  await run('hash equality cannot coalesce a different Unicode payload',fingerprints)
  await b.close()
 out={'scope':'OFFLINE_CHROMIUM_SYNTHETIC_RICH_EDITOR_WITH_MODEL_REPARSE','installed_extension':False,'live_chatgpt':False,'tests':results,'pass':sum(r['status']=='PASS' for r in results),'fail':sum(r['status']=='FAIL' for r in results),'page_errors':errors}
 OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in out.items() if k!='tests'},ensure_ascii=False))
 if out['fail'] or errors:raise SystemExit(1)
asyncio.run(main())
