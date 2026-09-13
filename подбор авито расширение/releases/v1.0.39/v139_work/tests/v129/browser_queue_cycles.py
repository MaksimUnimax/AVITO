"""Full explicit-queue chains: production worker in VM + production adapters in Chromium.
No installed MV3/provider/site account. Synthetic HTTP/DOM conditions are not live evidence.
"""
import asyncio,json,os,sys,time,traceback,importlib.util
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('cyclebase',ROOT/'tests/browser_cycle_v127.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
OUT=Path(os.environ.get('AF_QUEUE_CYCLES_REPORT',os.environ.get('AF_QUEUE_REPORT','/tmp/avito-v129-queue-cycles.json')))
SEARCH=base.SEARCH;CHAT=base.CHAT
URLS=['https://www.avito.ru/test/nastolnye_kompyutery/fixture_'+str(9000000000+i) for i in range(1,31)]
def command(n=6,batch=3,gap=0):
 return 'Режим:\nAVITO_UI\nСтраница:\n'+SEARCH+'\nПауза между карточками:\n'+str(gap)+' мс\nОчередь:\n'+'\n'.join(URLS[:n])+'\nШаги:\nСобери публичные данные лотов из очереди пакетом '+str(batch)+'.'
def resume():return 'Режим:\nAVITO_UI\nСтраница:\n'+SEARCH+'\nШаги:\nПродолжи сбор из очереди.'
class QueueHarness(base.Harness):
 def __init__(self,*args,qfault=None,large=False,**kwargs):
  super().__init__(*args,**kwargs);self.qfault=qfault;self.qfault_used=False;self.large=large;self.late_read=asyncio.Event();self.delivery_checkpoints=[]
 async def navigate(self,tid,url):
  if url not in URLS:return await super().navigate(tid,url)
  if tid not in self.pages:
   self.pages[tid]=await self.ctx.new_page();self.pages[tid].on('pageerror',lambda e:self.errors.append(str(e)))
  p=self.pages[tid];index=URLS.index(url)+1
  blocked=index==2 and self.qfault and (not self.qfault_used or self.qfault=='captcha')
  if blocked and self.qfault in ['rate_limit','captcha']:
   self.qfault_used=True;body='<h1>'+('Слишком много запросов' if self.qfault=='rate_limit' else 'Подтвердите, что вы не робот. CAPTCHA')+'</h1>'
  elif index==2 and self.qfault=='removed':body='<h1>Объявление снято с публикации</h1>'
  else:
   description=('Synthetic CPU RAM SSD fixture '+str(index)+'; ')+('Длинное описание без личных данных. '*200 if self.large else 'Рабочий компьютер.')
   body=f'<main><h1 data-marker="item-view/title-info">Fixture PC {index}</h1><span data-marker="item-view/item-price">10 000 ₽</span><section><h2>Характеристики</h2><p>CPU TEST / RAM 16 GB / SSD 256 GB</p></section><div data-marker="item-view/item-description">{description}</div><button data-marker="new-direct-purchase" onclick="window.purchaseClicks=(window.purchaseClicks||0)+1">Купить с доставкой</button></main>'
  await p.goto('about:blank');await p.set_content('<!doctype html><html><head><title>Offline detail fixture</title></head><body>'+body+'</body></html>');await p.evaluate('u=>window.AF_LOC=new URL(u)',url);await p.evaluate(base.SHIM,tid)
  await self.inject(p,'core.js');await self.inject(p,'avito_content.js');return True
 async def wait(self,predicate,timeout=90):
  until=time.monotonic()+timeout;last=''
  while time.monotonic()<until:
   v=await self.call('view')
   if v['state']['status']!=last:last=v['state']['status'];print('STATE',last,flush=True)
   if predicate(v):return v
   # Chrome alarms are one-shot events. The VM stores them; this host delivers
   # ALL due alarms (not just backoff), including checkpoint continuation.
   for name,alarm in v.get('alarms',[]):
    if int(alarm.get('when',alarm.get('scheduledTime',0)))<=int(time.time()*1000):await self.call('fire_alarm',name=name)
   await asyncio.sleep(.1)
  raise AssertionError('cycle timeout '+json.dumps(v['state'],ensure_ascii=False))
 async def browser_request(self,m):
  if m['method']=='message' and m.get('message',{}).get('type')=='AF_CAPTURE_SEND_REPORT':
   v=await self.call('view');self.delivery_checkpoints.append(v['state'].get('sequential_review'))
  if self.qfault=='late_stop' and m['method']=='message' and m.get('message',{}).get('type')=='AF_SEQUENTIAL_READ_PUBLIC_LISTING' and len([t for t in self.trace if t.get('message')=='AF_SEQUENTIAL_READ_PUBLIC_LISTING'])==1:
   try:
    self.trace.append({'method':'message','tab':m['tab_id'],'message':'AF_SEQUENTIAL_READ_PUBLIC_LISTING'})
    result=await self.pages[m['tab_id']].evaluate('m=>AF_RPC_SEND(m)',m['message']);self.late_read.set();await asyncio.sleep(.8)
    self.write({'browser_response':m['browser_request'],'result':result});return
   except Exception as e:self.write({'browser_response':m['browser_request'],'error':str(e)});return
  await super().browser_request(m)
async def main():
 results=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
  for name in ['six_details_two_batches','rate_limit_mid_queue_restart_direct_route','manual_captcha_same_child_resume','restart_during_persisted_gap','stop_during_late_detail_response','removed_listing_is_negative_observation','thirty_detail_large_report']:
   if os.environ.get('AF_QUEUE_FILTER') and os.environ['AF_QUEUE_FILTER'] not in name:continue
   large=name=='thirty_detail_large_report';fault={'rate_limit_mid_queue_restart_direct_route':'rate_limit','manual_captcha_same_child_resume':'captcha','stop_during_late_detail_response':'late_stop','removed_listing_is_negative_observation':'removed'}.get(name)
   n=30 if large else 6 if name=='six_details_two_batches' else 3
   gap=2000 if name=='restart_during_persisted_gap' else 0
   cmds=[command(n,3 if n==6 else n,gap)]+([resume()] if n==6 else [])
   ctx=await browser.new_context();await ctx.route('**/*',lambda r:r.abort());h=QueueHarness(ctx,cmds,qfault=fault,large=large);start=time.monotonic()
   try:
    await h.start();await h.call('seed',state={'status':'IDLE','report':None},direct=True)
    assert (await h.call('message',message={'type':'AF_START'}))['ok']
    if fault=='rate_limit':
     v=await h.wait(lambda v:v['state']['status']=='RATE_LIMIT_BACKOFF',45);assert v['state']['sequential_review']['cursor']==1;await h.call('restart')
    if name=='restart_during_persisted_gap':
     v=await h.wait(lambda v:v['state']['status']=='SEQUENTIAL_GAP_WAIT',45);assert v['state']['sequential_review']['cursor']==1;await h.call('restart')
    if fault=='late_stop':
     await asyncio.wait_for(h.late_read.wait(),45);await h.call('message',message={'type':'AF_STOP'});await asyncio.sleep(1)
     v=await h.call('view');assert v['state']['status']=='CANCELLED_BY_USER';assert v['state']['sequential_review']['cursor']==1
     assert len([x for x in h.trace if x.get('message')=='AF_SEQUENTIAL_READ_PUBLIC_LISTING'])==2
     pc=await h.pages[1].evaluate('({sendClicks,sentReports})');assert pc['sendClicks']==1;assert not pc['sentReports']
    else:
     if fault=='captcha':
      v=await h.wait(lambda v:v['state']['status']=='WAITING_FOR_NEXT_ASSISTANT_FORM' and v['state'].get('anchor_turn_id')=='user-2',45)
      q=v['state']['sequential_review'];assert q['cursor']==1 and q['status']=='paused_for_manual_captcha';child=q['captcha']['child_tab_id'];assert child in h.pages
      pc=await h.pages[1].evaluate('({sendClicks,sentReports})');assert 'CAPTCHA' in pc['sentReports'][0]
      h.qfault=None;await h.navigate(child,URLS[1]);assert (await h.call('message',message={'type':'AF_CONTINUE_REPORT'}))['ok']
     reports=2 if n==6 or fault=='captcha' else 1
     v=await h.wait(lambda v:v['state']['status']=='WAITING_FOR_NEXT_ASSISTANT_FORM' and v['state'].get('anchor_turn_id')=='user-'+str(reports+1),90)
     q=h.delivery_checkpoints[-1];assert q['cursor']==n and q['status']=='completed',q
     assert v['state']['sequential_review'] is None, 'completed queue must be purged ONLY after receipt'
     assert len(q['details'])==n,q
     pc=await h.pages[1].evaluate('({sendClicks,sentReports})');assert pc['sendClicks']==reports+1;assert len(pc['sentReports'])==reports
     text=pc['sentReports'][-1]
     assert 'new-direct-purchase' in text and 'подтверждена активным' in text,text[-1000:]
     for url in URLS[:n]:assert url in text
     if fault=='removed':assert q['details'][1]['details']['availability']=='REMOVED';assert 'REMOVED' in text
     if large:assert len(text)>180000,len(text);assert 'Fixture PC 30' in text
     # Each first URL read once even when the second URL causes a pause/restart.
     first_child=[x['tab'] for x in h.trace if x.get('method')=='navigate' and x.get('url')==URLS[0]][0]
     assert sum(x.get('message')=='AF_SEQUENTIAL_READ_PUBLIC_LISTING' and x['tab']==first_child for x in h.trace)==1
    assert not h.errors,h.errors
    results.append({'name':name,'status':'PASS','send_clicks_including_start':pc['sendClicks'],'reports':len(pc['sentReports']),'last_report_characters':len(pc['sentReports'][-1]) if pc['sentReports'] else 0,'cursor':n if fault!='late_stop' else 1,'state':v['state']['status'],'delivery_checkpoints':h.delivery_checkpoints,'trace':h.trace,'duration_seconds':round(time.monotonic()-start,3)})
   except Exception as e:
    try:v=await h.call('view')
    except Exception:v={}
    results.append({'name':name,'status':'FAIL','error':str(e),'traceback':traceback.format_exc(),'view':v,'trace':h.trace,'browser_errors':h.errors})
   finally:
    try:await asyncio.wait_for(h.close(),8)
    except Exception:h.proc.kill()
    await ctx.close();print(json.dumps({k:v for k,v in results[-1].items() if k not in ['trace','view','delivery_checkpoints']},ensure_ascii=False),flush=True)
  await browser.close()
 out={'scope':'PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; CHROME_API_DOUBLES; NOT_INSTALLED_OR_LIVE','live_provider_calls':0,'results':results,'pass':sum(x['status']=='PASS' for x in results),'fail':sum(x['status']!='PASS' for x in results)}
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2));assert not out['fail']
if __name__=='__main__':asyncio.run(main())
