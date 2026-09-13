"""Browser-level contract: proxy mode must not own/change sequential child navigation.
Production worker + production Avito/ChatGPT adapters execute against synthetic Chromium pages.
Chrome proxy/network itself is simulated; no live provider/site calls are made.
"""
import asyncio, json, os, time, importlib.util
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('qbase',ROOT/'tests/v129/browser_queue_cycles.py')
qbase=importlib.util.module_from_spec(spec);spec.loader.exec_module(qbase)
OUT=Path(os.environ.get('AF_PROXY_ISOLATION_REPORT','/tmp/avito-v131-proxy-isolation.json'))

async def execute(ctx, direct: bool):
    h=qbase.QueueHarness(ctx,[qbase.command(3,3,0)],qfault=None,large=False)
    await h.start()
    try:
        await h.call('seed',state={'status':'IDLE','report':None},direct=direct)
        result=await h.call('message',message={'type':'AF_START'})
        assert result['ok'], result
        v=await h.wait(lambda v:v['state']['status']=='WAITING_FOR_NEXT_ASSISTANT_FORM' and v['state'].get('anchor_turn_id')=='user-2',90)
        q=h.delivery_checkpoints[-1]
        assert q['cursor']==3 and q['status']=='completed', q
        nav=[x for x in h.trace if x.get('method')=='navigate' and x.get('url') in qbase.URLS[:3]]
        assert [x['url'] for x in nav]==qbase.URLS[:3], nav
        assert all(x.get('url')!='about:blank' for x in nav), nav
        pc=await h.pages[1].evaluate('({sendClicks,sentReports})')
        assert pc['sendClicks']==2 and len(pc['sentReports'])==1, pc
        return {
            'direct':direct,
            'navigation_urls':[x['url'] for x in nav],
            'navigation_tab_ids':[x.get('tab_id',x.get('tab')) for x in nav],
            'cursor':q['cursor'],
            'status':q['status'],
            'send_clicks_including_start':pc['sendClicks'],
            'report_count':len(pc['sentReports']),
            'worker_status':v['state']['status'],
        }
    finally:
        try: await asyncio.wait_for(h.close(),8)
        except Exception: h.proc.kill()

async def main():
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
        try:
            c1=await browser.new_context(); await c1.route('**/*',lambda r:r.abort())
            direct=await execute(c1,True); await c1.close()
            c2=await browser.new_context(); await c2.route('**/*',lambda r:r.abort())
            proxy=await execute(c2,False); await c2.close()
        finally:
            await browser.close()
    assert direct['navigation_urls']==proxy['navigation_urls']==qbase.URLS[:3]
    out={'scope':'PRODUCTION_WORKER_VM_AND_REAL_CHROMIUM_DOM; proxy transport simulated; NO LIVE PROVIDER/AVITO',
         'status':'PASS','contract':'proxy/direct modes share identical sequential navigation URLs/order',
         'direct':direct,'proxy':proxy}
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(out,ensure_ascii=False))
if __name__=='__main__': asyncio.run(main())
