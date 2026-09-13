#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, shutil, sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit('usage: materialize_avito_v141.py BASE_V140 RELEASE_V141')
base=Path(sys.argv[1]).resolve(); release=Path(sys.argv[2]).resolve(); out=release/'v141_work'
manifest0=json.loads((base/'manifest.json').read_text())
if manifest0['version']!='1.0.40':
    raise SystemExit('BASE_MUST_BE_EXACT_V140')
if out.exists(): shutil.rmtree(out)
shutil.copytree(base,out)

core=out/'core.js'; s=core.read_text()
old="""    const bodyText=texts.join('\\n');
    const captcha = roots.some(el=>el.tagName==='IFRAME' && /captcha/i.test(el.getAttribute('src')||'')) || /captcha|капч|(?:провер|подтверд)[^\\n]{0,40}(?:робот|человек)/i.test(bodyText);
    const rate_limit = /too\\s+many\\s+requests|слишком\\s+много\\s+запросов|превышен[^\\n]{0,40}лимит|временно[^\\n]{0,40}(?:ограничен|недоступен)[^\\n]{0,40}(?:запрос|доступ)/i.test(bodyText);
    const ip_block = /Доступ ограничен:\\s*проблема с IP/i.test(bodyText);
    return {href:String(location.href||''),title:String(document.title||''),ready_state:document.readyState,body_present:Boolean(document.body),time_origin:Number(globalThis.performance?.timeOrigin||0),ip_block,rate_limit,captcha,normal_avito:surface&&!captcha&&!rate_limit&&!ip_block};
"""
new="""    const bodyText=texts.join('\\n');
    // The IP firewall landing page can mention that pressing “Продолжить” will lead
    // to a CAPTCHA later. That hint is not itself a visible CAPTCHA challenge.
    // Keep the strong provider IP heading authoritative over generic explanatory
    // text, while preserving a manual CAPTCHA gate when concrete challenge evidence
    // (iframe/canvas/slider/Geetest widget or human/robot verification wording) is visible.
    const ip_block = /Доступ ограничен:\\s*проблема с IP/i.test(bodyText);
    const captcha_structural = roots.some(el=>el.tagName==='IFRAME' && /captcha/i.test(el.getAttribute('src')||'')) ||
      Array.from(document.querySelectorAll("iframe[src*='captcha'],#geetest_captcha iframe,#geetest_captcha canvas,#geetest_captcha [role='slider'],#geetest_captcha [class*='geetest_'],[data-marker*='captcha'] iframe,[data-marker*='captcha'] canvas")).some(rendered);
    const captcha_human_check = /(?:провер|подтверд)[^\\n]{0,40}(?:робот|человек)|(?:я\\s+не\\s+робот)|(?:verify|confirm)[^\\n]{0,40}(?:human|robot)/i.test(bodyText);
    const captcha_name_mention = /captcha|капч/i.test(bodyText);
    const captcha = captcha_structural || captcha_human_check || (!ip_block && captcha_name_mention);
    const rate_limit_text = /too\\s+many\\s+requests|слишком\\s+много\\s+запросов|превышен[^\\n]{0,40}лимит|временно[^\\n]{0,40}(?:ограничен|недоступен)[^\\n]{0,40}(?:запрос|доступ)/i.test(bodyText);
    const rate_limit = !ip_block && rate_limit_text;
    return {href:String(location.href||''),title:String(document.title||''),ready_state:document.readyState,body_present:Boolean(document.body),time_origin:Number(globalThis.performance?.timeOrigin||0),ip_block,rate_limit,captcha,normal_avito:surface&&!captcha&&!rate_limit&&!ip_block};
"""
if s.count(old)!=1: raise SystemExit('V140_INTERRUPTION_PROBE_PATTERN_MISMATCH')
core.write_text(s.replace(old,new,1))

manifest=json.loads((out/'manifest.json').read_text())
manifest['version']='1.0.41'
manifest['version_name']='1.0.41-ip-block-firewall-classifier-recovery'
manifest['description']='Avito Finder: bounded visible-UI execution with exact IP-firewall classification, bounded reload recovery, dedicated requested-tab allocation, sticky residential recovery, and manual CAPTCHA.'
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

av=out/'avito_content.js'; t=av.read_text()
if t.count('const ADAPTER_VERSION = "1.0.40";')!=1: raise SystemExit('ADAPTER_V140_IDENTITY_MISMATCH')
av.write_text(t.replace('const ADAPTER_VERSION = "1.0.40";','const ADAPTER_VERSION = "1.0.41";',1))

for rel in [
 'tests/ip_block_ui_plan_recovery_v124.test.js',
 'tests/ip_block_verified_egress_v123.test.js',
 'tests/proxy_recovery_integrity_v137.test.js',
 'tests/traffic_lite_zero_media.test.js',
 'tests/v135_prompt_form_terminal_gate.test.py'
]:
    p=out/rel; x=p.read_text(); y=x.replace('1.0.40','1.0.41')
    if x==y: raise SystemExit('VERSION_EXPECTATION_NOT_FOUND:'+rel)
    p.write_text(y)

reg=Path('подбор авито расширение/v141_prepatch_tests/ip_block_firewall_classifier_v141.test.js')
shutil.copy2(reg,out/'tests/ip_block_firewall_classifier_v141.test.js')
p=out/'tests/ip_block_firewall_classifier_v141.test.js'; x=p.read_text()
old_arg='const corePath = process.argv[2];\nif (!corePath) throw new Error("usage: node ip_block_firewall_classifier_v141.test.js <core.js>");'
new_arg="const corePath = process.argv[2] || path.resolve(__dirname, '..', 'core.js');"
if old_arg not in x: raise SystemExit('V141_TARGETED_TEST_ARG_PATTERN_MISMATCH')
p.write_text(x.replace(old_arg,new_arg,1))

sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
changed=[]
for p in sorted(out.rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(out); bp=base/rel
    if not bp.exists() or sha(bp)!=sha(p): changed.append(rel.as_posix())
origin={
 'schema':'avito_finder_v141_materialization_v1','version':'1.0.41','base_version':'1.0.40',
 'base_zip_sha256':'04f9bdc205eaa3578d462005ea15749184c5f7e744bd24a19c43e5a88bc1e017',
 'production_runtime_changed':['avito_content.js','core.js','manifest.json'],
 'runtime_behavior_changed':['core.js'],
 'identity_only_changed':['avito_content.js','manifest.json'],
 'service_worker_byte_identical_to_v140': sha(out/'service_worker.js')==sha(base/'service_worker.js'),
 'proxy_manager_byte_identical_to_v140': sha(out/'proxy_manager.js')==sha(base/'proxy_manager.js'),
 'test_only_changed':[x for x in changed if x.startswith('tests/')],
 'classification_contract':{
   'ip_firewall_future_captcha_hint_is_not_challenge':True,
   'strong_ip_heading_suppresses_generic_rate_limit_overlap':True,
   'structural_or_human_robot_captcha_remains_manual_even_with_ip_heading':True,
   'existing_bounded_ip_recovery_reload_reused_unchanged':True
 },
 'changed_files':changed
}
(out/'BUILD_ORIGIN_v1.0.41.json').write_text(json.dumps(origin,ensure_ascii=False,indent=2)+'\n')
release.mkdir(parents=True,exist_ok=True)
(release/'MATERIALIZATION.json').write_text(json.dumps(origin,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(origin,ensure_ascii=False))
