#!/usr/bin/env python3
import hashlib, json, shutil, sys
from pathlib import Path

base=Path(sys.argv[1]).resolve(); release=Path(sys.argv[2]).resolve(); target=release/'v139_work'
if target.exists(): shutil.rmtree(target)
shutil.copytree(base,target)

# The live regression test is part of permanent source/test authority.
regression=Path('подбор авито расширение/v139_prepatch_tests/visible_tab_exact_request_disambiguation.test.js').resolve()
shutil.copy2(regression,target/'tests'/'visible_tab_exact_request_disambiguation_v139.test.js')

sw=target/'service_worker.js'; s=sw.read_text(encoding='utf-8')
old_fn='''async function selectVisibleAvitoTab(windowId) {\n  const candidates = (await tabsQuery({ windowId })).filter((tab) => Core.isAvitoUrl(tab.url || ""));\n  const active = candidates.filter((tab) => tab.active);\n  if (active.length === 1) return { tab: active[0], source: "active_avito_tab" };\n  if (candidates.length === 1) return { tab: candidates[0], source: "single_avito_tab" };\n  if (!candidates.length) throw new Error("AVITO_VISIBLE_TAB_REQUIRED_OPEN_ONE_PUBLIC_AVITO_TAB");\n  throw new Error("AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB");\n}\n'''
new_fn='''async function selectVisibleAvitoTab(windowId, requestedUrl = "") {\n  const candidates = (await tabsQuery({ windowId })).filter((tab) => Core.isAvitoUrl(tab.url || ""));\n  const active = candidates.filter((tab) => tab.active);\n  if (active.length === 1) return { tab: active[0], source: "active_avito_tab" };\n  if (requestedUrl) {\n    const exactRequested = candidates.filter((tab) => sameVisibleAvitoRoute(tab.url || "", requestedUrl));\n    if (exactRequested.length === 1) return { tab: exactRequested[0], source: "exact_requested_avito_tab" };\n    if (exactRequested.length > 1) throw new Error("AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB");\n  }\n  if (candidates.length === 1) return { tab: candidates[0], source: "single_avito_tab" };\n  if (!candidates.length) throw new Error("AVITO_VISIBLE_TAB_REQUIRED_OPEN_ONE_PUBLIC_AVITO_TAB");\n  throw new Error("AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB");\n}\n'''
assert s.count(old_fn)==1,('selector occurrence',s.count(old_fn))
s=s.replace(old_fn,new_fn)
old_call='const selected = await selectVisibleAvitoTab(state.current_window_id);'
new_call='const selected = await selectVisibleAvitoTab(state.current_window_id, requestedUrl);'
assert s.count(old_call)==1,('selector call occurrence',s.count(old_call))
s=s.replace(old_call,new_call)
sw.write_text(s,encoding='utf-8')

m=target/'manifest.json'; manifest=json.loads(m.read_text(encoding='utf-8'))
assert manifest['version']=='1.0.38'
manifest['version']='1.0.39'; manifest['version_name']='1.0.39-exact-requested-tab-disambiguation'
manifest['description']='Avito Finder: bounded visible-UI execution with same-chat reports, safe exact-requested-tab disambiguation, sticky residential recovery, and manual CAPTCHA.'
m.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

a=target/'avito_content.js'; x=a.read_text(encoding='utf-8')
assert x.count('const ADAPTER_VERSION = "1.0.38";')==1
a.write_text(x.replace('const ADAPTER_VERSION = "1.0.38";','const ADAPTER_VERSION = "1.0.39";'),encoding='utf-8')

# Release-literal assertions only. Behavioral expectations are not weakened.
version_tests=[
  'tests/v135_prompt_form_terminal_gate.test.py',
  'tests/proxy_recovery_integrity_v137.test.js',
  'tests/traffic_lite_zero_media.test.js',
  'tests/ip_block_ui_plan_recovery_v124.test.js',
  'tests/ip_block_verified_egress_v123.test.js',
]
for rel in version_tests:
    p=target/rel; x=p.read_text(encoding='utf-8')
    assert '1.0.38' in x,rel
    p.write_text(x.replace('1.0.38','1.0.39'),encoding='utf-8')

base_files={p.relative_to(base) for p in base.rglob('*') if p.is_file()}
new_files={p.relative_to(target) for p in target.rglob('*') if p.is_file()}
changed=[]
for r in sorted(base_files|new_files):
    bp=base/r; np=target/r
    if not bp.exists() or not np.exists() or bp.read_bytes()!=np.read_bytes(): changed.append(str(r))
prod=[r for r in changed if not r.startswith('tests/')]
assert prod==['avito_content.js','manifest.json','service_worker.js'],prod
for f in ['chatgpt_content.js','core.js','proxy_manager.js','recovery.js','popup.js','popup.html','popup.css']:
    assert (base/f).read_bytes()==(target/f).read_bytes(),f

origin={
  'version':'1.0.39','date':'2026-09-13','base_version':'1.0.38',
  'base_archive_sha256':'2f1282e2262b322ef5f17a3852a388dd5480363b9fa5a60346f3264084d477f4',
  'runtime_changed':prod,
  'runtime_unchanged':['chatgpt_content.js','core.js','proxy_manager.js','recovery.js','popup.js','popup.html','popup.css'],
  'root_cause':'selectVisibleAvitoTab ignored the already-known requestedUrl. With ChatGPT active and multiple Avito tabs, it threw AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB even when exactly one existing Avito tab already matched the exact requested public route.',
  'safe_selection_contract':{
    'active_avito_priority_preserved':True,
    'unique_exact_requested_route_selected':True,
    'zero_exact_matches_with_multiple_tabs':'AMBIGUOUS',
    'duplicate_exact_matches':'AMBIGUOUS',
    'single_avito_tab_behavior_preserved':True,
    'navigation_for_disambiguation':False
  },
  'queue_cursor_changed':False,'target_navigation_dispatch_changed':False,
  'proxy_recovery_changed':False,'captcha_automation_added':False,
  'live_failure_task':'af-20260913062414-29ps',
  'rule20_authority':'PRE_PATCH_FULL_HISTORY_AUDIT_2026-09-13.md/json PASS',
  'live_provider_calls_during_patch':0,'installed_live_acceptance':'NOT_RUN'
}
(target/'BUILD_ORIGIN_v1.0.39.json').write_text(json.dumps(origin,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(target/'README.md').write_text('# Avito Finder v1.0.39\n\nMinimal patch over exact v1.0.38. If several Avito tabs exist and none is the active browser tab, Finder may bind only when exactly one existing tab already matches the command\'s normalized requested public Avito route. Zero or duplicate exact matches remain terminal ambiguity. No tab is navigated merely to resolve ambiguity. Queue/cursor, proxy/recovery, capture/report and CAPTCHA boundaries are unchanged.\n',encoding='utf-8')
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for p in sorted(target.rglob('*')):
    if not p.is_file() or '__pycache__' in p.parts: continue
    rel=str(p.relative_to(target))
    if rel=='SHA256SUMS.txt': continue
    rows.append(f'{H(p)}  {rel}')
(target/'SHA256SUMS.txt').write_text('\n'.join(rows)+'\n',encoding='utf-8')
(release/'MATERIALIZATION.json').write_text(json.dumps({'production_runtime_changed':prod,'changed_before_metadata':changed,'status':'PASS'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'runtime_changed':prod,'changed_tests':[x for x in changed if x.startswith('tests/')],'source_files':sum(1 for p in target.rglob('*') if p.is_file() and '__pycache__' not in p.parts)},ensure_ascii=False))
