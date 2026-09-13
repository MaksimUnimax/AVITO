"""Normal unpacked-install attempt, never changes policy, never calls a provider.
ENVIRONMENT_BLOCKED is NOT a passing installed-extension acceptance result.
"""
import asyncio,json,os,tempfile,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('AF_INSTALLED_REPORT','/tmp/avito-installed-probe.json'))
async def main():
 result={'scope':'NORMAL_UNPACKED_MV3_INSTALL_PROBE','live_provider_calls':0,'policy_modified':False,'browser':subprocess.check_output(['/usr/bin/chromium','--version'],text=True).strip()}
 policies={}
 for p in Path('/etc/chromium/policies/managed').glob('*.json'):
  try:
   d=json.loads(p.read_text());policies.update({k:d[k] for k in ['ExtensionInstallBlocklist','URLBlocklist'] if k in d})
  except Exception:pass
 result['relevant_managed_policy']=policies
 async with async_playwright() as pw:
  with tempfile.TemporaryDirectory(prefix='avito-policy-probe-') as profile:
   ctx=await pw.chromium.launch_persistent_context(profile,executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-background-networking',f'--load-extension={ROOT}'])
   await ctx.route('**/*',lambda r:r.abort())
   try:sw=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker',timeout=6000)
   except Exception:sw=None
   result['service_worker_observed']=sw is not None
   if sw:
    result['manifest']=await sw.evaluate('chrome.runtime.getManifest()');result['status']='LOAD_ONLY_OBSERVED_NOT_FULL_ACCEPTANCE'
   else:result['status']='ENVIRONMENT_BLOCKED' if '*' in policies.get('ExtensionInstallBlocklist',[]) else 'LOAD_NOT_OBSERVED'
   await ctx.close()
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
asyncio.run(main())
