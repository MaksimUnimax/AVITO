"""Wrong assistant format -> exact same-chat error -> 2 valid commands -> 2 reports.
Production worker and DOM adapters from supplied final ZIP extraction.
OFFLINE Chromium + Chrome API doubles, not live Chrome acceptance.
"""
import asyncio, importlib.util, json, os, sys, time, traceback
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(sys.argv[1]).resolve();OUT=Path(sys.argv[2]).resolve()
spec=importlib.util.spec_from_file_location('cycle',ROOT/'tests/browser_cycle_v127.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
async def main():
 result={'scope':'OFFLINE_WRONG_FORM_SAME_CHAT_REPORT_THEN_TWO_VALID_COMMANDS','version':'1.0.36','live_provider_calls':0,'installed_live_acceptance':'NOT_RUN'}
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
  ctx=await b.new_context();await ctx.route('**/*',lambda r:r.abort())
  h=base.Harness(ctx,[base.command(base.SEARCH),base.command(base.SEARCH),base.command(base.SEARCH+'&p=2')])
  try:
   await h.start()
   await h.pages[1].evaluate('''()=>{const valid=window.renderAssistant;window.renderAssistant=(text,i)=>{
    if(i!==0)return valid(text,i);
    const s=document.createElement('section');s.dataset.turn='assistant';s.dataset.turnId='assistant-'+i;
    const w=document.createElement('div');w.id='code-block-viewer';
    const pre=document.createElement('pre');pre.textContent=text;w.append(pre);
    const local=document.createElement('button');local.ariaLabel='Копировать';local.textContent='Копировать';w.append(local);s.append(w);
    const generic=document.createElement('button');generic.dataset.testid='copy-turn-action-button';generic.ariaLabel='Копировать ответ';generic.textContent='Копировать ответ';s.append(generic);
    document.querySelector('main').append(s);
   };}''')
   start=await h.call('message',message={'type':'AF_START'});assert start['ok']
   v=await h.wait(lambda v:v['state']['status']=='WAITING_FOR_NEXT_ASSISTANT_FORM' and v['state'].get('anchor_turn_id')=='user-4',90)
   pc=await h.pages[1].evaluate('({sendClicks,expandClicks,sentReports})')
   assert pc['sendClicks']==4 and len(pc['sentReports'])==3,pc
   assert 'ASSISTANT_WRITING_BLOCK_REQUIRED' in pc['sentReports'][0]
   for i,text in enumerate(pc['sentReports'][1:]):assert 'count=30' in text and 'ID='+str(1000000029+30*i) in text
   plans=[i for i,t in enumerate(h.trace) if t['message']=='AF_EXECUTE_AVITO_UI_PLAN'];reports=[i for i,t in enumerate(h.trace) if t['message']=='AF_CAPTURE_SEND_REPORT']
   assert len(plans)==2 and reports[0]<plans[0],(plans,reports)
   assert not h.errors,h.errors
   result.update(status='PASS',same_chat_reports=3,format_reports=1,collection_reports=2,actual_ui_dispatches=2,send_clicks_including_start=4,ui_dispatch_before_format_report=False,final_state=v['state']['status'],trace=h.trace)
  except Exception as e:result.update(status='FAIL',error=str(e),traceback=traceback.format_exc(),trace=h.trace)
  finally:
   try:await asyncio.wait_for(h.close(),5)
   except Exception:h.proc.kill()
   await ctx.close();await b.close()
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in result.items() if k!='trace'}));return 0 if result['status']=='PASS' else 1
if __name__=='__main__':raise SystemExit(asyncio.run(main()))
