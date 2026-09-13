#!/usr/bin/env python3
import argparse, collections, datetime as dt, hashlib, json, os, re, subprocess, sys
from pathlib import Path

PREFIX = "подбор авито расширение/"
RUNTIME_NAMES = {
    "manifest.json", "service_worker.js", "chatgpt_content.js", "avito_content.js",
    "core.js", "proxy_manager.js", "recovery.js", "popup.js", "popup.html", "popup.css"
}
VERSION_RE = re.compile(r"(?:v)?(1\.0\.\d+)(?:[-_ ]?([A-Za-z0-9]+))?", re.I)
CRITICAL_PATTERNS = {
    "about_blank": r"about:blank",
    "tabs_create_target": r"tabsCreate\(\{[^}]*url\s*:\s*(?:expectedHref|summary\.href|target|href)",
    "writing_block_required": r"WRITING_BLOCK_REQUIRED|writing[_ -]?block",
    "ordinary_markdown_zero_command": r"ordinary.*(?:markdown|code block)|ASSISTANT_WRITING_BLOCK_REQUIRED",
    "captcha_manual": r"CAPTCHA_MANUAL_REQUIRED|manual[_ -]?captcha|geetest",
    "explicit_queue": r"EXPLICIT_LISTING_QUEUE|explicit_listing_queue",
    "resume_queue": r"RESUME_EXPLICIT_LISTING_QUEUE",
    "report_ack": r"REPORT_ACK|report.*ack|acknowledg",
    "proxy_manager": r"proxy_manager\.js|ProxyCore",
    "rotation_zero": r"rotation\s*:\s*0|rotate\)\s*===\s*0|rotate\s*===\s*0",
    "rotation_sticky": r"rotation\s*:\s*-1|rotate\)\s*===\s*-1|rotate\s*===\s*-1",
    "egress_probe": r"ipify|egress",
    "ip_block_recovery": r"IP_BLOCK|recoverAvitoIpBlock|recoverAvitoConnection",
    "rate_limit": r"RATE_LIMIT|Retry-After|429",
    "proxy_auth": r"onAuthRequired|authCredentials|last_auth",
    "pac_script": r"pac_script|FindProxyForURL|pacScript",
    "provider_create": r"createProxyInPackage|create-proxy",
}

def run(*args, check=True, text=True):
    p = subprocess.run(args, check=check, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=text)
    return p.stdout

def git(*args, check=True): return run("git", *args, check=check)

def sha256(data): return hashlib.sha256(data).hexdigest()

def file_at(commit, path):
    p = subprocess.run(["git","show",f"{commit}:{path}"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    return p.stdout if p.returncode == 0 else None

def list_tree(commit):
    out = git("ls-tree","-r","--name-only",commit, check=False)
    return [x for x in out.splitlines() if x]

def commit_meta(commit):
    fmt = "%H%x00%P%x00%aI%x00%s"
    out = git("show","-s",f"--format={fmt}",commit).rstrip("\n")
    h,p,d,s = out.split("\x00",3)
    return {"sha":h,"parents":p.split() if p else [],"date":d,"subject":s}

def changed_files(commit):
    out = git("diff-tree","--root","--no-commit-id","--name-status","-r",commit, check=False)
    rows=[]
    for line in out.splitlines():
        parts=line.split("\t")
        if len(parts)>=2: rows.append({"status":parts[0],"path":parts[-1]})
    return rows

def parse_manifest_bytes(raw):
    try:
        obj=json.loads(raw.decode("utf-8-sig"))
        return obj
    except Exception:
        return None

def is_avito_manifest(path, obj):
    if not obj or not isinstance(obj,dict): return False
    if not path.startswith(PREFIX): return False
    name=str(obj.get("name","")).lower()
    hosts=" ".join(map(str,obj.get("host_permissions",[]))).lower()
    return "avito" in name or "avito.ru" in hosts or "авито" in path.lower()

def version_key(v):
    try: return tuple(int(x) for x in v.split("."))
    except: return (999,999,999)

def classify_path(path):
    base=Path(path).name
    if base in RUNTIME_NAMES: return "runtime"
    low=path.lower()
    if "/tests/" in low or low.endswith(".test.js") or "test" in base.lower() or "/qa/" in low: return "test_qa"
    if low.endswith((".md",".json",".txt")): return "docs_data"
    if "/.github/workflows/" in low or low.startswith(".github/workflows/"): return "workflow"
    if low.endswith((".py",".sh",".ps1")) and ("tool" in low or "material" in low or "build" in low): return "tooling"
    return "other"

def root_from_manifest(path): return str(Path(path).parent).replace("\\","/")

def snapshot_for(commit, root):
    tree=list_tree(commit)
    prefix=root.rstrip("/")+"/"
    rels=[p[len(prefix):] for p in tree if p.startswith(prefix)]
    runtime={}
    tests=[]; docs=[]
    for rel in rels:
        base=Path(rel).name
        if base in RUNTIME_NAMES:
            raw=file_at(commit,prefix+rel)
            if raw is not None:
                runtime[rel]={"sha256":sha256(raw),"bytes":len(raw)}
        low=rel.lower()
        if low.startswith("tests/") or "/tests/" in low or low.endswith(".test.js"):
            raw=file_at(commit,prefix+rel)
            if raw is not None: tests.append({"path":rel,"sha256":sha256(raw),"bytes":len(raw)})
        if low.startswith("docs/") or low.endswith(".md"):
            raw=file_at(commit,prefix+rel)
            if raw is not None: docs.append({"path":rel,"sha256":sha256(raw),"bytes":len(raw)})
    combined=b""
    for rel in sorted(runtime):
        raw=file_at(commit,prefix+rel) or b""
        combined += rel.encode()+b"\0"+raw+b"\0"
    text=combined.decode("utf-8","replace")
    markers={k: bool(re.search(rx,text,re.I|re.S)) for k,rx in CRITICAL_PATTERNS.items()}
    return {"root":root,"runtime":runtime,"tests":tests,"docs":docs,"critical_markers":markers,
            "runtime_bundle_sha256":sha256(combined),"runtime_file_count":len(runtime),"test_file_count":len(tests)}

def runtime_texts(commit, root):
    prefix=root.rstrip("/")+"/"; out={}
    for name in RUNTIME_NAMES:
        raw=file_at(commit,prefix+name)
        if raw is not None: out[name]=raw.decode("utf-8","replace")
    return out

def unified_diff(prev, curr, prev_label, curr_label):
    import difflib
    files=sorted(set(prev)|set(curr))
    out=[]; stats=[]
    for name in files:
        a=prev.get(name,"").splitlines(keepends=True); b=curr.get(name,"").splitlines(keepends=True)
        if a==b: continue
        d=list(difflib.unified_diff(a,b,fromfile=f"{prev_label}/{name}",tofile=f"{curr_label}/{name}",n=3))
        add=sum(1 for x in d if x.startswith("+") and not x.startswith("+++")); dele=sum(1 for x in d if x.startswith("-") and not x.startswith("---"))
        stats.append({"file":name,"added":add,"deleted":dele})
        out.extend(d); out.append("\n")
    return "".join(out), stats

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--out",default="audit-output"); ns=ap.parse_args()
    outdir=Path(ns.out); outdir.mkdir(parents=True,exist_ok=True); (outdir/"diffs").mkdir(exist_ok=True)
    try: git("fetch","--all","--tags","--prune")
    except Exception: pass
    refs=git("for-each-ref","--format=%(refname)%00%(objectname)","refs/heads","refs/remotes","refs/tags").splitlines()
    ref_rows=[]
    for x in refs:
        if "\x00" in x:
            a,b=x.split("\x00",1); ref_rows.append({"ref":a,"sha":b})
    commits=git("rev-list","--all","--reverse").splitlines()
    meta={c:commit_meta(c) for c in commits}
    # Manifest observations: only commits that touched a manifest, plus current all manifests.
    manifest_commits=set(git("log","--all","--format=%H","--","*manifest.json", check=False).splitlines())
    manifest_obs=[]
    for c in sorted(manifest_commits,key=lambda x: meta[x]["date"] if x in meta else ""):
        for p in list_tree(c):
            if not p.endswith("manifest.json") or not p.startswith(PREFIX): continue
            raw=file_at(c,p); obj=parse_manifest_bytes(raw) if raw else None
            if is_avito_manifest(p,obj):
                v=str(obj.get("version","")).strip()
                if re.fullmatch(r"\d+\.\d+\.\d+",v):
                    manifest_obs.append({"version":v,"commit":c,"date":meta[c]["date"],"path":p,"root":root_from_manifest(p),"name":obj.get("name"),"version_name":obj.get("version_name")})
    # Version mentions from commit messages.
    mentions=collections.defaultdict(list)
    for c in commits:
        for m in VERSION_RE.finditer(meta[c]["subject"]):
            mentions[m.group(1)].append({"commit":c,"date":meta[c]["date"],"subject":meta[c]["subject"]})
    versions=sorted(set([x["version"] for x in manifest_obs])|set(mentions), key=version_key)
    byv=collections.defaultdict(list)
    for o in manifest_obs: byv[o["version"]].append(o)
    version_rows=[]
    snapshots={}
    for v in versions:
        obs=sorted(byv.get(v,[]),key=lambda x:x["date"])
        # Prefer roots explicitly named for version; otherwise the latest manifest observation.
        chosen=None
        explicit=[o for o in obs if v.replace(".",".") in o["root"] or v.replace(".","_") in o["root"] or ("v"+v) in o["root"]]
        if explicit: chosen=explicit[-1]
        elif obs: chosen=obs[-1]
        row={"version":v,"manifest_observations":obs,"commit_mentions":mentions.get(v,[]),"source_status":"SOURCE_UNAVAILABLE","canonical":None}
        if chosen:
            snap=snapshot_for(chosen["commit"],chosen["root"])
            row["source_status"]="EXACT_HISTORICAL_SOURCE"; row["canonical"]={**chosen,**snap}; snapshots[v]=row["canonical"]
        version_rows.append(row)
    # Adjacent diffs for every neighboring discovered version where exact source exists.
    adjacent=[]
    exact_versions=[v for v in versions if v in snapshots]
    for a,b in zip(exact_versions,exact_versions[1:]):
        sa,sb=snapshots[a],snapshots[b]
        ta=runtime_texts(sa["commit"],sa["root"]); tb=runtime_texts(sb["commit"],sb["root"])
        diff,stats=unified_diff(ta,tb,"v"+a,"v"+b)
        fn=f"v{a}_to_v{b}.patch"; (outdir/"diffs"/fn).write_text(diff,encoding="utf-8")
        adjacent.append({"from":a,"to":b,"from_commit":sa["commit"],"to_commit":sb["commit"],"diff_file":"diffs/"+fn,"runtime_file_stats":stats,"diff_sha256":sha256(diff.encode())})
    # Every commit touching Avito Finder area, classified and with changed files.
    patch_commits=[]
    for c in commits:
        ch=[r for r in changed_files(c) if r["path"].startswith(PREFIX) or r["path"] in ("AGENTS.md",)]
        if not ch: continue
        cats=collections.Counter(classify_path(r["path"]) for r in ch)
        if cats["runtime"] or cats["test_qa"] or re.search(r"\b(fix|patch|build|release|test|qa|recovery|proxy|captcha|navigation|queue|report)\b",meta[c]["subject"],re.I):
            patch_commits.append({**meta[c],"changed":ch,"categories":dict(cats),"versions_mentioned":sorted(set(m.group(1) for m in VERSION_RE.finditer(meta[c]["subject"])),key=version_key)})
    # Presence matrix across canonical exact source snapshots.
    matrix=[]
    for v in versions:
        s=snapshots.get(v)
        if not s: matrix.append({"version":v,"source_status":"SOURCE_UNAVAILABLE"}); continue
        matrix.append({"version":v,"source_status":"EXACT_HISTORICAL_SOURCE","commit":s["commit"],"root":s["root"],"runtime_bundle_sha256":s["runtime_bundle_sha256"],"runtime_files":s["runtime"],"test_file_count":s["test_file_count"],**s["critical_markers"]})
    # Search current/historical filenames for release/patch docs and archives.
    current_tree=list_tree("HEAD")
    artifacts=[p for p in current_tree if p.startswith(PREFIX) and (re.search(r"v1\.0\.\d+",p,re.I) or any(k in p.lower() for k in ("patch","audit","release","checkpoint")))]
    # PR inventory through GitHub REST when token exists.
    prs=[]
    token=os.environ.get("GITHUB_TOKEN")
    if token:
        import urllib.request
        url="https://api.github.com/repos/MaksimUnimax/AVITO/pulls?state=all&per_page=100&sort=created&direction=asc"
        req=urllib.request.Request(url,headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"})
        try:
            with urllib.request.urlopen(req,timeout=20) as r: arr=json.load(r)
            for p in arr: prs.append({"number":p["number"],"title":p["title"],"state":p["state"],"merged_at":p.get("merged_at"),"head":p["head"]["ref"],"base":p["base"]["ref"],"created_at":p["created_at"],"updated_at":p["updated_at"]})
        except Exception as e: prs=[{"error":str(e)}]
    raw={"generated_at":dt.datetime.now(dt.timezone.utc).isoformat(),"head":git("rev-parse","HEAD").strip(),"refs":ref_rows,"commit_count":len(commits),"versions":version_rows,"adjacent_diffs":adjacent,"patch_commits":patch_commits,"critical_matrix":matrix,"current_artifacts":artifacts,"pull_requests":prs}
    (outdir/"FULL_HISTORY_RAW.json").write_text(json.dumps(raw,ensure_ascii=False,indent=2),encoding="utf-8")
    # Compact machine summary.
    summary={"head":raw["head"],"commit_count":len(commits),"version_count":len(versions),"versions":versions,"exact_source_versions":exact_versions,"source_unavailable_versions":[v for v in versions if v not in snapshots],"patch_commit_count":len(patch_commits),"adjacent_diff_count":len(adjacent),"ref_count":len(ref_rows),"pr_count":len(prs)}
    (outdir/"SUMMARY.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    # Markdown version table and commit ledger.
    lines=["# Full history machine inventory","",f"HEAD: `{raw['head']}`",f"Commits scanned: {len(commits)}",f"Versions discovered: {len(versions)}",f"Patch/runtime/test commits: {len(patch_commits)}","","## Versions","","| Version | Source | Canonical commit | Root | Runtime files | Tests | rotation0 | sticky | about:blank | proxy | queue | captcha |","|---|---|---|---|---:|---:|---|---|---|---|---|---|"]
    for row in matrix:
        if row["source_status"]!="EXACT_HISTORICAL_SOURCE": lines.append(f"| {row['version']} | SOURCE_UNAVAILABLE |  |  |  |  |  |  |  |  |  |  |")
        else:
            lines.append(f"| {row['version']} | exact | `{row['commit'][:10]}` | `{row['root']}` | {len(row['runtime_files'])} | {row['test_file_count']} | {row['rotation_zero']} | {row['rotation_sticky']} | {row['about_blank']} | {row['proxy_manager']} | {row['explicit_queue']} | {row['captcha_manual']} |")
    lines += ["","## Adjacent runtime diffs",""]
    for d in adjacent: lines.append(f"- v{d['from']} → v{d['to']}: `{d['diff_file']}`; files={len(d['runtime_file_stats'])}; sha256 `{d['diff_sha256']}`")
    lines += ["","## Runtime/test patch commit ledger",""]
    for c in patch_commits: lines.append(f"- `{c['sha'][:12]}` {c['date']} — {c['subject']} — {c['categories']}")
    (outdir/"INVENTORY.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    print(json.dumps(summary,ensure_ascii=False))

if __name__=="__main__": main()
