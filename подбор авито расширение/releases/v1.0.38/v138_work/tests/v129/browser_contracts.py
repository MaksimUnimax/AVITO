"""Production Avito adapter in real Chromium, fixture DOM, no network or Chrome APIs.
Run with AF_SOURCE_ROOT pointing to the old build to reproduce, or new build to verify.
"""
import asyncio,json,os,time,sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(os.environ.get('AF_SOURCE_ROOT',str(Path(__file__).resolve().parents[2])))
OUTPUT=Path(os.environ.get('AF_V129_BROWSER_REPORT','/tmp/avito-v129-dom.json'))
CASES=[]
def doc(body): return '<!doctype html><meta charset="utf-8"><body>'+body+'</body>'
def detail(body='',button='<button>Купить с доставкой</button>'):
 return doc('<h1 data-marker="item-view/title-info">Рабочий ПК</h1><span data-marker="item-view/item-price">10 000 ₽</span><div data-marker="item-view/item-description">'+(body or 'ПК 16GB SSD256')+'</div>'+button)
def card(content='',href='pc_12345678',suffix=''):
 if '₽' not in content: content='<span data-marker="item-price">10 000 ₽</span>'+content
 return '<article data-marker="item"><a data-marker="item-title" href="https://www.avito.ru/moskva/nastolnye_kompyutery/'+href+suffix+'">ПК</a>'+content+'</article>'
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
  ctx=await browser.new_context();await ctx.route('**/*',lambda r:r.abort())
  async def run(name,html,expression,expected):
   page=await ctx.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    await page.set_content(html)
    await page.add_script_tag(content='window.__AF_TEST_EXPORTS={};window.chrome={runtime:{onMessage:{addListener(){},removeListener(){}},sendMessage(m,cb){cb?.({ok:true});return Promise.resolve({ok:true})}}};')
    await page.add_script_tag(path=str(ROOT/'core.js'))
    await page.add_script_tag(content="(()=>{const location=new URL('https://www.avito.ru/moskva/nastolnye_kompyutery/pc_12345678');"+(ROOT/'avito_content.js').read_text()+'})();')
    actual=await page.evaluate(expression)
    CASES.append({'id':name,'pass':actual==expected and not errors,'actual':actual,'expected':expected,'page_errors':errors})
   except Exception as e: CASES.append({'id':name,'pass':False,'error':str(e),'expected':expected})
   await page.close()
  D='__AF_TEST_EXPORTS.uiPlan.collectPublicListingDetails()'
  L='__AF_TEST_EXPORTS.uiPlan.collectPublicListings(30)'
  await run('seller_description_captcha_not_block',detail('Установлены браузер и captcha приложение. Проблем с ПК нет.'),f'{D}.blocked_reason',None)
  await run('seller_description_rate_not_block',detail('Иногда сайт пишет слишком много запросов, не неисправность компьютера.'),f'{D}.blocked_reason',None)
  await run('hidden_challenge_not_block',detail()+ '<div style="display:none" data-marker="captcha"><h1>Подтвердите, что вы не робот</h1></div>',f'{D}.blocked_reason',None)
  await run('disabled_fieldset_not_direct',detail(button='<fieldset disabled><button>Купить с доставкой</button></fieldset>'),f'{D}.direct_delivery.confirmed',False)
  await run('inert_ancestor_not_direct',detail(button='<div inert><button>Купить с доставкой</button></div>'),f'{D}.direct_delivery.confirmed',False)
  await run('aria_disabled_ancestor_not_direct',detail(button='<div aria-disabled="true"><button>Купить с доставкой</button></div>'),f'{D}.direct_delivery.confirmed',False)
  await run('anchor_without_href_not_direct',detail(button='<a>Купить с доставкой</a>'),f'{D}.direct_delivery.confirmed',False)
  await run('enabled_fieldset_legend_direct',detail(button='<fieldset disabled><legend><button>Купить с доставкой</button></legend></fieldset>'),f'{D}.direct_delivery.confirmed',True)
  await run('hidden_parent_opacity_not_direct',detail(button='<div style="opacity:0"><button>Купить с доставкой</button></div>'),f'{D}.direct_delivery.confirmed',False)
  await run('visible_anchor_direct',detail(button='<a href="/delivery/checkout">Купить с доставкой</a>'),f'{D}.direct_delivery.confirmed',True)
  await run('grouped_reviews_not_rating',doc(card('<div>4,5<br>·<br>1 217 отзывов</div>')),f'{L}[0].seller_rating','4,5 · 1217 отзывов')
  await run('hidden_price_not_returned',doc(card('<span style="display:none">8 000 ₽</span><span>12 500 ₽</span>')),f'{L}[0].price','12 500 ₽')
  await run('real_small_marked_price_not_dropped',doc(card('<span data-marker="item-price">500 ₽</span>')),f'{L}[0].price','500 ₽')
  await run('same_listing_tracking_deduplicated',doc(card('<span>10 000 ₽</span>',suffix='?utm_source=one')+card('<span>10 000 ₽</span>',suffix='?utm_source=two')),f'{L}.length',1)
  await run('seller_paragraph_not_location',doc(card('<div>Продам компьютер, наш край лучший. Возможны проверки и гарантия.</div>')),f'{L}[0].location','')
  await run('seller_paragraph_not_badge',doc(card('<div>Продам компьютер, наш край лучший. Возможны проверки и гарантия.</div>')),f'{L}[0].seller_badges',[])
  await run('no_purchase_click',detail(button='<button onclick="window.clicked=true">Купить с доставкой</button>'),f'(()=>{{{D};return Boolean(window.clicked)}})()',False)
  await run('reserved_visible_state',detail(button='<div data-marker="item-view/status">Забронировано</div>'),f'{D}.availability','RESERVED')
  await run('sold_visible_state_without_passport',doc('<h1>Объявление снято с публикации</h1>'),f'{D}.availability','REMOVED')
  await run('description_bound_is_explicit',detail('x'*20050),f'{D}.truncated_fields.includes("description")',True)
  await run('full_short_description_preserved',detail('x'*3000),f'{D}.description.length',3000)
  await run('live_captcha_modal_stops_read',detail()+ '<section role="dialog"><h1>Подтвердите, что вы не робот</h1><input placeholder="Код с картинки"></section>',f'{D}.blocked_reason','BLOCKED_LOGIN_OR_CAPTCHA')
  await run('plain_rate_limit_classified',doc('<h1>Слишком много запросов</h1>'),f'{D}.blocked_reason','AVITO_RATE_LIMIT')
  await run('plain_ip_block_classified',doc('<h1>Доступ ограничен: проблема с IP</h1>'),f'{D}.blocked_reason','AVITO_IP_BLOCK')
  await run('covered_element_is_not_pointer_reachable',doc('<button id="target">Открыть</button><div style="position:fixed;inset:0;z-index:100;background:white"></div>'),'__AF_TEST_EXPORTS.optionSelection.pointerReachable(document.querySelector("#target"))',False)
  await run('direct_button_has_no_fabricated_href',detail(),f'{D}.direct_delivery.href','')
  await run('unavailable_observation_preserves_url',doc('<h1>Объявление снято с публикации</h1>'),f'{D}.href','https://www.avito.ru/moskva/nastolnye_kompyutery/pc_12345678')
  await ctx.close();await browser.close()
 result={'scope':'Chromium DOM fixtures; NOT installed MV3/live websites','source_root':str(ROOT),'results':CASES,'pass':sum(x['pass'] for x in CASES),'fail':sum(not x['pass'] for x in CASES)}
 OUTPUT.parent.mkdir(parents=True,exist_ok=True);OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(1 if result['fail'] else 0)
asyncio.run(main())
