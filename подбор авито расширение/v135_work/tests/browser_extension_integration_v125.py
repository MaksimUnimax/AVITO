"""Real Chromium + installed MV3 extension. All web requests fulfilled/aborted locally.
No Avito/Proxy.Market requests, no user's Chrome profile, credentials, CDP added to product.
Requires Python playwright and Chromium. Run: python tests/browser_extension_integration_v125.py
"""
import asyncio, json, os, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(os.environ.get('AF_BROWSER_REPORT', '/tmp/avito-v125-browser-results.json'))
BASE = 'https://www.avito.ru/all/nastolnye_kompyutery?q=computer'
RESULTS = []

def document(body):
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Local Avito fixture</title></head><body>'+body+'</body></html>'

def detail(button='<button data-marker="delivery-item-button-main">Купить с доставкой</button>'):
    return document('''<h1 data-marker="item-view/title-info">Dell Vostro 3470</h1>
    <div data-marker="item-view/item-price">10 000 ₽</div>
    <section><h2>Характеристики</h2><ul><li>Процессор: Intel Core i5-8400</li><li>Оперативная память: 16 GB</li><li>SSD: 256 GB</li><li>Материнская плата: DELL 0WT5R3</li></ul></section>
    <section><h2>Описание</h2><div data-marker="item-view/item-description">Готовый компьютер, все исправно. SSD 256 GB.</div></section>
    <div data-marker="seller-info/name">Fixture Seller</div>'''+button+'''
    <div style="display:none">HIDDEN_TOKEN_DO_NOT_RETURN_71</div>
    <textarea>USER_TEXT_DO_NOT_RETURN_29</textarea>
    <script>window.purchaseClicks=0;document.querySelector('button')?.addEventListener('click',()=>window.purchaseClicks++);</script>''')

def cards(count):
    return ''.join(f'''<article data-marker="item" style="padding:3px;height:55px"><a data-marker="item-title" href="/moskva/nastolnye_kompyutery/fixture_pc_{10000000+i}">Рабочий ПК {i}</a><span data-marker="item-price">{10000+i} ₽</span><span data-marker="item-address">Москва</span><div>i5-8400 16 GB SSD 256 GB</div></article>''' for i in range(count))

async def main():
    async with async_playwright() as pw:
        with tempfile.TemporaryDirectory(prefix='avito-fixture-chromium-') as profile:
            ctx = await pw.chromium.launch_persistent_context(profile, executable_path=os.environ.get('CHROMIUM', '/usr/bin/chromium'),headless=True,
              args=[f'--disable-extensions-except={ROOT}',f'--load-extension={ROOT}','--no-sandbox','--disable-background-networking'],viewport={'width':1200,'height':850})
            current = {'html':detail()}; requests=[]; errors=[]
            async def route(r):
                requests.append(r.request.url)
                if r.request.is_navigation_request() and r.request.url.startswith('https://www.avito.ru/'):
                    await r.fulfill(status=200, content_type='text/html; charset=utf-8',body=current['html'])
                elif r.request.is_navigation_request() and r.request.url.startswith('https://chatgpt.com/'):
                    await r.fulfill(status=200,content_type='text/html; charset=utf-8',body=document('<main>Local ChatGPT fixture</main>'))
                else: await r.abort()
            await ctx.route('**/*',route)
            sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
            page=await ctx.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
            async def load(html):
                current['html']=html
                await page.goto(BASE,wait_until='domcontentloaded')
                await page.wait_for_timeout(150)
                tid=await sw.evaluate('async u=>(await chrome.tabs.query({})).find(t=>t.url===u).id',BASE)
                # Content script delivery is asynchronous on a real MV3 browser.
                for _ in range(50):
                    try:
                        ping=await sw.evaluate('async ([id,m])=>await chrome.tabs.sendMessage(id,m)',[tid,{'type':'AF_AVITO_PING'}])
                        if ping.get('version')=='1.0.34': return tid
                    except Exception: pass
                    await page.wait_for_timeout(50)
                raise AssertionError('installed content adapter did not respond')
            async def message(tid,m):
                return await sw.evaluate('async ([id,m])=>await chrome.tabs.sendMessage(id,m)',[tid,m])
            async def plan(tid,steps,**kw):
                return await message(tid,{'type':'AF_EXECUTE_AVITO_UI_PLAN','plan':{'steps':steps,'timing_profile':'CONTROL_VISIBLE','plan_fingerprint':'fixture',**kw}})
            async def run(name, fn):
                start=time.monotonic()
                try: await fn(); RESULTS.append({'test':name,'status':'PASS','elapsed_ms':round((time.monotonic()-start)*1000)})
                except Exception as e: RESULTS.append({'test':name,'status':'FAIL','error':str(e),'elapsed_ms':round((time.monotonic()-start)*1000)})
                print(RESULTS[-1],flush=True)
            async def manifest():
                m=await sw.evaluate('chrome.runtime.getManifest()')
                assert m['version']=='1.0.35' and m['manifest_version']==3
                assert 'alarms' in m['permissions']
            await run('real MV3 extension loads with new recovery module and alarm permission',manifest)
            async def root():
                tid=await load(detail()); snap=(await message(tid,{'type':'AF_DIAGNOSE_AVITO_DOM','request':{'scope':'PAGE_MAIN_VISIBLE'}}))['snapshot']
                assert snap['root_description'].startswith('body'),snap['root_description']
                assert 'i5-8400' in snap['tree_text'] and 'DELL 0WT5R3' in snap['tree_text']
                assert 'Купить с доставкой' in snap['bounded_html']
                assert 'HIDDEN_TOKEN_DO_NOT_RETURN_71' not in snap['bounded_html']
                assert 'USER_TEXT_DO_NOT_RETURN_29' not in snap['bounded_html']
            await run('whole-page diagnosis reads full body, not delivery button; hidden/input text excluded from HTML',root)
            async def explicitmain():
                tid=await load(document('<header>Header</header><main><h1>Fixture heading</h1><p>Основная область</p></main>'))
                snap=(await message(tid,{'type':'AF_DIAGNOSE_AVITO_DOM','request':{'scope':'PAGE_MAIN_VISIBLE'}}))['snapshot']
                assert snap['root_description'].startswith('main')
            await run('semantic main root preferred to body',explicitmain)
            async def direct():
                tid=await load(detail()); out=await plan(tid,[{'type':'COLLECT_LISTING_DETAILS'}],collection_timeout_ms=500)
                assert out['ok'] and out['result']['listing_details']['direct_delivery']['confirmed'],out
                assert await page.evaluate('window.purchaseClicks')==0
            await run('public configuration and direct-delivery button collected without clicking',direct)
            async def disabled():
                tid=await load(detail('<button disabled data-marker="delivery-item-button-main">Купить с доставкой</button>'))
                out=await plan(tid,[{'type':'COLLECT_LISTING_DETAILS'}],collection_timeout_ms=500)
                assert out['result']['listing_details']['direct_delivery']['confirmed'] is False
            await run('disabled delivery control is not direct-delivery confirmation',disabled)
            async def icebreaker():
                tid=await load(detail('<button>Отправите Авито Доставкой?</button>'))
                out=await plan(tid,[{'type':'COLLECT_LISTING_DETAILS'}],collection_timeout_ms=500)
                assert out['result']['listing_details']['direct_delivery']['confirmed'] is False
            await run('seller icebreaker is not direct-delivery confirmation',icebreaker)
            async def delayed():
                html=document('<div id="results"></div><script>setTimeout(()=>document.getElementById("results").innerHTML='+json.dumps(cards(5))+',500)</script>')
                tid=await load(html);out=await plan(tid,[{'type':'COLLECT_LISTINGS','limit':5}],collection_timeout_ms=1500)
                assert len(out['result']['listings'])==5,out
                assert [x['listing_id'] for x in out['result']['listings']]==[str(10000000+i) for i in range(5)]
            await run('delayed DOM renders are awaited; real order and listing IDs preserved',delayed)
            async def over30():
                tid=await load(document(cards(35)));out=await plan(tid,[{'type':'COLLECT_LISTINGS','limit':35}],collection_timeout_ms=1000)
                assert len(out['result']['listings'])==35,out
                assert len(set(x['listing_id'] for x in out['result']['listings']))==35
            await run('requested 35 visible-rendered records are not silently capped at 30',over30)
            async def noSurface():
                tid=await load(document('<div>Loading</div>'));out=await plan(tid,[{'type':'COLLECT_LISTINGS','limit':5}],collection_timeout_ms=300)
                assert out['result']['blocked_reason']=='LISTINGS_PUBLIC_SURFACE_UNAVAILABLE',out
                assert out['result']['listings']==[]
            await run('missing DOM is an explicit bounded error, not completed empty selection',noSurface)
            async def empty():
                tid=await load(document('<div data-marker="search-results/empty">Ничего не найдено</div>'))
                out=await plan(tid,[{'type':'COLLECT_LISTINGS','limit':5}],collection_timeout_ms=500)
                assert out['result']['ok'] and out['result']['empty_results_confirmed']
            await run('explicit visible empty-result state is distinguished from unloaded page',empty)
            async def blocked():
                tid=await load(document('<h1>Доступ ограничен: проблема с IP</h1>'))
                out=await plan(tid,[{'type':'COLLECT_LISTINGS','limit':20}],collection_timeout_ms=500)
                assert out['result']['blocked_reason']=='AVITO_IP_BLOCK' and not out['result']['listings'],out
            await run('visible IP-block propagates through normal-tempo collection',blocked)
            async def captcha():
                tid=await load(document('<h1>Подтвердите, что вы не робот</h1><input placeholder="Код с картинки"><button>Продолжить</button>'))
                out=await plan(tid,[{'type':'COLLECT_LISTINGS','limit':20}],collection_timeout_ms=500)
                assert out['result']['blocked_reason']=='BLOCKED_LOGIN_OR_CAPTCHA',out
            await run('CAPTCHA remains manual; no collection or automatic solution',captcha)
            async def cancel():
                tid=await load(document('<button id="test">Безопасная кнопка</button><script>window.clicks=0;document.querySelector("button").onclick=()=>window.clicks++</script>'))
                pending=asyncio.create_task(plan(tid,[{'type':'WAIT','duration_ms':1000},{'type':'CLICK','selector':'#test'}]))
                await page.wait_for_timeout(150)
                await message(tid,{'type':'AF_CANCEL_AVITO_OPERATION'});out=await pending
                assert out['ok'] is False and out['error']=='AVITO_OPERATION_CANCELLED',out
                assert await page.evaluate('window.clicks')==0
                nextout=await plan(tid,[{'type':'SNAPSHOT','scope':'PAGE_MAIN_VISIBLE'}])
                assert nextout['ok'] and nextout['result']['ok']
            await run('STOP cancels pending work before click and allows a fresh read command',cancel)
            async def duplicate():
                tid=await load(detail())
                await sw.evaluate('async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:["core.js","avito_content.js"]});await chrome.scripting.executeScript({target:{tabId:id},files:["core.js","avito_content.js"]});}',tid)
                r=await plan(tid,[{'type':'COLLECT_LISTING_DETAILS'}],collection_timeout_ms=500)
                assert r['ok'] and r['result']['listing_details']['title']=='Dell Vostro 3470',r
            await run('reinjecting the same adapter does not duplicate message handlers',duplicate)
            async def popup():
                tab=await ctx.new_page();await tab.goto('chrome-extension://'+sw.url.split('/')[2]+'/popup.html')
                await tab.wait_for_timeout(200)
                text=await tab.locator('body').inner_text()
                assert 'Avito' in text and len(text)>100
                await tab.close()
            await run('real popup opens with preserved operator controls',popup)
            result={'environment':{'browser':ctx.browser.version,'extension_version':'1.0.35','scope':'real Chromium with installed production MV3 extension and local fulfilled fixtures only','live_avito_requests':0,'live_proxy_market_requests':0},'tests':RESULTS,'page_errors':errors,'request_count':len(requests),'passed':sum(t['status']=='PASS' for t in RESULTS),'failed':sum(t['status']=='FAIL' for t in RESULTS)}
            OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
            await ctx.close()
            assert result['failed']==0,result

if __name__=='__main__': asyncio.run(main())
