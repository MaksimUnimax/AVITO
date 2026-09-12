"""Create a reproducible installable ZIP and verify every round-tripped byte."""
import hashlib, io, json, subprocess, sys, zipfile
from pathlib import Path
root=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve()
assert json.loads((root/'manifest.json').read_text())['version']=='1.0.36'
for p in sorted(root.glob('*.js')):subprocess.run(['node','--check',str(p)],check=True)
for line in (root/'SHA256SUMS.txt').read_text().splitlines():
    h,n=line.split('  ',1);assert hashlib.sha256((root/n).read_bytes()).hexdigest()==h,n
files={str(p.relative_to(root)):p.read_bytes() for p in sorted(root.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}
b=io.BytesIO()
with zipfile.ZipFile(b,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name,body in files.items():
        i=zipfile.ZipInfo('v136_work/'+name,date_time=(2026,9,12,0,0,0));i.create_system=3;i.external_attr=0o100644<<16;i.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(i,body,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
data=b.getvalue()
with zipfile.ZipFile(io.BytesIO(data)) as z:
    assert z.testzip() is None
    assert set(z.namelist())=={'v136_work/'+x for x in files}
    for name,body in files.items():assert z.read('v136_work/'+name)==body,name
out.parent.mkdir(parents=True,exist_ok=True)
if out.exists():assert out.read_bytes()==data,'Refuse to overwrite different bytes under the same build filename'
else:out.write_bytes(data)
report={'version':'1.0.36','archive':out.name,'archive_sha256':hashlib.sha256(data).hexdigest(),'archive_bytes':len(data),'source_files':len(files),'source_hashes':{k:hashlib.sha256(v).hexdigest() for k,v in files.items()},'crc':'PASS','roundtrip_bytes':'PASS','runtime_syntax':'PASS','installed_live_acceptance':'NOT_RUN'}
(out.parent/'BUILD_v1.0.36.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='source_hashes'}))
