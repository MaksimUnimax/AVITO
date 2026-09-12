"""Offline receipts: real Chromium, synthetic rendered message layouts.
Tests production functions, no live ChatGPT account or hidden application APIs."""
import asyncio,ast,json,os,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('AF_RECEIPTS_REPORT','/tmp/avito-receipts-v127.json'))
CID='11111111-1111-4111-8111-111111111111';ID={'origin':'https://chatgpt.com','chat_path':'/c/'+CID,'conversation_id':CID}
PAYLOAD='Avito Finder: выполнен ограниченный UI-план\nЗадача: fixture-only\n\n1. ПК — 10 000 ₽\nhttps://www.avito.ru/moskva/nastolnye_kompyutery/fixture_1000000001\nCPU i5-8400 / RAM 16 GB / SSD 256 GB\n\n2. ПК — 15 000 ₽\nПоследняя запись полностью.'
SHIM='''window.sentMessages=[];window.listeners=[];window.__AF_TEST_EXPORTS={};window.intentFail=false;window.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f),removeListener:f=>{listeners=listeners.filter(x=>x!==f)}},sendMessage:(m,cb)=>{sentMessages.push(m);cb?.(intentFail&&m.type==='AF_CAPTURE_REPORT_SEND_INTENT'?{ok:false,error:'fixture lost storage'}:{ok:true,data:null});}}};window.AF_SEND=m=>new Promise(r=>listeners.forEach(f=>f(m,{},r)));'''
APP=r'''()=>{window.clicks=0;window.expansions=0;window.publicMutations=0;const e=document.querySelector('textarea');window.mode='folded';window.afterDelay=0;
 window.appendReport=(text,id='new-user',shape=mode)=>{const s=document.createElement(shape==='article'?'article':'section');s.dataset.turn='user';s.dataset.turnId=id;const role=document.createElement('div');role.dataset.messageAuthorRole='user';const body=document.createElement('div');body.className='whitespace-pre-wrap';body.id='body-'+id;body.style.whiteSpace='pre-wrap';body.textContent=text;const toolbar=document.createElement('div');toolbar.className='controls';const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Развернуть');b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls',body.id);b.textContent='РазвернутьСвернуть';b.onclick=()=>{expansions++;body.hidden=false;b.setAttribute('aria-expanded','true');b.textContent='Свернуть';};toolbar.append(b);role.append(body,toolbar);s.append(role);document.querySelector('main').append(s);body.hidden=['folded','hydrating','remount','wrapped_controls','label_only'].includes(shape);if(shape==='wrapped_controls'){const wrapper=document.createElement('div');wrapper.className='whitespace-pre-wrap';body.className='message-text';body.replaceWith(wrapper);wrapper.append(body,toolbar);}if(shape==='label_only'){b.removeAttribute('aria-label');b.removeAttribute('aria-expanded');b.removeAttribute('aria-controls');}if(shape==='plain')toolbar.remove();if(shape==='split_role'){body.remove();s.prepend(body);}if(shape==='hydrating'){const save=body.textContent;body.textContent='';setTimeout(()=>{body.textContent=save;body.hidden=false},200);}if(shape==='remount'){const replacement=s.cloneNode(true);setTimeout(()=>{s.replaceWith(replacement);replacement.querySelector('.whitespace-pre-wrap').hidden=false},150);}return s;};
 document.querySelector('#send').onclick=()=>{clicks++;const text=e.value;e.value='';setTimeout(()=>appendReport(text,'new-user',mode),afterDelay);};}'''
async def main():
 results=[];errors=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking']);ctx=await browser.new_context();await ctx.route('**/*',lambda r:r.abort());p=None
  async def load():
   nonlocal p
   if p:await p.close()
   p=await ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
   await p.set_content('<main><section data-turn="user" data-turn-id="initial"><div data-message-author-role="user">Ищи</div></section></main><form><textarea id="prompt-textarea" style="width:90%;height:100px"></textarea><button type="button" id="send" data-testid="send-button" aria-label="Отправить">Отправить</button></form>')
   await p.add_script_tag(content=SHIM);await p.evaluate(APP);await p.add_script_tag(path=str(ROOT/'core.js'));await p.add_script_tag(content='(()=>{const location=window.AF_LOC=new URL('+json.dumps('https://chatgpt.com/c/'+CID)+');'+(ROOT/'chatgpt_content.js').read_text()+'})();')
  async def msg(m):return await p.evaluate('m=>AF_SEND(m)',m)
  def report(text=PAYLOAD):return {'type':'AF_CAPTURE_SEND_REPORT','search_id':'fixture','delivery_id':'id','expected_identity':ID,'report_text':text}
  async def scan(text=PAYLOAD):return await p.evaluate('t=>{const x=__AF_TEST_EXPORTS.chatCapture.inspectNewUserAnchor(new Set(["initial"]),t);return {id:x.anchor_turn_id,selection:x.anchor_selection,bodies:x.candidates.map(c=>({text:c.text,readings:c.readings}))}}',text)
  async def run(name,fn):
   if os.environ.get('AF_RECEIPT_FILTER') and os.environ['AF_RECEIPT_FILTER'] not in name:return
   start=time.monotonic()
   try:await asyncio.wait_for(fn(),25);r={'name':name,'status':'PASS'}
   except Exception as e:r={'name':name,'status':'FAIL','error':str(e)}
   r['ms']=round(1000*(time.monotonic()-start));results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True)
  for shape in ['folded','visible_controls','plain','split_role','hydrating','remount','article','wrapped_controls','label_only']:
   async def positive(shape=shape):
    await load();await p.evaluate('m=>mode=m',shape);r=await msg(report());assert r['ok'],r;assert r['anchor_turn_id']=='new-user';assert await p.evaluate('clicks')==1
   await run('sent-message body recognition: '+shape,positive)
  async def live_size():
   await load();text=(PAYLOAD+'\n')*100;text=text[:19495];r=await msg(report(text));assert r['ok'],r;assert await p.evaluate('clicks')==1
  await run('19,495-character folded report acknowledged after one Send',live_size)
  async def no_scrape_hidden():
   await load();await p.evaluate('t=>appendReport(t)',PAYLOAD);r=await scan();assert r['id'] is None and all(not x['text'] for x in r['bodies']),r;assert await p.evaluate('expansions')==0
  await run('hidden body is not scraped or accepted merely because it exists',no_scrape_hidden)
  for kind in ['foreign','prefix','wrong_price','missing_tail','duplicate']:
   async def negative(kind=kind):
    await load();t='Other user message' if kind=='foreign' else PAYLOAD[:130] if kind=='prefix' else PAYLOAD.replace('10 000','99 000') if kind=='wrong_price' else PAYLOAD[:-20] if kind=='missing_tail' else PAYLOAD
    await p.evaluate('t=>appendReport(t,"first","visible_controls")',t)
    if kind=='duplicate':await p.evaluate('t=>appendReport(t,"second","visible_controls")',t)
    r=await scan();assert r['id'] is None,r;assert await p.evaluate('clicks')==0
   await run('no false receipt: '+kind,negative)
  async def scripts():
   await load();await p.evaluate('t=>{const s=appendReport(t,"first","visible_controls");const d=document.createElement("span");d.hidden=true;d.textContent="SECRET NOT MESSAGE";s.append(d);}',PAYLOAD);r=await scan();assert r['id']=='first' and 'SECRET' not in json.dumps(r),r
  await run('hidden labels and controls excluded from message text',scripts)
  async def unsafe_expand():
   await load();await p.evaluate('t=>{const s=appendReport(t);const b=s.querySelector("button");b.setAttribute("aria-controls","prompt-textarea");b.onclick=()=>publicMutations++;}',PAYLOAD)
   r=await p.evaluate('t=>__AF_TEST_EXPORTS.chatCapture.waitForNewUserAnchor(new Set(["initial"]),t,{timeout_ms:250})',PAYLOAD);assert r is None;assert await p.evaluate('publicMutations')==0
  await run('expand control pointing outside pending user message never clicked',unsafe_expand)
  async def intent_failure():
   await load();await p.evaluate('intentFail=true');r=await msg(report());assert not r['ok'] and r['code']=='REPORT_SEND_INTENT_NOT_PERSISTED',r;assert await p.evaluate('clicks')==0
  await run('failed durable intent prevents actual Send click',intent_failure)
  for action in ['STOP','different_chat']:
   async def cancelled(action=action):
    await load();await p.evaluate('afterDelay=5000');task=asyncio.create_task(msg(report()));await p.wait_for_function('clicks===1')
    if action=='STOP':await msg({'type':'AF_CAPTURE_STOP','expected_identity':ID})
    else:await p.evaluate("AF_LOC.href='https://chatgpt.com/c/22222222-2222-4222-8222-222222222222'")
    r=await task;assert not r['ok'] and r['send_attempted'],r;assert await p.evaluate('clicks')==1
   await run('acknowledgement wait fenced after '+action,cancelled)
  for state in ['legacy','receipt_with_evicted_predecessor','unknown_predecessor']:
   async def recovery(state=state):
    await load();await p.evaluate('t=>appendReport(t)',PAYLOAD)
    if state!='legacy':await p.evaluate('document.querySelector("section[data-turn-id=initial]").remove()')
    m={'type':'AF_CAPTURE_RECONCILE_REPORT','search_id':'fixture','expected_identity':ID,'previous_anchor_turn_id':'initial','report_text':PAYLOAD}
    if state=='receipt_with_evicted_predecessor':m['receipt']={'baseline_user_turn_ids':['initial']}
    r=await msg(m);assert r['ok'],r;assert (r['state']=='confirmed')==(state!='unknown_predecessor'),r;assert await p.evaluate('clicks')==0
   await run('receipt migration/recovery: '+state,recovery)
  async def newer_foreign():
   await load();await p.evaluate('t=>{appendReport(t,"match","visible_controls");appendReport("new manual question","other","visible_controls");}',PAYLOAD);r=await scan();assert r['id']=='match',r
  await run('newer unrelated turn cannot steal matching report anchor',newer_foreign)
  await browser.close()
 out={'scope':'OFFLINE_CHROMIUM_PUBLIC_MESSAGE_LAYOUT_FIXTURES','installed_extension':False,'live_chatgpt':False,'tests':results,'pass':sum(r['status']=='PASS' for r in results),'fail':sum(r['status']=='FAIL' for r in results),'page_errors':errors};OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2));assert not out['fail'] and not errors
if __name__=='__main__':asyncio.run(main())
