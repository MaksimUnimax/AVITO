"""R2 of the same runtime patch: fix only disposal in the offline Worker VM.
The first ZIP remains immutable. Production runtime must be byte-identical.
"""
import hashlib,json,shutil,sys
from pathlib import Path
source,target=map(lambda x:Path(x).resolve(),sys.argv[1:3]);assert not target.exists()
shutil.copytree(source,target,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
p=target/'tests/helpers/worker_vm.cjs';s=p.read_text()
assert 'let disposed=false;' not in s
s=s.replace('let nextId=40,ctx,effective=', 'let disposed=false;\n  let nextId=40,ctx,effective=',1)
s=s.replace('const timerFn=(fn,ms,...args)=>{const t=setTimeout(', 'const timerFn=(fn,ms,...args)=>{if(disposed)return null;const t=setTimeout(',1)
s=s.replace('dispose(){for(const t of timers)', 'dispose(){disposed=true;for(const t of timers)',1)
p.write_text(s)
assert 'if(disposed)return null' in s and 'dispose(){disposed=true;' in s
shutil.copyfile(Path(__file__).parent/'worker_fixture_disposal_v136.test.js',target/'tests/worker_fixture_disposal_v136.test.js')
files=['manifest.json','avito_content.js','chatgpt_content.js','service_worker.js','core.js','proxy_manager.js','recovery.js','popup.js','popup.html','popup.css']
for n in files:assert (source/n).read_bytes()==(target/n).read_bytes(),n
report={'version':'1.0.36','build_revision':'R2_QA_HARNESS_DISPOSAL','previous_candidate_archive_sha256':'207fcb99afcf163efafb4987cecf945182fea720d90b744332ef2e8a97ae39e7','runtime_changed_from_r1':[],'cause':'Disposed test VM could re-arm report-acknowledgement timers from already queued promise continuations; all assertions completed but child process did not exit. Fence timers after test teardown; do not force process.exit or alter production timers.','tests_changed':['tests/helpers/worker_vm.cjs'],'tests_added':['tests/worker_fixture_disposal_v136.test.js'],'live_acceptance':'NOT_RUN'}
(target/'QA_HARNESS_REVISION_R2.json').write_text(json.dumps(report,indent=2)+'\n')
readme=target/'README.md';readme.write_text(readme.read_text()+'\n## Ревизия R2\n\nРабочие JS и manifest побайтно совпадают с первым кандидатом v1.0.36. Исправлена только очистка offline test VM после dispose: отложенные продолжения не могут повторно включать таймеры уже завершённого экземпляра. Нет принудительного process.exit(0), пропуска сценариев или изменения production-таймеров. Первый кандидат и его FAIL сохранены отдельно.\n')
sums=''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+str(f.relative_to(target))+'\n' for f in sorted(target.rglob('*')) if f.is_file() and f.name!='SHA256SUMS.txt')
(target/'SHA256SUMS.txt').write_text(sums)
print(json.dumps(report))
