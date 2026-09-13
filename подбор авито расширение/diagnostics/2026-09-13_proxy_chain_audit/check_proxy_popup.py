"""Actual R2 popup and actual page classifier; OFFLINE, all requests aborted.
HTML fixtures reproduce the supplied text/structure, not the whole live site.
"""
import asyncio, json, re, os, sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(sys.argv[1]).resolve(); WORKER=Path(sys.argv[2]); OUT=Path(sys.argv[3])
async def main():
    evidence=json.loads(WORKER.read_text())['evidence']; results=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
        context=await browser.new_context();await context.route('**/*',lambda r:r.abort())
        page=await context.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        html=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'popup.html').read_text(),flags=re.S|re.I)
        await page.set_content(html)
        await page.evaluate("document.querySelectorAll('details').forEach(el=>el.open=true)")
        await page.evaluate('''()=>{window.VIEW={ok:true,state:{status:'CANCELLED_BY_USER'},logs:[],proxy:{mode:'direct',profiles:[]}};
        window.chrome={runtime:{sendMessage:(m,cb)=>cb(m.type==='AF_GET_VIEW'?VIEW:m.type==='AF_PROXY_PROFILE_DETAILS'?{ok:true,profile:{}}:{ok:true})},storage:{onChanged:{addListener(){}}}};}''')
        await page.add_script_tag(path=str(ROOT/'popup.js'))
        async def render_case(name,proxy):
            await page.evaluate('p=>{VIEW.proxy=p;renderProxy(p)}',proxy)
            text=await page.locator('#proxy-operation-status').inner_text();print(name,repr(text),flush=True);return {'name':name,'actual_text':text}
        pending=await render_case('successful_probes_target_pending',evidence['pending_proxy']);assert 'Диагностика IP не завершена' in pending['actual_text'];results.append(pending)
        successful=await render_case('successful_probes_target_confirmed',evidence['success_proxy']);assert 'проверяется фактический proxy egress' in successful['actual_text'];assert '198.51.100.10' not in successful['actual_text'];results.append(successful)
        d=evidence['mixed_diagnostic'];text=await page.evaluate('d=>formatProxyDiagnostic(d)',d)
        assert 'IP BLOCK' in text;assert 'CAPTCHA' not in text;assert 'капч' not in text.lower()
        results.append({'name':'mixed_captcha_hidden_in_popup','actual_text':text,'raw_flags':{'ip_block':d['avito_tab']['ip_block'],'captcha':d['avito_tab']['captcha']}})
        assert not errors,errors
        # Minimal DOMs derived from owner snapshots; execute original classifier.
        for name,fixture,expected in [
          ('first_plain_ip_block','<h1>Доступ ограничен: проблема с IP</h1><p>Иногда такое случается — подождите немного и обновите страницу.</p>',False),
          ('second_ip_block_with_captcha','<h2>Доступ ограничен: проблема с IP</h2><form class="form js-submit js-firewall-form"><div id="geetest_captcha"><p>Иногда такое случается, чтобы вернуться на сайт <b>нажмите на кнопку Продолжить</b> для решения капчи</p></div><button type="button" name="submit">Продолжить</button></form>',True)]:
            p=await context.new_page();await p.set_content(fixture);await p.add_script_tag(path=str(ROOT/'core.js'))
            flags=await p.evaluate('AvitoFinderCore.publicPageInterruptionProbe()');assert flags['ip_block'];assert flags['captcha'] is expected;assert not flags['normal_avito']
            results.append({'name':name,'fixture_scope':'DERIVED_FROM_SUPPLIED_DOM_NOT_ORIGINAL_NETWORK_RESPONSE','flags':{k:flags[k] for k in ('ip_block','captcha','rate_limit','normal_avito')}});await p.close()
        await browser.close()
    report={'scope':'OFFLINE_REAL_CHROMIUM_ACTUAL_POPUP_AND_CORE_CLASSIFIER','runtime_modified':False,'live_network_requests':0,'characterizations':results,'assertion_errors':0}
    OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
asyncio.run(main())
