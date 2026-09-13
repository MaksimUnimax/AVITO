"""Real Chromium DOM tests of production content adapter with mocked runtime messaging.
Unpacked extension installation is policy-blocked in this execution environment.
This is NOT a full installed-extension / Chrome proxy / live-provider acceptance test.
No Avito/Proxy.Market requests, no user's Chrome profile, credentials, CDP added to product.
Requires Python playwright and Chromium. Run: python tests/browser_fixtures_v125.py
"""
import asyncio, json, os, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
EXPECTED_VERSION = json.loads((ROOT/'manifest.json').read_text())['version']
OUTPUT = Path(os.environ.get('AF_BROWSER_REPORT', '/tmp/avito-v125-browser-results.json'))
BASE = 'about:blank'
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
    return ''.join(f'''<article data-marker="item" style="padding:3px;height:55px"><a data-marker="item-title" href="https://www.avito.ru/moskva/nastolnye_kompyutery/fixture_pc_{10000000+i}">Рабочий ПК {i}</a><span data-marker="item-price">{10000+i} ₽</span><span data-marker="item-address">Москва</span><div>i5-8400 16 GB SSD 256 GB</div></article>''' for i in range(count))

async def main():
    async with async_playwright() as pw:
        with tempfile.TemporaryDirectory(prefix='avito-fixture-chromium-') as profile:
            ctx = await pw.chromium.launch_persistent_context(profile, executable_path=os.environ.get('CHROMIUM', '/usr/bin/chromium'),headless=True,
              args=['--no-sandbox','--disable-background-networking','--disable-gpu'],viewport={'width':1200,'height':850})
            current = {'html':detail()}; requests=[]; errors=[]
            async def route(r):
                requests.append(r.request.url)
                if r.request.is_navigation_request() and r.request.url.startswith('http://127.0.0.1:8487/'):
                    await r.fulfill(status=200, content_type='text/html; charset=utf-8',body=current['html'])
                elif r.request.is_navigation_request() and r.request.url.startswith('https://chatgpt.com/'):
                    await r.fulfill(status=200,content_type='text/html; charset=utf-8',body=document('<main>Local ChatGPT fixture</main>'))
                else: await r.abort()
            await ctx.route('**/*',route)
            sw = None
            shim = """(() => {
              const listeners = new Set();
              window.chrome = { runtime: { onMessage: {
                addListener: f => listeners.add(f), removeListener: f => listeners.delete(f)
              }, sendMessage: (_message, callback) => { callback?.({ok: true}); return Promise.resolve({ok:true}); } }};
              window.AF_FIXTURE_SEND = message => new Promise(resolve => {
                for (const f of [...listeners]) f(message, {}, resolve);
              });
            })();"""
            page=await ctx.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
            async def load(html):
                nonlocal page
                await page.close()
                page = await ctx.new_page()
                page.on('pageerror',lambda e:errors.append(str(e)))
                current['html']=html
                await page.set_content(html,wait_until='domcontentloaded')
                await page.wait_for_timeout(50)
                await page.add_script_tag(content=shim)
                await page.add_script_tag(path=str(ROOT/'core.js'))
                # URL is a pure fixture dependency. No website navigation occurs.
                adapter="(() => { const location = new URL('https://www.avito.ru/all/nastolnye_kompyutery?q=fixture'); "+(ROOT/'avito_content.js').read_text()+"})();"
                await page.add_script_tag(content=adapter)
                assert (await page.evaluate("AF_FIXTURE_SEND({type:'AF_AVITO_PING'})"))['version']==EXPECTED_VERSION
                return 1
            async def message(tid,m):
                return await page.evaluate('m=>AF_FIXTURE_SEND(m)',m)
            async def plan(tid,steps,**kw):
                return await message(tid,{'type':'AF_EXECUTE_AVITO_UI_PLAN','plan':{'steps':steps,'timing_profile':'CONTROL_VISIBLE','plan_fingerprint':'fixture',**kw}})
            async def run(name, fn):
                start=time.monotonic()
                try: await fn(); RESULTS.append({'test':name,'status':'PASS','elapsed_ms':round((time.monotonic()-start)*1000)})
                except Exception as e: RESULTS.append({'test':name,'status':'FAIL','error':str(e),'elapsed_ms':round((time.monotonic()-start)*1000)})
                print(RESULTS[-1],flush=True)
            async def manifest():
                m=json.loads((ROOT/'manifest.json').read_text())
                assert m['version']==EXPECTED_VERSION and m['manifest_version']==3
                assert 'alarms' in m['permissions']
            await run('manifest schema and version checked (installation not claimed)',manifest)
            async def root():
                tid=await load(detail()); snap=(await message(tid,{'type':'AF_DIAGNOSE_AVITO_DOM','request':{'scope':'PAGE_MAIN_VISIBLE'}}))['snapshot']
                assert snap['root_description'].startswith('body'),snap['root_description']
                assert 'i5-8400' in snap['tree_text'] and 'DELL 0WT5R3' in snap['tree_text']
                assert 'Купить с доставкой' in snap['bounded_html']
                assert 'HIDDEN_TOKEN_DO_NOT_RETURN_71' not in snap['bounded_html']
                assert 'USER_TEXT_DO_NOT_RETURN_29' not in json.dumps(snap)
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
            async def direct_without_marker():
                tid=await load(detail('<a href="/delivery/checkout" aria-label="Купить с доставкой">Купить с доставкой</a>'))
                out=await plan(tid,[{'type':'COLLECT_LISTING_DETAILS'}],collection_timeout_ms=500)
                proof=out['result']['listing_details']['direct_delivery']
                assert proof['confirmed'] is True,proof
                assert proof['element_tag']=='a' and proof['role']=='link' and proof['visible'] is True and proof['enabled'] is True,proof
                assert proof['marker'] is None and proof['exact_text']=='Купить с доставкой',proof
            await run('exact visible interactive delivery control works even when Avito marker changed',direct_without_marker)
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
            async def rate_limit():
                tid=await load(document('<h1>Слишком много запросов</h1><p>Попробуйте позже</p>'))
                out=await plan(tid,[{'type':'COLLECT_LISTINGS','limit':20}],collection_timeout_ms=500)
                assert out['result']['blocked_reason']=='AVITO_RATE_LIMIT' and not out['result']['listings'],out
                route=(await message(tid,{'type':'AF_GET_ROUTE_CONTEXT'}))['context']
                assert route['page_kind']=='rate_limit',route
            await run('visible rate-limit page is classified separately from IP block and CAPTCHA',rate_limit)
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
                for _ in range(2):
                    await page.add_script_tag(content="(() => { const location = new URL('https://www.avito.ru/all/nastolnye_kompyutery?q=fixture'); "+(ROOT/'avito_content.js').read_text()+"})();")
                r=await plan(tid,[{'type':'COLLECT_LISTING_DETAILS'}],collection_timeout_ms=500)
                assert r['ok'] and r['result']['listing_details']['title']=='Dell Vostro 3470',r
            await run('reinjecting the same adapter does not duplicate message handlers',duplicate)
            result={'environment':{'browser':ctx.browser.version,'extension_version':EXPECTED_VERSION,'scope':'real Chromium production DOM adapter with fixture runtime messaging; extension installation blocked by environment policy; no Chrome proxy integration acceptance; in-memory about:blank DOM with lexical fixture URL dependency; production URL validator unchanged; zero navigations to websites','live_avito_requests':0,'live_proxy_market_requests':0},'tests':RESULTS,'page_errors':errors,'request_count':len(requests),'passed':sum(t['status']=='PASS' for t in RESULTS),'failed':sum(t['status']=='FAIL' for t in RESULTS)}
            OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
            await ctx.close()
            assert result['failed']==0,result

if __name__=='__main__': asyncio.run(main())
