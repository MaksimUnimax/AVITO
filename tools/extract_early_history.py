#!/usr/bin/env python3
import hashlib, json, os, re, shutil, subprocess, sys, zipfile
from pathlib import Path
COMMIT='7c094852bbdefdd9bbec2d7facc618993d61d63a'
OUT=Path(sys.argv[1] if len(sys.argv)>1 else 'early-history-output'); OUT.mkdir(parents=True,exist_ok=True)
def git_bytes(path):
 p=subprocess.run(['git','show',f'{COMMIT}:{path}'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if p.returncode: raise RuntimeError(path+': '+p.stderr.decode('utf-8','replace'))
 return p.stdout
def sha(b):return hashlib.sha256(b).hexdigest()
def safe_extract(zp,dst):
 dst=dst.resolve(); dst.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(zp) as z:
  for i in z.infolist():
   p=(dst/i.filename).resolve()
   if dst not in p.parents and p!=dst: raise RuntimeError('unsafe '+i.filename)
  z.extractall(dst)
def runtime_summary(root):
 runtime=['manifest.json','service_worker.js','chatgpt_content.js','avito_content.js','core.js','proxy_manager.js','recovery.js','popup.js','popup.html','popup.css']
 candidates=[]
 for m in root.rglob('manifest.json'):
  try:o=json.loads(m.read_text(encoding='utf-8-sig'))
  except:continue
  if 'avito' not in (str(o.get('name',''))+' '+str(m)).lower() and 'avito.ru' not in ' '.join(map(str,o.get('host_permissions',[]))).lower():continue
  r=m.parent; files={}
  for n in runtime:
   p=r/n
   if p.exists():files[n]={'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
  tests=[str(p.relative_to(r)) for p in r.rglob('*') if p.is_file() and ('tests' in p.parts or p.name.endswith('.test.js'))]
  candidates.append({'root':str(r.relative_to(root)) if r!=root else '.', 'version':o.get('version'),'version_name':o.get('version_name'),'runtime':files,'tests':sorted(tests)})
 return candidates
# exact v1.0.1
v101=git_bytes('AVITO_FINDER_v1.0.1_popup-assistant-protocol-prompt_TEST_CANDIDATE.zip')
(OUT/'AVITO_FINDER_v1.0.1.zip').write_bytes(v101)
safe_extract(OUT/'AVITO_FINDER_v1.0.1.zip',OUT/'v101')
# exact v1.0.6 from preserved transport
paths=subprocess.check_output(['git','-c','core.quotepath=false','ls-tree','-r','--name-only',COMMIT,'.github/avito-upload']).decode().splitlines()
parts=sorted(p for p in paths if re.search(r'part-\d+\.txt$',p))
b64=b''.join(git_bytes(p) for p in parts)
import base64
v106=base64.b64decode(b64,validate=True)
expected='32e1523e1f0d9d8ff0b5f71f6e9df146542f80327628cd48d35bff73d90d31e9'
assert sha(v106)==expected,(sha(v106),expected)
(OUT/'AVITO_FINDER_v1.0.6.zip').write_bytes(v106); safe_extract(OUT/'AVITO_FINDER_v1.0.6.zip',OUT/'v106')
# history archives
history=[]
for name in ('History.zip','HistoryDocs.zip'):
 b=git_bytes(name); p=OUT/name; p.write_bytes(b); d=OUT/name.replace('.zip',''); safe_extract(p,d)
 names=[]; manifests=[]; archives=[]
 for f in d.rglob('*'):
  if not f.is_file():continue
  rel=str(f.relative_to(d));
  if re.search(r'1\.0\.\d+|v\d+',rel,re.I):names.append(rel)
  if f.name=='manifest.json':
   try:
    o=json.loads(f.read_text(encoding='utf-8-sig')); manifests.append({'path':rel,'version':o.get('version'),'name':o.get('name')})
   except:pass
  if f.suffix.lower() in ('.zip','.tar','.gz','.xz','.rar','.7z'):archives.append({'path':rel,'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())})
 history.append({'archive':name,'bytes':len(b),'sha256':sha(b),'version_named_paths':names[:5000],'manifests':manifests,'nested_archives':archives})
# Compare exact runtime v101-v106 where manifests found.
summary={'historical_commit':COMMIT,'v1.0.1':{'bytes':len(v101),'sha256':sha(v101),'candidates':runtime_summary(OUT/'v101')},'v1.0.6':{'bytes':len(v106),'sha256':sha(v106),'transport_parts':parts,'candidates':runtime_summary(OUT/'v106')},'history':history}
(OUT/'EARLY_HISTORY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
# Text grep evolution inventory across extracted history docs.
keywords=['v1.0.1','v1.0.2','v1.0.3','v1.0.4','v1.0.5','v1.0.6','optional login','DIALOG_VISIBLE','Writing Block','CAPTCHA','explicit listing queue']
hits={k:[] for k in keywords}
for base in (OUT/'History',OUT/'HistoryDocs'):
 for f in base.rglob('*'):
  if not f.is_file() or f.stat().st_size>3_000_000:continue
  try:t=f.read_text(encoding='utf-8',errors='ignore')
  except:continue
  for k in keywords:
   if k.lower() in t.lower():hits[k].append(str(f.relative_to(OUT)))
(OUT/'EARLY_TEXT_HITS.json').write_text(json.dumps(hits,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'v101_sha256':sha(v101),'v106_sha256':sha(v106),'v101_candidates':summary['v1.0.1']['candidates'],'v106_candidates':summary['v1.0.6']['candidates'],'history_manifest_count':sum(len(x['manifests']) for x in history),'history_version_named_paths':sum(len(x['version_named_paths']) for x in history),'hits':{k:len(v) for k,v in hits.items()}},ensure_ascii=False))
