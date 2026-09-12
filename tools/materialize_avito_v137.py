#!/usr/bin/env python3
import argparse, hashlib, io, json, shutil, subprocess, zipfile
from pathlib import Path

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def replace_once(path, old, new):
    p=Path(path); s=p.read_text(); assert s.count(old)==1,(p,old,s.count(old)); p.write_text(s.replace(old,new,1))

def write_json(path,obj): Path(path).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('base',type=Path);ap.add_argument('out',type=Path);ap.add_argument('zip',type=Path);a=ap.parse_args()
    base=a.base.resolve(); out=a.out.resolve(); zpath=a.zip.resolve()
    assert json.loads((base/'manifest.json').read_text())['version']=='1.0.36'
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(base,out)
    replace_once(out/'manifest.json','"version": "1.0.36"','"version": "1.0.37"')
    replace_once(out/'manifest.json','"version_name": "1.0.36-packaged-adapter-consistency"','"version_name": "1.0.37-first-ipblock-provider-rotation"')
    replace_once(out/'avito_content.js','const ADAPTER_VERSION = "1.0.36";','const ADAPTER_VERSION = "1.0.37";')
    replace_once(out/'service_worker.js','if(record.attempt>=2 && profile.rotation_settings?.rotate_can_change===true && profile.rotation_settings?.change_ip_link) {','if(record.attempt>=1 && profile.rotation_settings?.rotate_can_change===true && profile.rotation_settings?.change_ip_link) {')
    (out/'README.md').write_text('''# Avito Finder v1.0.37 — first IP-block provider rotation\n\nОснова: exact опубликованный v1.0.36 R2. Runtime-изменение ограничено порядком IP-block recovery: если текущая страница является чистым `AVITO_IP_BLOCK` и выбранный Proxy.Market профиль предоставляет безопасный `change_ip_link`, provider-ротация выполняется уже на первой bounded recovery-попытке до запроса свежего документа Avito.\n\nПричина: v1.0.36 откладывал `forceChangeIpByLink` до попытки 2. В живом сценарии первый retry мог получить страницу `IP block + CAPTCHA`; после появления CAPTCHA ручная граница правильно останавливала дальнейшее автоматическое recovery, то есть сильная ротация могла не получить шанс до CAPTCHA.\n\nCAPTCHA-контракт не ослаблен: если CAPTCHA уже видима, Finder не меняет IP рди её обохода и возвращает ручную границу. Queue/cursor/navigation/report/capture/proxy scope не менялись.\n\nСтатус до пользовательского установленного E2E: `CANDIDATE / LIVE_UNVERIFIED`.\n''')
    replace_once(out/'tests/ip_block_ui_plan_recovery_v124.test.js','test("v1.0.36 is the unified recovery build", () => {\n  assert.equal(manifest.version, "1.0.36");','test("v1.0.37 is the first-IP-block provider-rotation build", () => {\n  assert.equal(manifest.version, "1.0.37");')
    replace_once(out/'tests/ip_block_verified_egress_v123.test.js','test("v1.0.36 retains bounded diagnostic host permissions without all-URL access", () => {\n  assert.equal(manifest.version, "1.0.36");','test("v1.0.37 retains bounded diagnostic host permissions without all-URL access", () => {\n  assert.equal(manifest.version, "1.0.37");')
    replace_once(out/'tests/traffic_lite_zero_media.test.js','test("v1.0.36 preserves zero-media Traffic Lite alongside unified recovery", () => {\n  assert.equal(manifest.version, "1.0.36");','test("v1.0.37 preserves zero-media Traffic Lite alongside first-IP-block rotation", () => {\n  assert.equal(manifest.version, "1.0.37");')
    replace_once(out/'tests/v135_prompt_form_terminal_gate.test.py','assert \'"version": "1.0.36"\' in manifest\nprint(\'v1.0.36 prompt form terminal gate PASS\')','assert \'"version": "1.0.37"\' in manifest\nprint(\'v1.0.37 prompt form terminal gate PASS\')')
    (out/'tests/ip_block_first_attempt_rotation_v137.test.js').write_text('''\'use strict\';\nconst assert=require(\'node:assert/strict\');\nconst test=require(\'node:test\');\nconst {loadWorker}=require(\'./helpers/worker_vm.cjs\');\n\ntest(\'pure IP block rotates a rotatable provider endpoint on the first bounded recovery before fresh Avito request\', async t => {\n  const timeline=[];\n  const w=loadWorker({\n    fetch: async (url, options={}) => {\n      const u=String(url);\n      if (u === \'https://rotate.proxy.market/change/abc\') {\n        timeline.push(\'provider-change\');\n        return {ok:true,status:204,discard(){}};\n      }\n      if (u.includes(\'api.ipify.org\')) {\n        timeline.push(\'egress-probe\');\n        return {ok:true,status:200,json:async()=>({ip:\'185.42.12.34\'}),text:async()=>\'{}\'};\n      }\n      throw new Error(\'UNEXPECTED_FETCH:\'+u);\n    },\n    onReload: () => timeline.push(\'avito-reload\')\n  });\n  t.after(()=>w.dispose());\n  let state=await w.seed();\n  const profile=w.P.normalizeProxyMarketRecord({\n    id:123,ip:\'pool.proxy.market\',http_port:10000,login:\'fixture-user\',password:\'fixture-password\',country:\'ru\',package_id:68507,\n    rotation_settings:{rotate:0,rotate_can_change:true,change_ip_link:\'https://rotate.proxy.market/change/abc\'}\n  });\n  await w.h.savePersistedProxyProfiles([profile]);\n  await w.h.saveProxySecret({profiles:[profile],active_profile_id:profile.id,api_key:\'\',package_id:68507});\n  await w.h.saveProxyRuntime({mode:\'proxy\',profiles:[w.P.profileSummary(profile)],selected_profile_id:profile.id,data_saver_enabled:true});\n  state=await w.h.getState();\n  await w.h.recoverAvitoIpBlockAndReload(state,w.tabs.get(7),1,\'live_ip_block_first_attempt\');\n  assert.equal(timeline.filter(x=>x===\'provider-change\').length,1,timeline.join(\',\'));\n  assert.ok(timeline.indexOf(\'provider-change\')>=0 && timeline.indexOf(\'provider-change\')<timeline.indexOf(\'avito-reload\'),timeline.join(\',\'));\n  assert.equal(w.calls.filter(x=>x[0]===\'reload\').length,1);\n});\n''')
    origin={
      'version':'1.0.37','source_version':'1.0.36 R2','source_archive_sha256':'c703c9875687d69b2d2ab5e265268cb5fd9ef44d86a95c305a6ae24e4589104c','live_red_task':'af-20260912140042-p4kl','runtime_changed':['manifest.json','avito_content.js','service_worker.js'],
      'runtime_hashes':{},'captcha_policy':'UNCHANGED_MANUAL_BOUNDARY','live_acceptance':'NOT_RUN'}
    tracked=['manifest.json','avito_content.js','service_worker.js','core.js','proxy_manager.js','recovery.js','popup.js','popup.html','popup.css','chatgpt_content.js']
    for n in tracked: origin['runtime_hashes'][n]={'before':sha(base/n),'after':sha(out/n)}
    write_json(out/'BUILD_ORIGIN_v1.0.37.json',origin)
    write_json(out/'QA_HARNESS_REVISION_v1.0.37_R2.json',{
      'version':'1.0.37','revision':'R2','runtime_changed_from_R1':[],
      'reason':'First packaged candidate failed three Node version assertions and would later fail one Python version assertion because tests still hard-coded 1.0.36. Runtime behavior was not changed for R2.',
      'test_files_changed':['tests/ip_block_ui_plan_recovery_v124.test.js','tests/ip_block_verified_egress_v123.test.js','tests/traffic_lite_zero_media.test.js','tests/v135_prompt_form_terminal_gate.test.py'],
      'old_candidate_sha256':'7c142783270f838b034cb13bf447b36fb1522efad5c3efb14276fca44ef46393','old_candidate_status':'REJECTED_TEST_METADATA_ASSERTIONS','node_after_fix':'PASS','live_acceptance':'NOT_RUN'})
    write_json(out/'QA_HARNESS_REVISION_v1.0.37_R3.json',{
      'version':'1.0.37','revision':'R3','runtime_changed_from_R2':[],
      'reason':'R2 final ZIP passed 35/35 runtime QA, but pre-publication source audit found SHA256SUMS.txt inherited from v1.0.36: 8 modified files had stale hashes and 3 new files were missing. R3 changes only source integrity metadata and adds this revision receipt.',
      'r2_archive_sha256':'b9c1717fdca16d1a1f3e39681128e4556aaed27b4b83b7c2c7e55ba54b65ba75','r2_qa':'35_PASS_0_FAIL_BUT_REJECTED_STALE_SHA256SUMS','runtime_acceptance':'UNCHANGED_FROM_R2','installed_live_acceptance':'NOT_RUN'})
    # exhaustive checksum manifest, excluding itself
    fs=sorted(p for p in out.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt' and '__pycache__' not in p.parts)
    (out/'SHA256SUMS.txt').write_text(''.join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(out)}\n" for p in fs))
    # verify expected exact source hashes from known R3 build where meaningful
    for line in (out/'SHA256SUMS.txt').read_text().splitlines():
      h,n=line.split('  ',1); assert sha(out/n)==h,n
    for p in sorted(out.glob('*.js')): subprocess.run(['node','--check',str(p)],check=True,stdout=subprocess.DEVNULL)
    # package with the exact R3 deterministic format (Python zlib level 6)
    files={str(p.relative_to(out)):p.read_bytes() for p in sorted(out.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}
    b=io.BytesIO()
    with zipfile.ZipFile(b,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
      for name,body in files.items():
        i=zipfile.ZipInfo('v137_work/'+name,date_time=(2026,9,12,0,0,0));i.create_system=3;i.external_attr=0o100644<<16;i.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(i,body,compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
    data=b.getvalue(); zpath.parent.mkdir(parents=True,exist_ok=True); zpath.write_bytes(data)
    digest=hashlib.sha256(data).hexdigest(); assert digest=='e497a543c04bc377423c85e3038ddca87c681e831c16d5cc8a07268cb92b3425',(len(data),digest)
    assert len(data)==486063 and len(files)==145
    with zipfile.ZipFile(io.ByteIO(data)) as z:
      assert z.testzip() is None
      for name,body in files.items(): assert z.read('v137_work/'+name)==body,name
    print(json.dumps({'version':'1.0.37','revision':'R3','sha256':digest,'bytes':len(data),'files':len(files),'sha256sums':'PASS','roundtrip':'PASS'}))
if __name__=='__main__': main()
