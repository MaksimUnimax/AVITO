"""Reproducible offline v1.0.33 release suite.
Never changes browser policy and never calls Avito/ChatGPT/Proxy.Market.
Long Chromium matrices are split so each child process has a bounded deadline.
"""
from __future__ import annotations
import json, os, shutil, subprocess, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('AF_QA_OUTPUT','/tmp/avito-finder-v132-qa')).resolve();OUT.mkdir(parents=True,exist_ok=True)
if not shutil.which('node'): raise SystemExit('Node.js is required; dependency installation is not automatic.')
results=[]
CLEAN_KEYS=('AF_SOURCE_ROOT','AF_CYCLE_FILTER','AF_RECEIPT_FILTER','AF_COMPOSER_FILTER','AF_TEST_FILTER','AF_TEST_FROM','AF_TEST_TO','AF_DEBUG_CYCLE','AF_BROWSER_REPORT','AF_CHAT_BROWSER_REPORT','AF_COMPOSER_REPORT','AF_RECEIPTS_REPORT','AF_CYCLE_REPORT','AF_QUEUE_FILTER','AF_QUEUE_REPORT','AF_QUEUE_CYCLES_REPORT','AF_ACTION_REPORT','AF_POPUP_LIFECYCLE_REPORT','AF_INSTALLED_REPORT','AF_V129_BROWSER_REPORT','AF_START_RECEIPT_REPORT','AF_PROXY_ISOLATION_REPORT')
def run(name,args,extra=None,timeout=60):
    env=dict(os.environ)
    for k in CLEAN_KEYS: env.pop(k,None)
    env.update({k:str(v) for k,v in (extra or {}).items()})
    started=time.monotonic()
    try:
        with (OUT/(name+'.log')).open('w') as log:
            proc=subprocess.run(args,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=timeout)
        item={'name':name,'exit_code':proc.returncode,'status':'PASS' if proc.returncode==0 else 'FAIL'}
    except subprocess.TimeoutExpired:
        item={'name':name,'status':'FAIL','error':'test_deadline_exceeded'}
    item['duration_seconds']=round(time.monotonic()-started,3);results.append(item);print(json.dumps(item),flush=True)
node_tests=[str(p.relative_to(ROOT)) for p in sorted((ROOT/'tests').glob('*.test.js'))]
run('node',['node','--test',*node_tests],timeout=30)
run('avito',[sys.executable,'tests/browser_fixtures_v125.py'],{'AF_BROWSER_REPORT':OUT/'avito.json'},45)
run('chat',[sys.executable,'tests/browser_chat_fixtures_v125.py'],{'AF_CHAT_BROWSER_REPORT':OUT/'chat.json'},45)
run('start_receipt',[sys.executable,'tests/browser_start_receipt_v130.py'],{'AF_START_RECEIPT_REPORT':OUT/'start_receipt.json'},45)
run('composer_01_15',[sys.executable,'tests/browser_composer_v126.py'],{'AF_COMPOSER_REPORT':OUT/'composer_01_15.json','AF_TEST_FROM':1,'AF_TEST_TO':15},45)
run('composer_16_28',[sys.executable,'tests/browser_composer_v126.py'],{'AF_COMPOSER_REPORT':OUT/'composer_16_28.json','AF_TEST_FROM':16,'AF_TEST_TO':29},45)
run('receipts',[sys.executable,'tests/browser_receipts_v127.py'],{'AF_RECEIPTS_REPORT':OUT/'receipts.json'},45)
for filt,timeout in [
    ('full_three_page_folded_cycle',35),
    ('assistant_first_start_then_three_pages',35),
    ('ip_block_recovery_then_three_pages',35),
    ('rate_limit_recovery_then_three_pages',35),
    ('late_body_then_worker_restart_reconcile',42),
    ('captcha_manual_boundary',25),
]:
    run('cycle_'+filt,[sys.executable,'tests/browser_cycle_v127.py'],{'AF_CYCLE_REPORT':OUT/('cycle_'+filt+'.json'),'AF_CYCLE_FILTER':filt},timeout)
run('dom_contracts',[sys.executable,'tests/v129/browser_contracts.py'],{'AF_V129_BROWSER_REPORT':OUT/'dom_contracts.json'},30)
run('popup_lifecycle',[sys.executable,'tests/v129/browser_popup_lifecycle.py'],{'AF_POPUP_LIFECYCLE_REPORT':OUT/'popup_lifecycle.json'},30)
run('actions_scopes',[sys.executable,'tests/v129/browser_actions.py'],{'AF_ACTION_REPORT':OUT/'actions_scopes.json'},30)
run('proxy_transport_isolation',[sys.executable,'tests/v131/browser_proxy_transport_isolation.py'],{'AF_PROXY_ISOLATION_REPORT':OUT/'proxy_transport_isolation.json'},60)
for filt in ['six_details_two_batches','rate_limit_mid_queue_restart_direct_route','manual_captcha_same_child_resume','restart_during_persisted_gap','stop_during_late_detail_response','removed_listing_is_negative_observation','thirty_detail_large_report']:
    run('queue_'+filt,[sys.executable,'tests/v129/browser_queue_cycles.py'],{'AF_QUEUE_CYCLES_REPORT':OUT/('queue_'+filt+'.json'),'AF_QUEUE_FILTER':filt},115)
run('installed_environment_probe',[sys.executable,'tests/v129/installed_probe.py'],{'AF_INSTALLED_REPORT':OUT/'installed_probe.json'},15)
for item in results:
    if item['name']=='installed_environment_probe' and item['status']=='PASS': item['status']='PROBE_EXECUTED_NOT_ACCEPTANCE'
summary={'scope':'OFFLINE; production runtime + Chromium DOM fixtures + Chrome API doubles; NOT installed/live websites/providers','results':results,'pass':sum(x['status']=='PASS' for x in results),'fail':sum(x['status']=='FAIL' for x in results),'installed_acceptance':json.loads((OUT/'installed_probe.json').read_text()) if (OUT/'installed_probe.json').exists() else {'status':'NOT_RUN'}}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
raise SystemExit(1 if summary['fail'] else 0)
