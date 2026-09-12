"""Actual popup.html/popup.js and ChatGPT adapter in Chromium. Chrome RPC doubles.
No installed extension, provider requests or account/page navigation.
"""
import asyncio,json,os,time,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(os.environ.get('AF_SOURCE_ROOT',str(Path(__file__).resolve().parents[2])))
OUT=Path(os.environ.get('AF_POPUP_LIFECYCLE_REPORT','/tmp/avito-popup-lifecycle.json'))
CID='11111111-1111-4111-8111-111111111111';URL='https://chatgpt.com/c/'+CID
results=[]
async def main():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-background-networking']);ctx=await b.new_context();ctx.set_default_timeout(2500);await ctx.route('**/*',lambda r:r.abort())
  async def run(name,fn):
   p=await ctx.new_page();errs=[];p.on('pageerror',lambda e:errs.append(str(e)));ts=time.monotonic()
   try:await fn(p);assert not errs,errs;r={'name':name,'status':'PASS'}
   except Exception as e:r={'name':name,'status':'FAIL','error':str(e),'browser_errors':errs}
   r['seconds']=round(time.monotonic()-ts,3);results.append(r);print(json.dumps(r,ensure_ascii=False),flush=True);await p.close()
  async def popup(p,state=None,reply=None,slow=None):
   html=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'popup.html').read_text(),flags=re.S|re.I);await p.set_content(html);await p.evaluate("document.querySelectorAll('details').forEach(el=>el.open=true)")
   await p.evaluate('''cfg=>{window.calls=[];window.replyOverrides=cfg.reply||{};window.slowTypes=cfg.slow||{};window.pending=[];window.changeListeners=[];window.__AF_TEST_POPUP_TIMEOUT_MS=250;window.confirm=()=>true;window.copied=[];
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>copied.push(t)}});
    window.VIEW={ok:true,state:cfg.state||{status:'IDLE'},logs:[],proxy:{mode:'direct',profiles:[{id:'p1',host:'example.invalid',http_port:10000,rotation:0,country:'ru'}],selected_profile_id:'p1',hidden_profile_count:1},inspection:{report:'OLD'}};
    window.chrome={runtime:{sendMessage:(m,cb)=>{calls.push(m);if(slowTypes[m.type]){pending.push(()=>cb(m.type==='AF_GET_VIEW'?VIEW:{ok:true}));return;}if(m.type==='AF_PROXY_DATA_SAVER')VIEW.proxy.data_saver_enabled=m.enabled;let v=replyOverrides[m.type]||{ok:true};if(m.type==='AF_GET_VIEW')v=VIEW;if(m.type==='AF_PROXY_PROFILE_DETAILS')v={ok:true,profile:{login:'test-user',password:'test-password'}};cb(v);}},storage:{onChanged:{addListener:f=>changeListeners.push(f)}}};}''',{'state':state,'reply':reply,'slow':slow})
   await p.add_script_tag(path=str(ROOT/'popup.js'));await p.wait_for_timeout(40)
  for state in ['REPORT_DELIVERY_BLOCKED','REPORT_DELIVERY_UNCERTAIN','REPORT_READY_IN_COMPOSER','PAUSED_USER_COMPOSER_OCCUPIED']:
   async def f(p,state=state):
    await popup(p,{'status':state,'report':'CURRENT'});assert await p.locator('#report').input_value()=='CURRENT';assert await p.locator('#continue').is_enabled();await p.locator('#continue').click();assert await p.evaluate("calls.filter(m=>m.type==='AF_CONTINUE_REPORT').length")==1
   await run('resume_'+state,f)
  for state in ['IDLE','CANCELLED_BY_USER','AVITO_TAB_ACTIVE','REPORT_DELIVERY_IN_PROGRESS']:
   async def f(p,state=state):await popup(p,{'status':state,'report':'x'});assert await p.locator('#continue').is_disabled()
   await run('resume_disabled_'+state,f)
  async def seq(p):
   await popup(p,{'status':'WAITING_FOR_NEXT_ASSISTANT_FORM','sequential_review':{'status':'paused_for_manual_captcha'}});assert await p.locator('#continue').is_enabled();assert await p.locator('#continue').inner_text()=='Продолжить сбор'
  await run('manual_captcha_resume_button',seq)
  async def timeout(p):
   await popup(p,slow={'AF_START':True});await p.locator('#start').click();await p.wait_for_timeout(350);assert await p.locator('#start').is_enabled();assert 'срок' in await p.locator('#ui-request-error').inner_text();await p.wait_for_timeout(1100);assert await p.locator('#ui-request-error').is_visible();assert await p.evaluate("calls.filter(m=>m.type==='AF_START').length")==1
  await run('timeout_no_retry_buttons_reenabled_error_survives_refresh',timeout)
  async def cancel(p):await popup(p);await p.locator('#stop').click();assert await p.evaluate("calls.filter(m=>m.type==='AF_STOP').length")==1
  await run('stop_one_rpc',cancel)
  async def coalesce(p):
   await popup(p,slow={'AF_GET_VIEW':True});await p.evaluate('for(let i=0;i<40;i++)changeListeners.forEach(f=>f({},"local"))');assert await p.evaluate("calls.filter(m=>m.type==='AF_GET_VIEW').length")==1;await p.evaluate('pending.shift()()');await p.wait_for_timeout(30);assert await p.evaluate("calls.filter(m=>m.type==='AF_GET_VIEW').length")==2
  await run('status_refresh_single_flight',coalesce)
  async def copies(p):
   await popup(p,{'status':'IDLE','report':'EXACT CPU SSD\nPRICE'});await p.locator('#copy').click();assert await p.evaluate('copied[0]')=='EXACT CPU SSD\nPRICE';await p.locator('#copy-assistant-prompt').click();assert await p.evaluate('copied[1].length')>100
  await run('copy_report_and_prompt',copies)
  async def secrets(p):
   await popup(p);assert await p.locator('#proxy-profile-password').get_attribute('type')=='password';await p.locator('#proxy-password-toggle').click();assert await p.locator('#proxy-profile-password').get_attribute('type')=='text';await p.locator('#proxy-password-toggle').click();assert await p.locator('#proxy-profile-password').get_attribute('type')=='password'
  await run('credentials_hidden_and_explicit_toggle',secrets)
  for selector,typ in [('#proxy-sync','AF_PROXY_MARKET_SYNC'),('#proxy-main-action','AF_PROXY_APPLY'),('#proxy-key-check','AF_PROXY_KEY_CHECK'),('#proxy-endpoint-create','AF_PROXY_ENDPOINT_CREATE'),('#proxy-create-reconciled','AF_PROXY_CREATE_ACKNOWLEDGE'),('#proxy-restore-hidden','AF_PROXY_PROFILE_RESTORE'),('#proxy-remove-profile','AF_PROXY_PROFILE_DELETE'),('#proxy-traffic-refresh','AF_PROXY_TRAFFIC_REFRESH'),('#proxy-diagnostic','AF_PROXY_DIAGNOSTIC')]:
   async def f(p,selector=selector,typ=typ):
    await popup(p);await p.locator(selector).click();assert await p.evaluate('(t)=>calls.filter(m=>m.type===t).length',typ)==1
   await run('popup_routes_'+typ,f)
  async def offlinefield(p):await popup(p);assert 'обычные сетевые настройки' in await p.locator('#proxy-status').inner_text()
  await run('off_means_release_not_forced_direct',offlinefield)
  async def activeoff(p):
   await popup(p);await p.evaluate("VIEW.proxy.mode='proxy';VIEW.proxy.active_profile=VIEW.proxy.profiles[0];changeListeners.forEach(f=>f({},'local'))");await p.wait_for_timeout(30);await p.locator('#proxy-main-action').click();assert await p.evaluate("calls.filter(m=>m.type==='AF_PROXY_DIRECT').length")==1
  await run('active_profile_off_routes_release',activeoff)
  async def datasaver(p):
   await popup(p);await p.locator('#proxy-data-saver').uncheck();m=await p.evaluate("calls.find(m=>m.type==='AF_PROXY_DATA_SAVER')");assert m and m['enabled'] is False
  await run('data_saver_change_routes_boolean',datasaver)
  async def stalecred(p):
   await popup(p);await p.evaluate("VIEW.proxy.profiles.push({...VIEW.proxy.profiles[0],id:'p2'});changeListeners.forEach(f=>f({},'local'))");await p.wait_for_timeout(30);await p.locator('#proxy-profile').select_option('p2');assert await p.evaluate("calls.filter(m=>m.type==='AF_PROXY_PROFILE_DETAILS').at(-1).profile_id")=='p2'
  await run('profile_change_reads_selected_not_active',stalecred)
  # Adapter startup/reload and browser online/SPA behavior use actual message map.
  async def chat(p):
   await p.set_content('<main><section data-turn="user" data-turn-id="start"><div data-message-author-role="user">Ищи</div></section></main><form><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></form>')
   await p.evaluate('''u=>{window.AF_LOC=new URL(u);window.sentMessages=[];window.__AF_TEST_EXPORTS={};window.listeners=[];window.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f),removeListener(){}},sendMessage:(m,cb)=>{sentMessages.push(m);let data=null;if(m.type==='AF_CAPTURE_RECOVER_CONTINUOUS')data={resume:true,search_id:'run-fixture',conversation_id:AF_LOC.pathname.split('/').at(-1),anchor_turn_id:'start',expected_identity:{origin:AF_LOC.origin,chat_path:AF_LOC.pathname,conversation_id:AF_LOC.pathname.split('/').at(-1)}};cb({ok:true,data});}}};}''',URL)
   await p.add_script_tag(path=str(ROOT/'core.js'));await p.add_script_tag(content='(()=>{const location=AF_LOC;'+(ROOT/'chatgpt_content.js').read_text()+'})();');await p.wait_for_timeout(80)
  async def reload(p):
   await chat(p);assert await p.evaluate("sentMessages.some(m=>m.type==='AF_CAPTURE_RECOVER_CONTINUOUS')");s=await p.evaluate('__AF_TEST_EXPORTS.chatCapture.readFixtureState()');assert s['bound_anchor_turn_id']=='start',s
  await run('chat_reload_exact_recovery_rpc_and_initial_anchor',reload)
  async def online(p):
   await chat(p);before=await p.evaluate('__AF_TEST_EXPORTS.chatCapture.readFixtureState()');await p.evaluate("dispatchEvent(new Event('online'))");await p.wait_for_timeout(40);after=await p.evaluate('__AF_TEST_EXPORTS.chatCapture.readFixtureState()');assert before['generation']==after['generation'];assert after['bound_anchor_turn_id']=='start';assert not await p.evaluate("sentMessages.some(m=>m.type.includes('UNUSED')||m.type.includes('GET_RUN'))")
  await run('online_does_not_destroy_active_poll_or_call_legacy_server',online)
  async def spa(p):
   await chat(p);await p.evaluate("AF_LOC.href='https://chatgpt.com/c/22222222-2222-4222-8222-222222222222';document.body.append(document.createElement('span'))");await p.wait_for_timeout(60);assert await p.evaluate("sentMessages.some(m=>m.type==='AF_CAPTURE_CONTEXT_BLOCKED')");await p.evaluate('u=>{AF_LOC.href=u;document.body.append(document.createElement("span"))}',URL);await p.wait_for_timeout(60);assert await p.evaluate("sentMessages.filter(m=>m.type==='AF_CAPTURE_RECOVER_CONTINUOUS').length")>=2;assert (await p.evaluate('__AF_TEST_EXPORTS.chatCapture.readFixtureState()'))['bound_anchor_turn_id']=='start'
  await run('spa_other_chat_pauses_return_recovers_same_anchor',spa)
  async def mutation(p):
   await chat(p);before=await p.evaluate('sentMessages.length');await p.evaluate('for(let i=0;i<100;i++)document.body.append(document.createElement("span"))');await p.wait_for_timeout(40);after=await p.evaluate("sentMessages.filter(m=>m.type==='AF_CAPTURE_RECOVER_CONTINUOUS').length");assert after==1,after
  await run('same_route_mutations_do_not_poll_worker',mutation)
  await ctx.close();await b.close()
 out={'scope':'ACTUAL_POPUP_AND_CHAT_DOM_WITH_CHROME_RPC_DOUBLES_NOT_INSTALLED','live_provider_calls':0,'results':results,'pass':sum(x['status']=='PASS' for x in results),'fail':sum(x['status']!='PASS' for x in results)};OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2));assert not out['fail']
asyncio.run(main())
