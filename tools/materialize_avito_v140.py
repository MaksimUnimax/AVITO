#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, shutil, sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit('usage: materialize_avito_v140.py BASE_V139 RELEASE_V140')
base=Path(sys.argv[1]).resolve(); release=Path(sys.argv[2]).resolve(); out=release/'v140_work'
if json.loads((base/'manifest.json').read_text())['version']!='1.0.39':
    raise SystemExit('BASE_MUST_BE_EXACT_V139')
if out.exists(): shutil.rmtree(out)
shutil.copytree(base,out)

sw=out/'service_worker.js'; s=sw.read_text()
old='''  } catch (error) {\n    if (String(error?.message || error) === "AVITO_VISIBLE_TAB_REQUIRED_OPEN_ONE_PUBLIC_AVITO_TAB" && state?.user_started === true && state?.avito_target_bound_once !== true && state.diagnostic_request?.allow_navigation !== false) {\n      const created = await createInitialPublicAvitoTab(state, purpose);\n      const routed = await applyRequestedVisibleAvitoUrl(state, created.tab, requestedUrl, purpose, created.source);\n      return { tab: routed.tab, created: true, navigated: routed.navigated, reload_requested: routed.reload_requested === true, reload_previous_time_origin: routed.reload_previous_time_origin || null, reused: false, source: routed.source, previous_url: routed.previous_url || null, requested_url: routed.requested_url || null };\n    }\n    throw error;\n  }\n}'''
new='''  } catch (error) {\n    const reason = String(error?.message || error);\n    const noVisibleCandidate = reason === "AVITO_VISIBLE_TAB_REQUIRED_OPEN_ONE_PUBLIC_AVITO_TAB";\n    const ambiguousVisibleCandidates = reason === "AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB";\n    const explicitPublicRequest = Boolean(directPublicAvitoUrl(requestedUrl));\n    const mayAllocateFirstRunTab = state?.user_started === true && state?.avito_target_bound_once !== true && state.diagnostic_request?.allow_navigation !== false;\n    if (mayAllocateFirstRunTab && (noVisibleCandidate || (ambiguousVisibleCandidates && explicitPublicRequest))) {\n      const created = await createInitialPublicAvitoTab(state, purpose);\n      const routed = await applyRequestedVisibleAvitoUrl(state, created.tab, requestedUrl, purpose, ambiguousVisibleCandidates ? "dedicated_requested_avito_tab" : created.source);\n      return { tab: routed.tab, created: true, navigated: routed.navigated, reload_requested: routed.reload_requested === true, reload_previous_time_origin: routed.reload_previous_time_origin || null, reused: false, source: routed.source, previous_url: routed.previous_url || null, requested_url: routed.requested_url || null };\n    }\n    throw error;\n  }\n}'''
if s.count(old)!=1: raise SystemExit('ENSURE_AVITO_TARGET_V139_PATTERN_MISMATCH')
sw.write_text(s.replace(old,new,1))

manifest=json.loads((out/'manifest.json').read_text())
manifest['version']='1.0.40'; manifest['version_name']='1.0.40-dedicated-requested-tab-allocation'
manifest['description']='Avito Finder: bounded visible-UI execution with same-chat reports, dedicated requested-tab allocation under safe ambiguity, sticky residential recovery, and manual CAPTCHA.'
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

av=out/'avito_content.js'; t=av.read_text()
if t.count('const ADAPTER_VERSION = "1.0.39";')!=1: raise SystemExit('ADAPTER_V139_IDENTITY_MISMATCH')
av.write_text(t.replace('const ADAPTER_VERSION = "1.0.39";','const ADAPTER_VERSION = "1.0.40";',1))

for rel in [
 'tests/ip_block_ui_plan_recovery_v124.test.js',
 'tests/ip_block_verified_egress_v123.test.js',
 'tests/proxy_recovery_integrity_v137.test.js',
 'tests/traffic_lite_zero_media.test.js',
 'tests/v135_prompt_form_terminal_gate.test.py'
]:
    p=out/rel; x=p.read_text(); y=x.replace('1.0.39','1.0.40')
    if x==y: raise SystemExit('VERSION_EXPECTATION_NOT_FOUND:'+rel)
    p.write_text(y)

reg=Path('подбор авито расширение/v140_prepatch_tests/dedicated_requested_tab_on_ambiguity_v140.test.js')
shutil.copy2(reg,out/'tests/dedicated_requested_tab_on_ambiguity_v140.test.js')
# Aggregate runner invokes Node tests without explicit source; make this permanent regression self-contained.
p=out/'tests/dedicated_requested_tab_on_ambiguity_v140.test.js'; x=p.read_text()
x=x.replace("const sourcePath=process.argv[2];\nif(!sourcePath) throw new Error('SOURCE_PATH_REQUIRED');", "const sourcePath=process.argv[2] || require('path').resolve(__dirname,'..','service_worker.js');")
p.write_text(x)

sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
changed=[]
for p in sorted(out.rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(out)
    bp=base/rel
    if not bp.exists() or sha(bp)!=sha(p): changed.append(rel.as_posix())
origin={
 'schema':'avito_finder_v140_materialization_v1','version':'1.0.40','base_version':'1.0.39',
 'base_zip_sha256':'a4a0ae626de4692c62cd76d87be19e34749b488e76afa2764828a025db08bb98',
 'production_runtime_changed':['avito_content.js','manifest.json','service_worker.js'],
 'test_only_changed':[x for x in changed if x.startswith('tests/')],
 'safe_allocation_contract':{
   'ambiguous_existing_tabs_are_never_guessed':True,
   'explicit_public_requested_url_gets_dedicated_new_tab_on_first_binding':True,
   'diagnostic_navigation_ban_preserved':True,
   'already_bound_run_cannot_allocate_second_target':True
 },
 'changed_files':changed
}
(out/'BUILD_ORIGIN_v1.0.40.json').write_text(json.dumps(origin,ensure_ascii=False,indent=2)+'\n')
release.mkdir(parents=True,exist_ok=True)
(release/'MATERIALIZATION.json').write_text(json.dumps(origin,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(origin,ensure_ascii=False))
