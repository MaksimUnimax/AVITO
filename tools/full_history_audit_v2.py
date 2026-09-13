#!/usr/bin/env python3
import argparse, collections, datetime as dt, difflib, hashlib, json, os, re, subprocess, urllib.request
from pathlib import Path
PREFIX="подбор авито расширение/"
RUNTIME=["manifest.json","service_worker.js","chatgpt_content.js","avito_content.js","core.js","proxy_manager.js","recovery.js","popup.js","popup.html","popup.css"]
VRE=re.compile(r"(?<!\d)(1\.0\.\d+)(?!\d)")
PATTERNS={
 "about_blank":r"about:blank","exact_target":r"tabsCreate\([^\n]{0,500}(?:expectedHref|summary\.href|target|href)",
 "writing_block":r"WRITING_BLOCK|required.*writing|writing[_ -]?block","captcha":r"CAPTCHA_MANUAL_REQUIRED|geetest|manual[_ -]?captcha",
 "explicit_queue":r"EXPLICIT_LISTING_QUEUE","resume_queue":r"RESUME_EXPLICIT_LISTING_QUEUE","report_ack":r"REPORT_ACK|acknowledg",
 "proxy":r"ProxyCore|proxy_manager\.js","rotation0":r"rotation\s*:\s*0|rotate\s*===\s*0|rotate\)\s*===\s*0",
 "sticky":r"rotation\s*:\s*-1|rotate\s*===\s*-1|rotate\)\s*===\s*-1","egress":r"ipify|egress",
 "ip_block":r"IP_BLOCK|recoverAvitoIpBlock|recoverAvitoConnection","rate_limit":r"RATE_LIMIT|Retry-After|429",
 "proxy_auth":r"onAuthRequired|authCredentials|last_auth","pac":r"pac_script|FindProxyForURL|pacScript","provider_create":r"createProxyInPackage|create-proxy"
}
def cmd(args,check=True,binary=False):
 p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=check)
 return p.stdout if binary else p.stdout.decode("utf-8","replace")
def git(*args,check=True,binary=False): return cmd(["git","-c","core.quotepath=false",*args],check,binary)
def f_at(c,p):
 q=subprocess.run(["git","-c","core.quotepath=false","show",f"{c}:{p}"],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 return q.stdout if q.returncode==0 else None
def tree(c): return [x for x in git("ls-tree","-r","--name-only",c,check=False).splitlines() if x]
def meta(c):
 s=git("show","-s","--format=%H%x00%P%x00%aI%x00%s",c).rstrip("\n"); h,p,d,m=s.split("\0",3); return {"sha":h,"parents":p.split() if p else [],"date":d,"subject":m}
def changes(c):
 out=git("diff-tree","--root","--no-commit-id","--name-status","-r",c,check=False); rows=[]
 for ln in out.splitlines():
  ps=ln.split("\t");
  if len(ps)>=2: rows.append({"status":ps[0],"path":ps[-1]})
 return rows
def h(b): return hashlib.sha256(b).hexdigest()
def vk(v): return tuple(map(int,v.split(".")))
def root(p): return str(Path(p).parent).replace("\\","/")
def manifest_obj(raw):
 try:return json.loads(raw.decode("utf-8-sig"))
 except:return None
def avito_manifest(path,obj):
 if not path.startswith(PREFIX) or not isinstance(obj,dict):return False
 name=str(obj.get("name","")).lower(); hosts=" ".join(map(str,obj.get("host_permissions",[]))).lower()
 return "avito" in name or "avito.ru" in hosts or "авито" in path.lower()
def category(p):
 b=Path(p).name; lo=p.lower()
 if b in RUNTIME:return "runtime"
 if "/tests/" in lo or b.endswith(".test.js") or "/qa/" in lo or "test" in b.lower():return "test_qa"
 if lo.startswith(".github/workflows/") or "/.github/workflows/" in lo:return "workflow"
 if lo.endswith((".md",".json",".txt")):return "docs_data"
 if lo.endswith((".py",".sh",".ps1")):return "tooling"
 return "other"
def snap(c,r):
 pref=r.rstrip("/")+"/"; paths=[p for p in tree(c) if p.startswith(pref)]; runtime={}; tests=[]; docs=[]; bundle=b""
 for p in paths:
  rel=p[len(pref):]; b=Path(rel).name; raw=None
  if b in RUNTIME:
   raw=f_at(c,p)
   if raw is not None:runtime[rel]={"sha256":h(raw),"bytes":len(raw)}
  lo=rel.lower()
  if lo.startswith("tests/") or "/tests/" in lo or lo.endswith(".test.js"):
   raw=raw if raw is not None else f_at(c,p)
   if raw is not None:tests.append({"path":rel,"sha256":h(raw),"bytes":len(raw)})
  if lo.startswith("docs/") or lo.endswith(".md"):
   raw=raw if raw is not None else f_at(c,p)
   if raw is not None:docs.append({"path":rel,"sha256":h(raw),"bytes":len(raw)})
 for rel in sorted(runtime):bundle+=rel.encode()+b"\0"+(f_at(c,pref+rel) or b"")+b"\0"
 text=bundle.decode("utf-8","replace"); markers={k:bool(re.search(rx,text,re.I|re.S)) for k,rx in PATTERNS.items()}
 return {"root":r,"runtime":runtime,"tests":tests,"docs":docs,"runtime_bundle_sha256":h(bundle),"markers":markers}
def rtexts(c,r):
 pref=r.rstrip("/")+"/"; out={}
 for n in RUNTIME:
  raw=f_at(c,pref+n)
  if raw is not None:out[n]=raw.decode("utf-8","replace")
 return out
def diff_text(a,b,la,lb):
 out=[]; stats=[]
 for n in sorted(set(a)|set(b)):
  aa=a.get(n,"").splitlines(True); bb=b.get(n,"").splitlines(True)
  if aa==bb:continue
  d=list(difflib.unified_diff(aa,bb,fromfile=f"{la}/{n}",tofile=f"{lb}/{n}",n=3)); out+=d+["\n"]
  stats.append({"file":n,"added":sum(x.startswith("+") and not x.startswith("+++") for x in d),"deleted":sum(x.startswith("-") and not x.startswith("---") for x in d)})
 return "".join(out),stats
def main():
 ap=argparse.ArgumentParser();ap.add_argument("--out",default="audit-output-v2");a=ap.parse_args();od=Path(a.out);(od/"diffs").mkdir(parents=True,exist_ok=True)
 git("fetch","--all","--tags","--prune",check=False)
 commits=git("rev-list","--all","--reverse").splitlines(); metas={c:meta(c) for c in commits}; trees={}; manifest_obs=[]; mentions=collections.defaultdict(list)
 patch_commits=[]
 for i,c in enumerate(commits):
  paths=tree(c);trees[c]=paths
  for p in paths:
   if p.startswith(PREFIX) and p.endswith("manifest.json"):
    raw=f_at(c,p);o=manifest_obj(raw) if raw else None
    if avito_manifest(p,o):
     v=str(o.get("version","")).strip()
     if re.fullmatch(r"\d+\.\d+\.\d+",v):manifest_obs.append({"version":v,"commit":c,"date":metas[c]["date"],"path":p,"root":root(p),"name":o.get("name"),"version_name":o.get("version_name")})
  for v in set(VRE.findall(metas[c]["subject"])):mentions[v].append({"commit":c,"date":metas[c]["date"],"subject":metas[c]["subject"]})
  ch=[x for x in changes(c) if x["path"].startswith(PREFIX) or x["path"] in ("AGENTS.md",)]
  if ch:
   cats=collections.Counter(category(x["path"]) for x in ch)
   if cats["runtime"] or cats["test_qa"] or re.search(r"fix|patch|build|release|test|qa|recovery|proxy|captcha|navigation|queue|report",metas[c]["subject"],re.I):patch_commits.append({**metas[c],"changed":ch,"categories":dict(cats),"versions_mentioned":sorted(set(VRE.findall(metas[c]["subject"])),key=vk)})
 byv=collections.defaultdict(list)
 for o in manifest_obs:byv[o["version"]].append(o)
 versions=sorted(set(byv)|set(mentions),key=vk); rows=[]; snaps={}
 for v in versions:
  obs=sorted(byv.get(v,[]),key=lambda x:x["date"]); chosen=None
  named=[o for o in obs if ("v"+v) in o["root"].lower() or ("extension_v"+v) in o["root"].lower() or ("v"+v.replace(".","")) in o["root"].lower()]
  if named:chosen=named[-1]
  elif obs:chosen=obs[-1]
  row={"version":v,"source_status":"SOURCE_UNAVAILABLE","manifest_observations":obs,"commit_mentions":mentions.get(v,[]),"canonical":None}
  if chosen:
   s=snap(chosen["commit"],chosen["root"]);row["source_status"]="EXACT_HISTORICAL_SOURCE";row["canonical"]={**chosen,**s};snaps[v]=row["canonical"]
  rows.append(row)
 exact=[v for v in versions if v in snaps];adj=[]
 for x,y in zip(exact,exact[1:]):
  sx,sy=snaps[x],snaps[y];d,st=diff_text(rtexts(sx["commit"],sx["root"]),rtexts(sy["commit"],sy["root"]),"v"+x,"v"+y);fn=f"v{x}_to_v{y}.patch";(od/"diffs"/fn).write_text(d,encoding="utf-8");adj.append({"from":x,"to":y,"diff_file":"diffs/"+fn,"diff_sha256":h(d.encode()),"runtime_file_stats":st,"from_commit":sx["commit"],"to_commit":sy["commit"]})
 matrix=[]
 for v in versions:
  s=snaps.get(v)
  if not s:matrix.append({"version":v,"source_status":"SOURCE_UNAVAILABLE"});continue
  matrix.append({"version":v,"source_status":"EXACT_HISTORICAL_SOURCE","commit":s["commit"],"root":s["root"],"runtime_bundle_sha256":s["runtime_bundle_sha256"],"runtime_files":s["runtime"],"test_file_count":len(s["tests"]),**s["markers"]})
 refs=[]
 for ln in git("for-each-ref","--format=%(refname)%00%(objectname)","refs/heads","refs/remotes","refs/tags").splitlines():
  if "\0" in ln:
   rr,ss=ln.split("\0",1);refs.append({"ref":rr,"sha":ss})
 prs=[];tok=os.environ.get("GITHUB_TOKEN")
 if tok:
  req=urllib.request.Request("https://api.github.com/repos/MaksimUnimax/AVITO/pulls?state=all&per_page=100&sort=created&direction=asc",headers={"Authorization":"Bearer "+tok,"Accept":"application/vnd.github+json"})
  try:
   arr=json.load(urllib.request.urlopen(req,timeout=20));prs=[{"number":p["number"],"title":p["title"],"state":p["state"],"merged_at":p.get("merged_at"),"head":p["head"]["ref"],"base":p["base"]["ref"],"created_at":p["created_at"]} for p in arr]
  except Exception as e:prs=[{"error":str(e)}]
 curr=tree("HEAD");arts=[p for p in curr if p.startswith(PREFIX) and (VRE.search(p) or any(k in p.lower() for k in ("patch","audit","release","checkpoint")))]
 raw={"generated_at":dt.datetime.now(dt.timezone.utc).isoformat(),"head":git("rev-parse","HEAD").strip(),"commit_count":len(commits),"refs":refs,"versions":rows,"adjacent_diffs":adj,"patch_commits":patch_commits,"critical_matrix":matrix,"current_artifacts":arts,"pull_requests":prs}
 (od/"FULL_HISTORY_RAW.json").write_text(json.dumps(raw,ensure_ascii=False,indent=2),encoding="utf-8")
 summary={"head":raw["head"],"commit_count":len(commits),"versions":versions,"version_count":len(versions),"exact_source_versions":exact,"source_unavailable_versions":[v for v in versions if v not in snaps],"patch_commit_count":len(patch_commits),"adjacent_diff_count":len(adj),"ref_count":len(refs),"pr_count":len(prs)};(od/"SUMMARY.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
 lines=["# Full history machine inventory v2","",f"HEAD `{raw['head']}`; commits {len(commits)}; versions {len(versions)}; patch/test commits {len(patch_commits)}","","| Version | Source | Commit | Root | runtime | tests | rot0 | sticky | blank | proxy | queue | captcha |","|---|---|---|---|---:|---:|---|---|---|---|---|---|"]
 for r in matrix:
  if r["source_status"]!="EXACT_HISTORICAL_SOURCE":lines.append(f"| {r['version']} | unavailable | | | | | | | | | | |")
  else:lines.append(f"| {r['version']} | exact | `{r['commit'][:10]}` | `{r['root']}` | {len(r['runtime_files'])} | {r['test_file_count']} | {r['rotation0']} | {r['sticky']} | {r['about_blank']} | {r['proxy']} | {r['explicit_queue']} | {r['captcha']} |")
 lines+=["","## Adjacent diffs"]+[f"- v{x['from']} → v{x['to']}: `{x['diff_file']}`, files {len(x['runtime_file_stats'])}, sha `{x['diff_sha256']}`" for x in adj]+["","## Runtime/test/history commit ledger"]+[f"- `{c['sha'][:12]}` {c['date']} — {c['subject']} — {c['categories']}" for c in patch_commits]
 (od/"INVENTORY.md").write_text("\n".join(lines)+"\n",encoding="utf-8");print(json.dumps(summary,ensure_ascii=False))
if __name__=="__main__":main()
