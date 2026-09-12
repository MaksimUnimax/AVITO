"""Build v1.0.36 from the byte-verified v1.0.35 archive; no provider calls.
Only runtime changes: manifest version/name and Avito ADAPTER_VERSION literal.
"""
import argparse, difflib, hashlib, json, shutil, zipfile
from pathlib import Path, PurePosixPath
VERSION='1.0.36'
NAME='1.0.36-packaged-adapter-consistency'
BASE_SHA='3a1de9f67af1554038193adb9bf6a63f0e7ca5ef7c26690236e2fd57a287abd3'
RUNTIME=['manifest.json','avito_content.js','chatgpt_content.js','service_worker.js','core.js','proxy_manager.js','recovery.js','popup.js','popup.html','popup.css']

def main():
 p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('target',type=Path);a=p.parse_args()
 assert hashlib.sha256(a.archive.read_bytes()).hexdigest()==BASE_SHA,'Wrong source archive'
 assert not a.target.exists(),'Refuse to overwrite a candidate; use a new empty work directory'
 with zipfile.ZipFile(a.archive) as z:
  assert z.testzip() is None
  for i in z.infolist():
   rel=PurePosixPath(i.filename);assert not rel.is_absolute() and '..' not in rel.parts and rel.parts[0]=='v135_work'
   if i.is_dir() or '__pycache__' in rel.parts:continue
   dest=a.target.joinpath(*rel.parts[1:]);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(i))
 original={n:(a.target/n).read_bytes() for n in RUNTIME}
 def replace(path,old,new,count=None):
  f=a.target/path;s=f.read_text();n=s.count(old)
  assert n>0 and (count is None or n==count),(path,old,n)
  f.write_text(s.replace(old,new))
 replace('manifest.json','"version": "1.0.35"','"version": "1.0.36"',1)
 replace('manifest.json','1.0.35-assistant-form-terminal-gate',NAME,1)
 replace('avito_content.js','const ADAPTER_VERSION = "1.0.34";','const ADAPTER_VERSION = "1.0.36";',1)
 # A literal records the code version, unlike runtime.getManifest() in a stale content script.
 # Correct test expectations without weakening the production worker gate.
 for t in ['tests/ip_block_verified_egress_v123.test.js','tests/ip_block_ui_plan_recovery_v124.test.js','tests/traffic_lite_zero_media.test.js','tests/v135_prompt_form_terminal_gate.test.py']:
  replace(t,'1.0.35',VERSION)
 for t in ['tests/browser_fixtures_v125.py','tests/browser_extension_integration_v125.py']:
  replace(t,"ROOT = Path(__file__).resolve().parents[1]","ROOT = Path(__file__).resolve().parents[1]\nEXPECTED_VERSION = json.loads((ROOT/'manifest.json').read_text())['version']",1)
  replace(t,"=='1.0.34'","==EXPECTED_VERSION",1)
  replace(t,"=='1.0.35'","==EXPECTED_VERSION",1)
  replace(t,"'extension_version':'1.0.35'","'extension_version':EXPECTED_VERSION",1)
 replace('tests/helpers/worker_vm.cjs',"version:JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json'))).version","version:fs.readFileSync(path.join(ROOT,'avito_content.js'),'utf8').match(/const ADAPTER_VERSION = \"([^\"]+)\"/)[1]",1)
 # Browser cross-component bus must also expose this package's manifest, not a stale constant.
 replace('tests/browser_cycle_v127.py',"await p.evaluate(SHIM,tid)","await p.evaluate(SHIM,tid);await p.evaluate('m=>chrome.runtime.getManifest=()=>m',json.loads((ROOT/'manifest.json').read_text()))",1)
 toolroot=Path(__file__).resolve().parent
 for src,dest in [('check_packaged_adapter_v136.py','tests/check_packaged_adapter_v136.py'),('packaged_version_contract_v136.test.js','tests/packaged_version_contract_v136.test.js'),('run_avito_release_qa_v136.py','tests/run_all_v136.py')]:
  shutil.copyfile(toolroot/src,a.target/dest)
 (a.target/'README.md').write_text('''# Avito Finder v1.0.36 — согласованность версий сборки

Корректирующий кандидат от exact v1.0.35. Исправлено рассогласование: manifest и настоящий Avito adapter теперь имеют версию 1.0.36. Строгая защита worker сохранена; старый content script по-прежнему распознаётся как старый.

Writing Block остаётся единственной исполняемой assistant-командой. Обычный Markdown/code block не исполняется. Terminal form error и вся логика capture, очереди, вкладок, cursor, proxy и доставки отчётов не изменены относительно v1.0.35.

Статус: CANDIDATE / LIVE_UNVERIFIED. Сборка не считается прошедшей пользовательский Chrome E2E. Файлы QA_v1.0.35.json, PATCH_REPORT_v1.0.35_RU.md, docs/*v1.0.3[1-5]* и qa/v131, qa/v134 являются ИСТОРИЕЙ, не результатом тестов v1.0.36. Актуальная проверка хранится отдельно в QA_v1.0.36/.

## Установка для приёмки

Сохраните прежнюю папку расширения. Содержимое v136_work поместите в ту же папку распакованного расширения. В chrome://extensions нажмите «Обновить» у существующего Avito Finder, затем обновите вкладку текущего чата и рабочую вкладку Avito. Не удаляйте расширение и не очищайте его хранилище: это сохраняет очередь, настройки и baseline.

## Локальная регрессия

Python + Playwright + Chromium + Node.js. Выполните `python tests/run_all_v136.py`; выходной каталог задаётся AF_QA_OUTPUT. Запускаются старые сценарии и проверка настоящего adapter PING. Тесты не обращаются к живым сайтам. Установленный Chrome — отдельная приёмка.
''')
 hashes={n:{'before':hashlib.sha256(original[n]).hexdigest(),'after':hashlib.sha256((a.target/n).read_bytes()).hexdigest()} for n in RUNTIME}
 changed=[n for n,r in hashes.items() if r['before']!=r['after']]
 assert changed==['manifest.json','avito_content.js'],changed
 (a.target/'BUILD_ORIGIN_v1.0.36.json').write_text(json.dumps({'version':VERSION,'source_archive_sha256':BASE_SHA,'runtime_changed':changed,'runtime_hashes':hashes,'live_acceptance':'NOT_RUN'},indent=2)+'\n')
 diff=''.join(''.join(difflib.unified_diff(original[n].decode().splitlines(True),(a.target/n).read_text().splitlines(True),fromfile='v135_work/'+n,tofile='v136_work/'+n)) for n in changed)
 (a.target/'docs/runtime-v135-to-v136.patch').write_text(diff)
 sums=''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+str(f.relative_to(a.target))+'\n' for f in sorted(a.target.rglob('*')) if f.is_file() and f.name!='SHA256SUMS.txt')
 (a.target/'SHA256SUMS.txt').write_text(sums)
 print(json.dumps({'version':VERSION,'runtime_changed':changed,'source_sha256':BASE_SHA}))
if __name__=='__main__':main()
