#!/usr/bin/env python3
import hashlib,json,re,subprocess,sys,zipfile,tempfile,shutil,difflib
from pathlib import Path
COMMIT='7c094852bbdefdd9bbec2d7facc618993d61d63a'; OUT=Path(sys.argv[1] if len(sys.argv)>1 else 'nested-history-output');OUT.mkdir(parents=True,exist_ok=True);(OUT/'diffs').mkdir(exist_ok=True)
RUNTIME=['manifest.json','service_worker.js','chatgpt_content.js','avito_content.js','core.js','proxy_manager.js','recovery.js','popup.js','popup.html','popup.css']
PATS={
'writing_block':r'WRITING_BLOCK|writing[_ -]?block','assistant_anchor':r'anchor_turn|assistant_turn|CAPTURE_','dialog_visible':r'DIALOG_VISIBLE','optional_login':r'OPTIONAL_LOGIN|login_popup|login overlay','captcha':r'CAPTCHA|geetest','explicit_queue':r'EXPLICIT_LISTING_QUEUE|explicit listing queue','sequential':r'SEQUENTIAL_CARD|sequential','about_blank':r'about:blank','page_ready':r'PAGE_READY|ready_state|document\.readyState','report_delivery':r'REPORT_|composer|send_attempt','proxy':r'ProxyCore|chrome\.proxy|proxy_manager','rotation0':r'rotation\s*:\s*0|rotate\s*===\s*0','sticky':r'rotation\s*:\s*-1|rotate\s*===\s*-1','rate_limit':r'RATE_LIMIT|Retry-After|429','direct_delivery':r'Купить с доставкой|delivery-item-button-main'}
def gb(path):
 p=subprocess.run(['git','show',f'{COMMIT}:{path}'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if p.returncode:raise RuntimeError(path)
 return p.stdout
def sha(b):return hashlib.sha256(b).hexdigest()
def ver(name):
 m=re.search(r'_v(\d+\.\d+\.\d+)',name,re.I);return m.group(1) if m else None
def vk(v):return tuple(map(int,v.split('.'))) if v else (999,999,999)
def safe_extract_bytes(data,dst):
 ztmp=dst.parent/(dst.name+'.zip');ztmp.write_bytes(data);dst=dst.resolve();dst.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(ztmp) as z:
  for i in z.infolist():
   p=(dst/i.filename).resolve()
   if dst not in p.parents and p!=dst:raise RuntimeError('unsafe '+i.filename)
  z.extractall(dst)
 ztmp.unlink()
def find_roots(root):
 out=[]
 for m in root.rglob('manifest.json'):
  try:o=json.loads(m.read_text(encoding='utf-8-sig'))
  except:continue
  text=(str(o.get('name',''))+' '+' '.join(map(str,o.get('host_permissions',[])))+' '+str(m)).lower()
  if 'avito' in text or 'авито' in text:out.append((m.parent,o))
 return out
def rsummary(r,o):
 files={};bundle=b'';texts=[]
 for n in RUNTIME:
  p=r/n
  if p.exists():
   b=p.read_bytes();files[n]={'bytes':len(b),'sha256':sha(b)};bundle+=n.encode()+b'\0'+b+b'\0';texts.append(b.decode('utf-8','replace'))
 tests=[]
 for p in r.rglob('*'):
  if p.is_file() and ('tests' in p.parts or p.name.endswith('.test.js')): tests.append(str(p.relative_to(r)))
 alltext='\n'.join(texts);markers={k:bool(re.search(rx,alltext,re.I|re.S)) for k,rx in PATS.items()}
 return {'root':str(r),'manifest_version':o.get('version'),'version_name':o.get('version_name'),'runtime_files':files,'runtime_bundle_sha256':sha(bundle),'tests':sorted(tests),'test_count':len(tests),'markers':markers,'texts':{n:(r/n).read_text(encoding='utf-8',errors='replace') for n in RUNTIME if (r/n).exists()}}
# extract History.zip from historical tree
hist=gb('History.zip');hist_sha=sha(hist);tmp=OUT/'_history';tmp.mkdir(exist_ok=True);hz=OUT/'History.zip';hz.write_bytes(hist)
with zipfile.ZipFile(hz) as z:z.extractall(tmp)
archives=[]
for p in sorted(tmp.rglob('*.zip')):
 name=p.name
 if not name.startswith('AVITO_FINDER_') or 'FUNCTIONAL_SPEC' in name:continue
 data=p.read_bytes(); v=ver(name); rec={'archive':name,'path':str(p.relative_to(tmp)),'version_from_filename':v,'archive_bytes':len(data),'archive_sha256':sha(data),'status':'NO_MANIFEST_FOUND','candidates':[]}
 d=OUT/'extract'/re.sub(r'[^A-Za-z0-9_.-]+','_',name[:-4])
 try:
  safe_extract_bytes(data,d)
  roots=find_roots(d)
  if roots:
   rec['status']='EXACT_ARCHIVE_SOURCE';
   for r,o in roots:
    s=rsummary(r,o);s['root']=str(r.relative_to(d)) if r!=d else '.';rec['candidates'].append(s)
  else:rec['status']='EXTRACTED_NO_AVITO_MANIFEST'
 except Exception as e:rec['status']='EXTRACTION_FAILED';rec['error']=str(e)
 archives.append(rec)
# same-version variants and ordered semver groups
byv={}
for r in archives:byv.setdefault(r['version_from_filename'] or 'UNKNOWN',[]).append(r)
variants=[]
for v,rows in sorted(byv.items(),key=lambda kv:vk(kv[0]) if kv[0]!='UNKNOWN' else (999,999,999)):
 fps=[]
 for r in rows:
  for c in r['candidates']:fps.append({'archive':r['archive'],'runtime_bundle_sha256':c['runtime_bundle_sha256'],'manifest_version':c['manifest_version']})
 variants.append({'version':v,'archive_count':len(rows),'archives':[r['archive'] for r in rows],'runtime_fingerprints':fps,'distinct_runtime_fingerprints':sorted(set(x['runtime_bundle_sha256'] for x in fps))})
# representative adjacent diffs only when a version has exactly one runtime fingerprint; same-version ambiguity stays explicit.
representatives={}
for v,rows in byv.items():
 cands=[(r,c) for r in rows for c in r['candidates']]
 fps=set(c['runtime_bundle_sha256'] for _,c in cands)
 if len(fps)==1 and cands:representatives[v]=cands[0]
adj=[]
vers=sorted([v for v in representatives if v!='UNKNOWN'],key=vk)
for a,b in zip(vers,vers[1:]):
 ra,ca=representatives[a];rb,cb=representatives[b];out=[];stats=[]
 for n in sorted(set(ca['texts'])|set(cb['texts'])):
  aa=ca['texts'].get(n,'').splitlines(True);bb=cb['texts'].get(n,'').splitlines(True)
  if aa==bb:continue
  dd=list(difflib.unified_diff(aa,bb,fromfile=f'v{a}/{n}',tofile=f'v{b}/{n}',n=3));out+=dd+['\n'];stats.append({'file':n,'added':sum(x.startswith('+') and not x.startswith('+++') for x in dd),'deleted':sum(x.startswith('-') and not x.startswith('---') for x in dd)})
 text=''.join(out);fn=f'v{a}_to_v{b}.patch';(OUT/'diffs'/fn).write_text(text,encoding='utf-8');adj.append({'from':a,'to':b,'diff_file':'diffs/'+fn,'sha256':sha(text.encode()),'stats':stats})
# remove embedded full texts from JSON
for r in archives:
 for c in r['candidates']:c.pop('texts',None)
result={'historical_commit':COMMIT,'history_zip_sha256':hist_sha,'archive_count':len(archives),'archives':archives,'version_variants':variants,'unambiguous_adjacent_diffs':adj}
(OUT/'NESTED_HISTORY.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
summary={'archive_count':len(archives),'versions':sorted([v for v in byv if v!='UNKNOWN'],key=vk),'version_count':len([v for v in byv if v!='UNKNOWN']),'ambiguous_versions':[x['version'] for x in variants if len(x['distinct_runtime_fingerprints'])>1],'no_manifest':[r['archive'] for r in archives if r['status']!='EXACT_ARCHIVE_SOURCE'],'adjacent_diff_count':len(adj)}
(OUT/'SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
lines=['# Nested historical archive audit','',f"History.zip SHA-256 `{hist_sha}`; archives {len(archives)}; versions {summary['version_count']}",'','| archive | version | status | manifest | runtime files | tests | Writing Block | dialog | login | CAPTCHA | queue | blank | proxy |','|---|---|---|---|---:|---:|---|---|---|---|---|---|---|']
for r in archives:
 c=r['candidates'][0] if r['candidates'] else None;m=c['markers'] if c else {}
 lines.append(f"| `{r['archive']}` | {r['version_from_filename'] or ''} | {r['status']} | {c['manifest_version'] if c else ''} | {len(c['runtime_files']) if c else 0} | {c['test_count'] if c else 0} | {m.get('writing_block','')} | {m.get('dialog_visible','')} | {m.get('optional_login','')} | {m.get('captcha','')} | {m.get('explicit_queue','')} | {m.get('about_blank','')} | {m.get('proxy','')} |")
(OUT/'NESTED_HISTORY.md').write_text('\n'.join(lines)+'\n',encoding='utf-8');print(json.dumps(summary,ensure_ascii=False))
