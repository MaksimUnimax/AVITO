"""Reproducible offline release suite. Never changes browser policy or calls providers."""
from __future__ import annotations
import json, os, shutil, subprocess, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('AF_QA_OUTPUT', '/tmp/avito-finder-v127-qa')).resolve()
OUT.mkdir(parents=True, exist_ok=True)
if not shutil.which('node'):
    raise SystemExit('Node.js is required; dependency installation is not automatic.')
results=[]
def run(name: str, args: list[str], env_key: str | None=None, timeout: int=180) -> None:
    started=time.monotonic(); env=dict(os.environ)
    for key in ('AF_SOURCE_ROOT','AF_CYCLE_FILTER','AF_RECEIPT_FILTER','AF_COMPOSER_FILTER','AF_TEST_FILTER','AF_DEBUG_CYCLE'):
        env.pop(key, None)
    if env_key: env[env_key]=str(OUT/(name+'.json'))
    try:
        with (OUT/(name+'.log')).open('w') as log:
            proc=subprocess.run(args,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=timeout)
        result={'name':name,'exit_code':proc.returncode,'status':'PASS' if proc.returncode==0 else 'FAIL'}
    except subprocess.TimeoutExpired:
        result={'name':name,'status':'FAIL','error':'test_deadline_exceeded'}
    result['duration_seconds']=round(time.monotonic()-started,3);results.append(result);print(json.dumps(result),flush=True)
run('node', ['node','--test', *[str(p.relative_to(ROOT)) for p in sorted((ROOT/'tests').glob('*.test.js'))]],timeout=90)
run('avito', [sys.executable,'tests/browser_fixtures_v125.py'], 'AF_BROWSER_REPORT')
run('chat', [sys.executable,'tests/browser_chat_fixtures_v125.py'], 'AF_CHAT_BROWSER_REPORT')
run('composer', [sys.executable,'tests/browser_composer_v126.py'], 'AF_COMPOSER_REPORT')
run('receipts', [sys.executable,'tests/browser_receipts_v127.py'], 'AF_RECEIPTS_REPORT')
run('cycles', [sys.executable,'tests/browser_cycle_v127.py'], 'AF_CYCLE_REPORT',timeout=240)
summary={'scope':'OFFLINE; Chromium DOM and production worker VM; Chrome API doubles; NOT installed extension or live providers', 'results':results,'pass':sum(x['status']=='PASS' for x in results),'fail':sum(x['status']!='PASS' for x in results)}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
raise SystemExit(1 if summary['fail'] else 0)
