"""Offline cross-component emulator: production worker in Node VM and production
content adapters in Chromium. Chrome APIs/sites are simulated, not live acceptance.
All navigation is to about:blank; external requests are blocked."""
import asyncio,json,os,time,traceback
from pathlib import Path
from playwright.async_api import async_playwright
TESTROOT=Path(__file__).resolve().parents[1]
ROOT=Path(os.environ.get('AF_SOURCE_ROOT',str(TESTROOT)))
OUT=Path(os.environ.get('AF_CYCLE_REPORT','/tmp/avito-cycle-v127.json'))
CID='11111111-1111-1111-1111-111111111111';CHAT='https://chatgpt.com/c/'+CID
SEARCH='https://www.avito.ru/all/nastolnye_kompyutery?f=ASgCAgECAUXGmgwYeyJmcm9tIjo4MDAwLCJ0byI6MTUwMDB9&q=computer&s=104'
def command(url):return 'Режим:\nAVITO_UI\n\nСтраница:\n'+url+'\n\nСобери до 30 видимых объявлений.\nDetail не открывать.\nНе писать продавцам. Не открывать телефон. Не покупать.'
def cards(offset):
 return ''.join(f'<article data-marker="item" style="height:65px"><a data-marker="item-title" href="/moskva/nastolnye_kompyutery/fixture_{1000000000+offset+i}">Рабочий ПК {offset+i}</a><span data-marker="item-price">10 000 ₽</span><span data-marker="item-address">Москва</span><p>i5-8400, 16 GB RAM, SSD 256 GB. Синтетическая карточка.</p></article>' for i in range(30))
SHIM='''id=>{window.__AF_TEST_EXPORTS={};const ls=new Set();window.chrome={runtime:{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',getManifest:()=>({version:'1.0.34'}),onMessage:{addListener:f=>ls.add(f),removeListener:f=>ls.delete(f)},sendMessage:(message,cb)=>{const p=fixtureBridge({tab_id:id,message});p.then(r=>cb?.(r));return p;}}};window.AF_RPC_SEND=m=>new Promise(resolve=>{for(const l of [...ls])l(m,{},resolve)});}'''
APP=r'''config=>{window.sentReports=[];window.sendClicks=0;window.expandClicks=0;window.commandIndex=0;window.ackDelay=config.ack_delay||0;const e=document.getElementById('prompt-textarea');
 function read(n){if(n.nodeType===3)return n.nodeValue;if(n.nodeName==='BR')return '\n';return [...n.childNodes].map(read).join('');}
 window.renderAssistant=(text,i)=>{const s=document.createElement('section');s.dataset.turn='assistant';s.dataset.turnId='assistant-'+i;const w=document.createElement('div');if(!config.current_toolbar)w.dataset.writingBlock='cmd-'+i;else{const edit=document.createElement('button');edit.type='button';edit.dataset.testid='writing-block-header-magic-edit-button';edit.setAttribute('aria-label','Редактировать');edit.textContent='Редактировать';w.append(edit);}const p=document.createElement('pre');p.textContent=text;w.append(p);const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Копировать');b.textContent='Копировать';b.disabled=true;w.append(b);s.append(w);document.querySelector('main').append(s);setTimeout(()=>b.disabled=false,100);};
 document.getElementById('send').onclick=()=>{const text=[...e.children].map(p=>p.childNodes.length===1&&p.firstChild.nodeName==='BR'?'':read(p)).join('\n');sendClicks++;const i=sendClicks;e.replaceChildren(document.createElement('p'));const assistantFirst=text==='Ищи'&&config.start_mode==='assistant_first';let body=null,b=null;if(!assistantFirst){const s=document.createElement('section');s.dataset.turn='user';s.dataset.turnId='user-'+i;const role=document.createElement('div');role.dataset.messageAuthorRole='user';body=document.createElement('div');body.className='whitespace-pre-wrap';body.id='body-'+i;body.style.whiteSpace='pre-wrap';b=document.createElement('button');b.type='button';b.setAttribute('aria-controls',body.id);b.setAttribute('aria-expanded','false');b.setAttribute('aria-label','Развернуть');b.textContent='РазвернутьСвернуть';b.onclick=()=>{expandClicks++;body.hidden=false;b.textContent='Свернуть';b.setAttribute('aria-expanded','true');};role.append(body,b);s.append(role);document.querySelector('main').append(s);}const fill=()=>{if(!body)return;body.textContent=text;body.hidden=config.mode==='folded'&&b.getAttribute('aria-expanded')!=='true';if(config.mode==='plain')b.remove();};if(text==='Ищи'){fill();}else{sentReports.push(text);if(ackDelay)setTimeout(fill,ackDelay);else fill();}if(commandIndex<config.commands.length){const n=commandIndex++;setTimeout(()=>renderAssistant(config.commands[n],n),200);}};}'''
class Harness:
 def __init__(self,ctx,commands,mode='folded',ack_delay=0,fault=None,start_mode='normal'):
  self.ctx=ctx;self.commands=commands;self.mode=mode;self.ack_delay=ack_delay;self.start_mode=start_mode;self.pages={};self.pending={};self.counter=0;self.tasks=set();self.errors=[];self.trace=[];self.fault=fault;self.fault_used=False;self.fault_armed=False
 async def start(self):
  self.proc=await asyncio.create_subprocess_exec('node',str(TESTROOT/'tests/worker_browser_host_v127.cjs'),limit=2097152,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,env={**os.environ,'AF_SOURCE_ROOT':str(ROOT)})
  self.reader=asyncio.create_task(self.read());print('HOST_STARTED',flush=True);await self.ctx.expose_binding('fixtureBridge',lambda source,data:self.call('message',**data));await self.navigate(1,CHAT);print('CHAT_READY',flush=True);await self.navigate(7,SEARCH);print('AVITO_READY',flush=True);self.fault_armed=True
 async def call(self,op,**args):
  self.counter+=1;n=self.counter;f=asyncio.get_running_loop().create_future();self.pending[n]=f;self.write({'id':n,'op':op,**args});return await asyncio.wait_for(f,90)
 def write(self,obj):self.proc.stdin.write((json.dumps(obj,ensure_ascii=False)+'\n').encode())
 async def read(self):
  while line:=await self.proc.stdout.readline():
   m=json.loads(line)
   if os.environ.get('AF_DEBUG_CYCLE'):print('RPC',str(m)[:350],flush=True)
   if 'response' in m:
    f=self.pending.pop(m['response'],None)
    if f and not f.done():
     if m.get('error'):f.set_exception(RuntimeError(m['error']))
     else:f.set_result(m.get('result'))
   else:
    t=asyncio.create_task(self.browser_request(m));self.tasks.add(t);t.add_done_callback(self.tasks.discard)
 async def browser_request(self,m):
  try:
   method=m['method'];tid=m['tab_id'];self.trace.append({'method':method,'tab':tid,'message':m.get('message',{}).get('type'),'url':m.get('url')})
   if method=='navigate':result=await self.navigate(tid,m['url'])
   elif method=='close':
    if tid in self.pages:await self.pages.pop(tid).close()
    result=None
   elif method=='message':result=await self.pages[tid].evaluate('m=>AF_RPC_SEND(m)',m['message'])
   elif method=='execute':
    if m['files']:
     for name in m['files']:await self.inject(self.pages[tid],name)
     result=None
    else:result=await self.pages[tid].evaluate('args=>{const location=window.AF_LOC;return ('+m['func']+')(...args)}',m['args'])
   self.write({'browser_response':m['browser_request'],'result':result})
  except Exception as e:self.write({'browser_response':m['browser_request'],'error':str(e)})
 async def inject(self,p,name):await p.add_script_tag(content='(()=>{const location=window.AF_LOC;'+(ROOT/name).read_text()+'})();')
 async def navigate(self,tid,url):
  if tid not in self.pages:
   self.pages[tid]=await self.ctx.new_page();self.pages[tid].on('pageerror',lambda e:self.errors.append(str(e)))
  p=self.pages[tid]
  if 'chatgpt.com' in url:html='<main><section data-turn="user" data-turn-id="initial"><div data-message-author-role="user">Fixture greeting</div></section></main><form style="width:100%;height:180px"><div id="prompt-textarea" contenteditable="true" style="height:100px;white-space:pre-wrap;overflow:auto"></div><button type="button" id="send" data-testid="send-button" aria-label="Отправить">Отправить</button></form>'
  else:
   if self.fault_armed and self.fault and (not self.fault_used or self.fault=='captcha') and 'q=computer' in url:
    self.fault_used=True;html='<main><h1>'+('Доступ ограничен: проблема с IP' if self.fault=='ip_block' else ('Слишком много запросов. Попробуйте позже' if self.fault=='rate_limit' else 'Подтвердите, что вы не робот. CAPTCHA'))+'</h1></main>'
   else:html='<main>'+cards(30 if 'p=2' in url else 60 if 'system' in url else 0)+'</main>'
  await p.goto('about:blank');await p.set_content('<!doctype html><html><head><title>Offline fixture</title></head><body>'+html+'</body></html>');await p.evaluate('u=>window.AF_LOC=new URL(u)',url);await p.evaluate(SHIM,tid);await p.evaluate('m=>chrome.runtime.getManifest=()=>m',json.loads((ROOT/'manifest.json').read_text()))
  if 'chatgpt.com' in url:await p.evaluate(APP,{'commands':self.commands,'mode':self.mode,'ack_delay':self.ack_delay,'current_toolbar':True,'start_mode':self.start_mode})
  await self.inject(p,'core.js');await self.inject(p,'chatgpt_content.js' if 'chatgpt.com' in url else 'avito_content.js');return True
 async def wait(self,predicate,timeout=90):
  until=time.monotonic()+timeout;last=''
  while time.monotonic()<until:
   v=await self.call('view')
   if v['state']['status']!=last:
    last=v['state']['status'];print('STATE',last,flush=True)
   if predicate(v):return v
   if v['state'].get('status')=='RATE_LIMIT_BACKOFF':
    resume=int((v['state'].get('connection_recovery') or {}).get('resume_after') or 0)
    if resume and int(time.time()*1000)>=resume:
     await self.call('fire_alarm',name='avito-finder-rate-limit-v128')
   await asyncio.sleep(.2)
  raise AssertionError('cycle timeout '+json.dumps(v['state'],ensure_ascii=False))
 async def close(self):
  try:await self.call('shutdown')
  except Exception:pass
  await self.proc.wait();await self.reader
  for p in self.pages.values():await p.close()
async def main():
 results=[]
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
  for name,mode,delay,fault,start_mode in [('full_three_page_folded_cycle','folded',0,None,'normal'),('assistant_first_start_then_three_pages','folded',0,None,'assistant_first'),('late_body_then_worker_restart_reconcile','folded',25000,None,'normal'),('ip_block_recovery_then_three_pages','folded',0,'ip_block','normal'),('rate_limit_recovery_then_three_pages','folded',0,'rate_limit','normal'),('captcha_manual_boundary','folded',0,'captcha','normal')]:
   if os.environ.get('AF_CYCLE_FILTER') and os.environ['AF_CYCLE_FILTER'] not in name:continue
   ctx=await b.new_context();await ctx.route('**/*',lambda r:r.abort());cmds=[command(SEARCH),command(SEARCH+'&p=2')]+([] if delay else [command(SEARCH.replace('computer','system'))]);cmds=cmds[:1] if (fault=='captcha' or delay) else cmds;h=Harness(ctx,cmds,mode,delay,fault,start_mode);started=time.monotonic()
   try:
    await asyncio.wait_for(h.start(),20);print('START_REQUEST',flush=True);
    if fault:await h.call('seed',state={'status':'IDLE','report':None})
    r=await h.call('message',message={'type':'AF_START'});print('START_RESPONSE',r.get('ok'),flush=True);assert r['ok'],r
    if delay:
     # v1.0.27+ keeps an already-clicked Send in an uncertain/reconciling state
     # instead of prematurely calling it blocked. Restart exactly across that
     # durable boundary and require the late body to reconcile without a 2nd Send.
     v=await h.wait(lambda v:v['state']['status'] in {'REPORT_DELIVERY_UNCERTAIN','REPORT_DELIVERY_BLOCKED'},60)
     assert v['state']['report_send_receipt']['baseline_user_turn_ids']
     await h.call('restart')
    n=len(cmds);v=await h.wait(lambda v:v['state']['status']=='WAITING_FOR_NEXT_ASSISTANT_FORM' and v['state'].get('anchor_turn_id')=='user-'+str(n+1),120)
    pc=await h.pages[1].evaluate('({sendClicks,expandClicks,sentReports})');assert pc['sendClicks']==1+n,pc;assert len(pc['sentReports'])==n
    if fault=='captcha':
     assert 'CAPTCHA' in pc['sentReports'][0],pc['sentReports'][0]
     assert not any(x['message']=='AF_EXECUTE_AVITO_UI_PLAN' and 'count=30' in pc['sentReports'][0] for x in h.trace)
    else:
     for i,text in enumerate(pc['sentReports']):assert 'count=30' in text and 'ID='+str(1000000000+30*i+29) in text,text[-1500:]
    if fault in ['ip_block','rate_limit']:assert sum(x[0]=='reload' for x in v['calls'])==1,v['calls']
    assert v['state']['status']=='WAITING_FOR_NEXT_ASSISTANT_FORM',v['state'];assert not h.errors,h.errors
    results.append({'name':name,'status':'PASS','send_clicks_including_start':pc['sendClicks'],'reports':len(pc['sentReports']),'rows_per_report':([0] if fault=='captcha' else [30]*n),'expand_clicks':pc['expandClicks'],'final_state':v['state']['status'],'logs':v['logs'],'trace':h.trace,'ms':round(1000*(time.monotonic()-started))})
   except Exception as e:
    try:v=await h.call('view')
    except Exception:v={}
    results.append({'name':name,'status':'FAIL','error':str(e),'traceback':traceback.format_exc(),'view':v,'trace':h.trace,'browser_errors':h.errors})
   finally:
    try:await asyncio.wait_for(h.close(),5)
    except Exception:h.proc.kill()
    await ctx.close();print(json.dumps({k:v for k,v in results[-1].items() if k not in ['logs','trace','view']},ensure_ascii=False),flush=True)
  await b.close()
 out={'scope':'OFFLINE_CROSS_COMPONENT_CYCLE__PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM__CHROME_APIS_MOCKED','live_provider_calls':0,'installed_extension':False,'tests':results,'pass':sum(r['status']=='PASS' for r in results),'fail':sum(r['status']=='FAIL' for r in results)};OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2));assert not out['fail']
if __name__=='__main__':asyncio.run(main())
