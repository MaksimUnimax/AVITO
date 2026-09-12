"""Run actual packaged Avito adapter; compare its PING to its own manifest.
Offline Chromium + Chrome messaging double, not installed/live acceptance.
"""
import asyncio, hashlib, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

async def run(root, output):
    manifest = json.loads((root/'manifest.json').read_text())
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-background-networking'])
        context = await browser.new_context()
        await context.route('**/*',lambda route:route.abort())
        page = await context.new_page()
        await page.set_content('<!doctype html><main>Offline version-contract probe</main>')
        await page.add_script_tag(content='''window.__listeners=[];
          window.chrome={runtime:{onMessage:{addListener:f=>__listeners.push(f),
          removeListener:f=>{window.__listeners=__listeners.filter(x=>x!==f)}},
          sendMessage:(m,cb)=>cb?.({ok:true})}};
          window.__ping=()=>new Promise(resolve=>{
          for(const f of __listeners)f({type:'AF_AVITO_PING'},{},resolve)});''')
        await page.add_script_tag(path=str(root/'core.js'))
        await page.add_script_tag(content="(()=>{const location=new URL('https://www.avito.ru/all/nastolnye_kompyutery?q=fixture');"+(root/'avito_content.js').read_text()+'})();')
        ping=await asyncio.wait_for(page.evaluate('window.__ping()'),timeout=5)
        await browser.close()
    passed=ping.get('ok') is True and ping.get('version')==manifest['version']
    result={'scope':'OFFLINE_PRODUCTION_ADAPTER_PING_VS_EXACT_MANIFEST','manifest_version':manifest['version'],'actual_adapter_ping':ping,'status':'PASS' if passed else 'FAIL','code':None if passed else 'AVITO_ADAPTER_VERSION_MISMATCH_RELOAD_REQUIRED','avito_content_sha256':hashlib.sha256((root/'avito_content.js').read_bytes()).hexdigest(),'live_provider_calls':0,'installed_live_acceptance':'NOT_RUN'}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result));return 0 if passed else 1
if __name__=='__main__':
    raise SystemExit(asyncio.run(run(Path(sys.argv[1]).resolve(),Path(sys.argv[2]).resolve())))
