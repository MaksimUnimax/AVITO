"""Full offline release suite; incremental checkpoint after EVERY process.
Preserves all v133 aggregate cases, splits composer 1..29 into bounded blocks,
and adds actual packaged adapter PING + v134/v135 regressions. No live acceptance.
"""
import json, os, signal, subprocess, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('AF_QA_OUTPUT','/tmp/avito-v136-qa')).resolve();OUT.mkdir(parents=True,exist_ok=True)
results=[]
CLEAN=('AF_SOURCE_ROOT','AF_CYCLE_FILTER','AF_RECEIPT_FILTER','AF_COMPOSER_FILTER','AF_TEST_FILTER','AF_TEST_FROM','AF_TEST_TO','AF_DEBUG_CYCLE','AF_BROWSER_REPORT','AF_CHAT_BROWSER_REPORT','AF_COMPOSER_REPORT','AF_RECEIPTS_REPORT','AF_CYCLE_REPORT','AF_QUEUE_FILTER','AF_QUEUE_REPORT','AF_QUEUE_CYCLES_REPORT','AF_ACTION_REPORT','AF_POPUP_LIFECYCLE_REPORT','AF_INSTALLED_REPORT','AF_V129_BROWSER_REPORT','AF_START_RECEIPT_REPORT','AF_PROXY_ISOLATION_REPORT','AF_SCENARIO_OUT')
def save(complete=False):
    summary={'scope':'OFFLINE_PRODUCTION_RUNTIME_CHROMIUM_DOM_CHROME_API_DOUBLES','version':json.loads((ROOT/'manifest.json').read_text())['version'],'complete':complete,'results':results,'pass':sum(x['status']=='PASS' for x in results),'fail':sum(x['status']=='FAIL' for x in results),'live_provider_calls':0,'installed_live_acceptance':'NOT_RUN'}
    if (OUT/'installed_probe.json').exists():summary['installed_environment_probe']=json.loads((OUT/'installed_probe.json').read_text())
    tmp=OUT/'summary.json.tmp';tmp.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');tmp.replace(OUT/'summary.json');return summary

def run(name,args,extra=None,timeout=60,probe=False):
    env=dict(os.environ)
    for k in CLEAN:env.pop(k,None)
    env.update({k:str(v) for k,v in (extra or {}).items()});env['PYTHONDONTWRITEBYTECODE']='1'
    started=time.monotonic()
    with (OUT/(name+'.log')).open('w') as log:
        proc=subprocess.Popen(args,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            code=proc.wait(timeout=timeout)
            row={'name':name,'exit_code':code,'status':('PROBE_EXECUTED_NOT_ACCEPTANCE' if probe else 'PASS') if code==0 else 'FAIL'}
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid,signal.SIGKILL);proc.wait()
            row={'name':name,'status':'FAIL','error':'test_deadline_exceeded'}
    row['duration_seconds']=round(time.monotonic()-started,3);row['deadline_seconds']=timeout
    results.append(row);save();print(json.dumps(row),flush=True)
    # Optional checkpoint commit from CI: only QA outputs, no runtime changes.
    if os.environ.get('AF_QA_GIT_CHECKPOINT')=='1':
        subprocess.run(['git','add','--',str(OUT)],check=True)
        if subprocess.run(['git','diff','--cached','--quiet']).returncode:
            subprocess.run(['git','commit','-m','qa checkpoint v136: '+name+' '+row['status']],check=True,stdout=subprocess.DEVNULL)
            subprocess.run(['git','push','origin','HEAD:main'],check=True,stdout=subprocess.DEVNULL)

run('adapter_identity',[sys.executable,'tests/check_packaged_adapter_v136.py',str(ROOT),str(OUT/'adapter_identity.json')],timeout=20)
run('node',['node','--test',*[str(p.relative_to(ROOT)) for p in sorted((ROOT/'tests').glob('*.test.js'))]],timeout=45)
for n,f,key,t in [('avito','browser_fixtures_v125.py','AF_BROWSER_REPORT',45),('chat','browser_chat_fixtures_v125.py','AF_CHAT_BROWSER_REPORT',60),('start_receipt','browser_start_receipt_v130.py','AF_START_RECEIPT_REPORT',45)]:
    run(n,[sys.executable,'tests/'+f],{key:OUT/(n+'.json')},t)
for first,last in [(1,5),(6,10),(11,15),(16,20),(21,25),(26,29)]:
    n=f'composer_{first:02d}_{last:02d}';run(n,[sys.executable,'tests/browser_composer_v126.py'],{'AF_COMPOSER_REPORT':OUT/(n+'.json'),'AF_TEST_FROM':first,'AF_TEST_TO':last},45)
run('receipts',[sys.executable,'tests/browser_receipts_v127.py'],{'AF_RECEIPTS_REPORT':OUT/'receipts.json'},60)
for case in ['full_three_page_folded_cycle','assistant_first_start_then_three_pages','ip_block_recovery_then_three_pages','rate_limit_recovery_then_three_pages','late_body_then_worker_restart_reconcile','captcha_manual_boundary']:
    n='cycle_'+case;run(n,[sys.executable,'tests/browser_cycle_v127.py'],{'AF_CYCLE_REPORT':OUT/(n+'.json'),'AF_CYCLE_FILTER':case},90)
for n,f,key,t in [('dom_contracts','v129/browser_contracts.py','AF_V129_BROWSER_REPORT',30),('popup_lifecycle','v129/browser_popup_lifecycle.py','AF_POPUP_LIFECYCLE_REPORT',30),('actions_scopes','v129/browser_actions.py','AF_ACTION_REPORT',30),('proxy_transport_isolation','v131/browser_proxy_transport_isolation.py','AF_PROXY_ISOLATION_REPORT',60)]:
    run(n,[sys.executable,'tests/'+f],{key:OUT/(n+'.json')},t)
for case in ['six_details_two_batches','rate_limit_mid_queue_restart_direct_route','manual_captcha_same_child_resume','restart_during_persisted_gap','stop_during_late_detail_response','removed_listing_is_negative_observation','thirty_detail_large_report']:
    n='queue_'+case;run(n,[sys.executable,'tests/v129/browser_queue_cycles.py'],{'AF_QUEUE_CYCLES_REPORT':OUT/(n+'.json'),'AF_QUEUE_FILTER':case},115)
run('writing_body_stability',[sys.executable,'tests/scenarios_v134/block01_writing_capture.py'],{'AF_SCENARIO_OUT':OUT/'writing_body_stability.json'},45)
run('parser_block02',['node','tests/scenarios_v134/block02_parser.js'],{'AF_SCENARIO_OUT':OUT/'parser_block02.json'},20)
run('payload_ownership_block03',['node','tests/scenarios_v134/block03_worker_payload_state.js'],{'AF_SCENARIO_OUT':OUT/'payload_ownership_block03.json'},30)
run('ordinary_form_terminal_gate',[sys.executable,'tests/reproduce_prompt_form_hang_v135.py'],timeout=20)
run('form_gate_source_contract',[sys.executable,'tests/v135_prompt_form_terminal_gate.test.py'],timeout=10)
# A separate repeated complete cycle proves continued same-chat operation, not just one dispatch.
run('cycle_repeat_three_pages',[sys.executable,'tests/browser_cycle_v127.py'],{'AF_CYCLE_REPORT':OUT/'cycle_repeat_three_pages.json','AF_CYCLE_FILTER':'full_three_page_folded_cycle'},90)
run('installed_environment_probe',[sys.executable,'tests/v129/installed_probe.py'],{'AF_INSTALLED_REPORT':OUT/'installed_probe.json'},20,probe=True)
s=save(True);print(json.dumps({'complete':True,'pass':s['pass'],'fail':s['fail']}),flush=True)
raise SystemExit(1 if s['fail'] else 0)
