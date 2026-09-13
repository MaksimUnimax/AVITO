#!/usr/bin/env python3
import hashlib, json, shutil, sys
from pathlib import Path

base=Path(sys.argv[1]).resolve(); release=Path(sys.argv[2]).resolve(); target=release/'v138_work'
if target.exists(): shutil.rmtree(target)
shutil.copytree(base,target)
# New regression belongs to the final source tree too.
shutil.copy2(release/'tests'/'sticky_recovery_v138.test.js', target/'tests'/'sticky_recovery_v138.test.js')

sw=target/'service_worker.js'; s=sw.read_text(encoding='utf-8')
old_create="await ProxyCore.createProxyInPackage(request,apiKey,{package_id:packageId,country:profile.country||'ru',rotation:0});"
new_create="await ProxyCore.createProxyInPackage(request,apiKey,{package_id:packageId,country:profile.country||'ru',rotation:-1});"
old_pick="const candidate=profiles.find(p=>!beforeIds.has(String(p.id)) && p.rotation_settings?.rotate===0 && p.package_id===packageId);"
new_pick="const candidate=profiles.find(p=>!beforeIds.has(String(p.id)) && p.rotation_settings?.rotate===-1 && p.package_id===packageId);"
assert s.count(old_create)==1, ('create occurrence',s.count(old_create))
assert s.count(old_pick)==1, ('pick occurrence',s.count(old_pick))
s=s.replace(old_create,new_create).replace(old_pick,new_pick)
sw.write_text(s,encoding='utf-8')

m=target/'manifest.json'; manifest=json.loads(m.read_text(encoding='utf-8'))
assert manifest['version']=='1.0.37'
manifest['version']='1.0.38'; manifest['version_name']='1.0.38-avito-sticky-recovery'
manifest['description']='Avito Finder: bounded visible-UI execution with same-chat reports and sticky residential recovery escalation for Avito; manual CAPTCHA.'
m.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

a=target/'avito_content.js'; x=a.read_text(encoding='utf-8')
assert x.count('const ADAPTER_VERSION = "1.0.37";')==1
a.write_text(x.replace('const ADAPTER_VERSION = "1.0.37";','const ADAPTER_VERSION = "1.0.38";'),encoding='utf-8')

# Release-specific tests keep the same behavioral assertions; update only the
# release literal that intentionally tracks manifest/adapter identity.
version_tests=[
  'tests/v135_prompt_form_terminal_gate.test.py',
  'tests/proxy_recovery_integrity_v137.test.js',
  'tests/traffic_lite_zero_media.test.js',
  'tests/ip_block_ui_plan_recovery_v124.test.js',
  'tests/ip_block_verified_egress_v123.test.js',
]
for rel in version_tests:
    p=target/rel; x=p.read_text(encoding='utf-8')
    assert '1.0.37' in x, rel
    p.write_text(x.replace('1.0.37','1.0.38'),encoding='utf-8')

# This historical regression intentionally described the old recovery policy.
# Keep its safety assertions, but update only the policy it is meant to lock:
# manual creation remains explicit; automatic Avito escalation may create one
# endpoint inside the current package, now sticky (-1) instead of per-request (0).
p=target/'tests'/'proxy_profiles.test.js'; x=p.read_text(encoding='utf-8')
old_title='test("manual endpoint creation remains explicit; automatic recovery may create one rotation=0 endpoint only inside the existing package", () => {'
new_title='test("manual endpoint creation remains explicit; automatic Avito recovery may create one sticky rotation=-1 endpoint only inside the existing package", () => {'
assert x.count(old_title)==1
assert x.count('assert.match(worker, /rotation:\\s*0/);')==1
x=x.replace(old_title,new_title).replace('assert.match(worker, /rotation:\\s*0/);','assert.match(worker, /rotation:\\s*-1/);')
p.write_text(x,encoding='utf-8')

base_files={p.relative_to(base) for p in base.rglob('*') if p.is_file()}
new_files={p.relative_to(target) for p in target.rglob('*') if p.is_file()}
changed=[]
for r in sorted(base_files|new_files):
    bp=base/r; np=target/r
    if not bp.exists() or not np.exists() or bp.read_bytes()!=np.read_bytes(): changed.append(str(r))
prod=[r for r in changed if not r.startswith('tests/')]
# Metadata below is created after this assertion, so executable production diff stays exact.
assert prod==['avito_content.js','manifest.json','service_worker.js'], prod
for f in ['chatgpt_content.js','core.js','proxy_manager.js','recovery.js','popup.js','popup.html','popup.css']:
    assert (base/f).read_bytes()==(target/f).read_bytes(),f

origin={
 'version':'1.0.38','date':'2026-09-13','base_version':'1.0.37',
 'base_archive_sha256':'4eaf64038ffd6c5b08ed7d97fdb0d13848edd8a7a9db04ad928f74b1f371ac9d',
 'runtime_changed':prod,
 'runtime_unchanged':['chatgpt_content.js','core.js','proxy_manager.js','recovery.js','popup.js','popup.html','popup.css'],
 'root_cause':'Avito recovery-created residential endpoint hardcoded rotation=0 (every request); a multi-request Avito document/session can therefore traverse changing pool IPs after an IP-block recovery.',
 'recovery_created_rotation':-1,
 'api_key_storage_contract':'session-scoped unchanged',
 'navigation_queue_cursor_changed':False,'captcha_automation_added':False,
 'live_provider_calls_during_patch':0,'installed_live_acceptance':'NOT_RUN'
}
(target/'BUILD_ORIGIN_v1.0.38.json').write_text(json.dumps(origin,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(target/'README.md').write_text('# Avito Finder v1.0.38\n\nMinimal patch over exact v1.0.37. Avito recovery endpoint creation requests Proxy.Market sticky rotation (-1) instead of every-request rotation (0), and reconciliation accepts only the sticky endpoint. Queue/navigation/capture/proxy manager are unchanged. API key remains session-scoped. CAPTCHA remains manual.\n',encoding='utf-8')
H=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for p in sorted(target.rglob('*')):
    if not p.is_file() or '__pycache__' in p.parts: continue
    rel=str(p.relative_to(target))
    if rel=='SHA256SUMS.txt': continue
    rows.append(f'{H(p)}  {rel}')
(target/'SHA256SUMS.txt').write_text('\n'.join(rows)+'\n',encoding='utf-8')
(release/'MATERIALIZATION.json').write_text(json.dumps({'production_runtime_changed':prod,'changed_before_metadata':changed,'status':'PASS'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'runtime_changed':prod,'source_files':sum(1 for p in target.rglob('*') if p.is_file() and '__pycache__' not in p.parts)},ensure_ascii=False))
