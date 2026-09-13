"""Every public generic action and diagnostic scope in Chromium.
Real Avito adapter + Input RPC double; the double uses Playwright mouse/keyboard,
not the production Chrome debugger service. Worker/CDP guards are tested in Node.
All pages are synthetic; network is denied; no seller interactions.
"""
import asyncio,json,os,sys,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(os.environ.get('AF_SOURCE_ROOT',str(Path(__file__).resolve().parents[2])))
OUT=Path(os.environ.get('AF_ACTION_REPORT','/tmp/avito-actions.json'))
URL='https://www.avito.ru/all/nastolnye_kompyutery?q=pc'
results=[]
async def main():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-background-networking']);ctx=await b.new_context();ctx.set_default_timeout(1500);await ctx.route('**/*',lambda r:r.abort())
  async def run(name,html,fn,url=URL):
   p=await ctx.new_page();errors=[];calls=[];p.on('pageerror',lambda e:errors.append(str(e)))
   async def rpc(_source,m):
    calls.append(m);r=m.get('request',{});typ=m['type']
    if typ=='AF_UI_CLICK_DISPATCHED':return {'ok':True,'data':{'dispatch_id':'fixture-dispatch'}}
    if typ in ['AF_DEBUGGER_CLICK_VISIBLE_TARGET','AF_DEBUGGER_TYPE_VISIBLE_TARGET']:
     bounds=r['bounds'];x=bounds['left']+bounds['width']/2;y=bounds['top']+bounds['height']/2
     if await p.evaluate('Boolean(window.disableAfterResolution)'):await p.evaluate('document.querySelector("input,button").disabled=true')
     check={'type':'AF_CONFIRM_DEBUGGER_TYPE_TARGET_FOCUSED' if 'TYPE' in typ else 'AF_CONFIRM_DEBUGGER_CLICK_TARGET_VISIBLE','token':r['token']}
     # Focus first for TYPE as in the permitted Input handshake.
     if 'TYPE' in typ:await p.mouse.click(x,y)
     proof=await p.evaluate('(m)=>new Promise(resolve=>listeners[0](m,{},resolve))',check)
     data=proof.get('data',{})
     if not data.get('intact') or ('CLICK' in typ and not data.get('pointer_reachable')):return {'ok':False,'error':'TARGET_CHANGED'}
     if 'TYPE' in typ:await p.keyboard.press('ControlOrMeta+A');await p.keyboard.insert_text(r['value'])
     else:await p.mouse.click(x,y)
     return {'ok':True,'data':{'ok':True,'strategy':'fixture_input_rpc_playwright','cdp_methods':[]}}
    return {'ok':True}
   try:
    await p.expose_binding('RPC',rpc);await p.set_content('<!doctype html><body>'+html+'</body>')
    await p.evaluate('''()=>{window.__AF_TEST_EXPORTS={};window.__AF_TEST_UI_DELAY_MS=0;window.__AF_TEST_DEBUGGER_TYPE_TIMEOUT_MS=500;window.listeners=[];window.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f),removeListener(){}},sendMessage:(m,cb)=>RPC(m).then(cb)}};}''')
    await p.add_script_tag(path=str(ROOT/'core.js'));await p.add_script_tag(content='(()=>{const location=new URL('+json.dumps(url)+');'+(ROOT/'avito_content.js').read_text()+'})();')
    await fn(p,calls);assert not errors,errors;result={'name':name,'status':'PASS','rpc_count':len(calls)}
   except Exception as e:result={'name':name,'status':'FAIL','error':str(e),'page_errors':errors,'rpc_count':len(calls)}
   results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True);await p.close()
  async def plan(p,steps):return await p.evaluate('(steps)=>__AF_TEST_EXPORTS.uiPlan.executeUiActionPlan({steps,plan_fingerprint:"fixture",timing_profile:"CONTROL_VISIBLE",collection_timeout_ms:80})',steps)
  async def click(p,c):
   r=await plan(p,[{'type':'CLICK','target':{'by':'text','value':'Фильтры'}}]);assert r['ok'],r;assert await p.evaluate('window.clicked')==1;assert len([m for m in c if m['type']=='AF_DEBUGGER_CLICK_VISIBLE_TARGET'])==1
  await run('CLICK_visible_generic','<button onclick="window.clicked=(window.clicked||0)+1">Фильтры</button>',click)
  async def typ(p,c):
   r=await plan(p,[{'type':'TYPE','target':{'by':'marker','value':'search-form/suggest/input'},'text':'рабочий ПК'}]);assert r['ok'],r;assert await p.locator('input').input_value()=='рабочий ПК'
  await run('TYPE_exact_visible_reactive_input','<input data-marker="search-form/suggest/input">',typ)
  async def wait(p,c):
   r=await plan(p,[{'type':'WAIT','duration_ms':1}]);assert r['ok'] and r['steps'][0]['duration_ms']==1
  await run('WAIT_bounded','<main>Пауза</main>',wait)
  async def waitfor(p,c):
   await p.evaluate('setTimeout(()=>{const x=document.createElement("button");x.textContent="Фильтры";document.body.append(x)},30)');r=await plan(p,[{'type':'WAIT_FOR','target':{'by':'text','value':'Фильтры'},'timeout_ms':250}]);assert r['ok'],r;assert not c
  await run('WAIT_FOR_late_visible_control','<main>Загрузка</main>',waitfor)
  async def missing(p,c):
   r=await plan(p,[{'type':'WAIT_FOR','target':{'by':'text','value':'Фильтры'},'timeout_ms':30}]);assert not r['ok'];assert not c
  await run('WAIT_FOR_timeout_explicit','<main>Пусто</main>',missing)
  async def snapshot(p,c):
   r=await plan(p,[{'type':'SNAPSHOT','scope':'PAGE_MAIN_VISIBLE'}]);assert r['ok'],r;assert r['snapshot']['scope']=='PAGE_MAIN_VISIBLE';assert not c
  await run('SNAPSHOT_readonly','<main><h1>Каталог</h1></main>',snapshot)
  card='<article data-marker="item"><a data-marker="item-title" href="/moskva/nastolnye_kompyutery/pc_12345678">ПК</a><span data-marker="item-price">10 000 ₽</span><p>16GB SSD256</p></article>'
  async def listings(p,c):
   r=await plan(p,[{'type':'COLLECT_LISTINGS','limit':30}]);assert r['ok'] and len(r['listings'])==1,r;assert not c
  await run('COLLECT_LISTINGS_ordered_read','<main>'+card+'</main>',listings)
  async def details(p,c):
   r=await plan(p,[{'type':'COLLECT_LISTING_DETAILS'}]);assert r['ok'],r;assert r['listing_details']['direct_delivery']['confirmed'];assert not c
  await run('COLLECT_LISTING_DETAILS_passthrough','<h1 data-marker="item-view/title-info">ПК</h1><span data-marker="item-view/item-price">10 000 ₽</span><p data-marker="item-view/item-description">16GB SSD256</p><button>Купить с доставкой</button>',details)
  menudoc='<section role="dialog"><label>Город<input id="city" placeholder="Город" value="Мос" aria-controls="suggest"></label><div id="suggest" role="listbox"><button role="option" onclick="document.getElementById(\'city\').value=\'Москва\'">Москва</button></div></section>'
  async def menu(p,c):
   await p.locator('#city').focus();r=await plan(p,[{'type':'COLLECT_MENU'}]);assert r['ok'],r;assert r['menu']['options'];assert not c
  await run('COLLECT_MENU_visible_only',menudoc,menu)
  async def select(p,c):
   await p.locator('#city').focus();r=await plan(p,[{'type':'SELECT_OPTION','text':'Москва'}]);assert r['ok'],r;assert await p.locator('#city').input_value()=='Москва'
  await run('SELECT_OPTION_exact_dialog_option',menudoc,select)
  async def unrelated(p,c):
   await p.locator('#city').focus();r=await plan(p,[{'type':'SELECT_OPTION','text':'Москва'}]);assert not r['ok'],r;assert not [m for m in c if 'DEBUGGER' in m['type']]
  await run('unrelated_existing_menu_not_selected',menudoc.replace('aria-controls="suggest"','aria-controls="other"'),unrelated)
  async def ambiguous(p,c):
   await p.locator('#city').focus();r=await plan(p,[{'type':'SELECT_OPTION','text':'Москва'}]);assert r['blocked_reason']=='UI_MENU_OPTION_AMBIGUOUS',r;assert not [m for m in c if 'DEBUGGER' in m['type']]
  await run('duplicate_option_not_arbitrarily_chosen',menudoc.replace('</div></section>','<button role="option">Москва</button></div></section>'),ambiguous)
  async def invalid(p,c):
   r=await plan(p,[{'type':'EVALUATE_JS'}]);assert r['blocked_reason']=='UI_PLAN_ACTION_NOT_ALLOWED';assert not c
  await run('unknown_action_no_execution','<main>Каталог</main>',invalid)
  for text in ['Показать телефон','Написать','Купить с доставкой','В корзину','Забронировать']:
   async def forbidden(p,c,text=text):
    r=await plan(p,[{'type':'CLICK','target':{'by':'text','value':text}}]);assert not r['ok'],r;assert not await p.evaluate('Boolean(window.clicked)');assert not [m for m in c if 'DEBUGGER' in m['type']]
   await run('forbidden_'+text,'<button onclick="window.clicked=true">'+text+'</button>',forbidden)
  async def obscured(p,c):
   r=await plan(p,[{'type':'CLICK','target':{'by':'text','value':'Фильтры'}}]);assert not r['ok'],r;assert not [m for m in c if 'DEBUGGER' in m['type']]
  await run('covered_target_does_not_receive_pointer','<button>Фильтры</button><div style="position:fixed;inset:0;z-index:99;background:white"></div>',obscured)
  async def disablelate(p,c):
   await p.evaluate('window.disableAfterResolution=true');r=await plan(p,[{'type':'CLICK','target':{'by':'text','value':'Фильтры'}}]);assert not r['ok'],r;assert not await p.evaluate('Boolean(window.clicked)')
  await run('target_disabled_during_input_handshake','<button onclick="window.clicked=true">Фильтры</button>',disablelate)
  async def typelate(p,c):
   await p.evaluate('window.disableAfterResolution=true');r=await plan(p,[{'type':'TYPE','target':{'by':'marker','value':'search-form/suggest/input'},'text':'new'}]);assert not r['ok'],r;assert await p.locator('input').input_value()=='old'
  await run('TYPE_disabled_during_focus_handshake','<input value="old" data-marker="search-form/suggest/input">',typelate)
  full='<main><form role="search"><input data-marker="search-form/suggest/input" placeholder="Поиск"><button>Все категории</button><button>Найти</button><button data-marker="location-widget/change-location">Город</button><input data-marker="price-from/input"></form>'+card+'<section><h2>Отзывы</h2><p>Публичный отзыв</p></section><section role="dialog" aria-modal="true"><button>Закрыть</button></section></main>'
  for scope in ['PAGE_MAIN_VISIBLE','SEARCH_SURFACE_VISIBLE','SEARCH_INPUT_ANCESTRY_VISIBLE','SEARCH_INPUT_PARENT_VISIBLE','FILTERS_VISIBLE','DIALOG_VISIBLE','LISTING_CARD_VISIBLE','REVIEWS_VISIBLE']:
   async def diag(p,c,scope=scope):
    r=await p.evaluate('(scope)=>__AF_TEST_EXPORTS.dom.diagnose({scope,depth:1,parent_depth:1})',scope);assert not r.get('blocked_reason'),r;assert not c
   await run('DIAGNOSE_'+scope,full,diag)
  async def openloc(p,c):
   r=await p.evaluate('()=>new Promise(resolve=>listeners[0]({type:"AF_PERFORM_DIAGNOSTIC_ACTION",request:{action:"OPEN_LOCATION_DIALOG"}},{},resolve))');assert r['result']['ok'],r;assert await p.evaluate('window.clicked')==1
  await run('DIAGNOSTIC_ACTION_OPEN_LOCATION_DIALOG','<a role="button" data-marker="search-form/change-location" onclick="window.clicked=(window.clicked||0)+1">Город</a>',openloc)
  async def private(p,c):
   r=await p.evaluate('()=>new Promise(resolve=>listeners[0]({type:"AF_INSPECT_AVITO_DOM"},{},resolve))');assert r=={'ok':False,'error':'PUBLIC_AVITO_PAGE_REQUIRED'},r;assert not c
  await run('private_page_not_read','<main>PRIVATE FIXTURE</main>',private,'https://www.avito.ru/profile/messenger')
  async def cancelled(p,c):
   r=await p.evaluate('async()=>{let p=__AF_TEST_EXPORTS.uiPlan.executeUiActionPlan({steps:[{type:"WAIT",duration_ms:150},{type:"COLLECT_LISTINGS",limit:10}]});setTimeout(()=>__AF_TEST_EXPORTS.dom.cancelOperation(),20);try{await p;return "executed"}catch(e){return e.message}}');assert 'CANCELLED' in r,r
  await run('STOP_cancels_later_step','<main>'+card+'</main>',cancelled)
  await ctx.close();await b.close()
 out={'scope':'CHROMIUM_PUBLIC_UI_ACTIONS_WITH_INPUT_RPC_DOUBLE_NOT_INSTALLED','live_provider_calls':0,'results':results,'pass':sum(x['status']=='PASS' for x in results),'fail':sum(x['status']!='PASS' for x in results)};OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2));sys.exit(bool(out['fail']))
asyncio.run(main())
