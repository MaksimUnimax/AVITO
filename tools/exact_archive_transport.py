#!/usr/bin/env python3
"""Deterministic lossless ZIP transport. Keep original headers and Info-ZIP payloads.
The archive SHA-256 is mandatory: compression differences fail closed.
"""
import argparse
import base64
import hashlib
import json
import lzma
import re
import struct
import subprocess
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode(data):
    return base64.b64encode(data).decode('ascii')


def blob_hash(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def safe_path(path):
    p = PurePosixPath(path)
    if p.is_absolute() or '..' in p.parts or '\\' in path:
        raise ValueError('Unsafe archive path: ' + path)
    return p


def build(zip_paths, output):
    archives, blobs = [], {}
    for p in zip_paths:
        raw = p.read_bytes()
        name = re.sub(r'\(1\)(?=\.zip$)', '', p.name)
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None, p
            files, recipe, last = [], [], 0
            for info in z.infolist():
                safe_path(info.filename)
                body = z.read(info)
                h = sha(body)
                if h not in blobs:
                    try:
                        blobs[h] = {'text': body.decode('utf-8')}
                    except UnicodeDecodeError:
                        blobs[h] = {'base64': encode(body)}
                files.append({'path': info.filename, 'h': h, 'is_dir': info.is_dir()})
                n, e = struct.unpack_from('<HH', raw, info.header_offset + 26)
                start = info.header_offset + 30 + n + e
                recipe.append({'gap': encode(raw[last:start]), 'path': info.filename})
                last = start + info.compress_size
            recipe.append({'gap': encode(raw[last:])})
            root = safe_path(files[0]['path']).parts[0]
            archives.append({'name': name, 'sha256': sha(raw), 'size': len(raw),
                             'root': root, 'files': files, 'recipe': recipe})
    document = {'format': 1, 'archives': archives, 'blobs': blobs}
    payload = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode()
    packed = lzma.compress(payload, preset=9)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'exact_transport.xz').write_bytes(packed)
    text = base64.b64encode(packed)
    rows = []
    for i, start in enumerate(range(0, len(text), 16000)):
        chunk = text[start:start + 16000]
        name = f'part-{i:03d}.b64'
        (output / name).write_bytes(chunk)
        rows.append({'path': name, 'bytes': len(chunk), 'git_blob_sha': blob_hash(chunk),
                     'sha256': sha(chunk)})
    manifest = {'format': 1, 'algorithm': 'UTF-8 compact JSON; LZMA/XZ preset=9; Base64 chunks=16000',
                'transport_bytes': len(packed), 'transport_sha256': sha(packed),
                'part_count': len(rows), 'parts': rows,
                'archives': [{k: a[k] for k in ('name','sha256','size','root')} for a in archives]}
    (output / 'MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: manifest[k] for k in ('transport_bytes','transport_sha256','part_count')}))


def materialize(parts_dir, manifest_path, output):
    spec = json.loads(manifest_path.read_text())
    parts = []
    for row in spec['parts']:
        b = (parts_dir / safe_path(row['path'])).read_bytes()
        assert len(b) == row['bytes'], row['path']
        assert blob_hash(b) == row['git_blob_sha'], row['path']
        assert sha(b) == row['sha256'], row['path']
        parts.append(b)
    assert len(parts) == spec['part_count']
    packed = base64.b64decode(b''.join(parts), validate=True)
    assert len(packed) == spec['transport_bytes'] and sha(packed) == spec['transport_sha256']
    document = json.loads(lzma.decompress(packed))
    assert document['format'] == 1
    bodies = {h: v['text'].encode('utf-8') if 'text' in v else base64.b64decode(v['base64'], validate=True)
              for h,v in document['blobs'].items()}
    for h,b in bodies.items():
        assert sha(b) == h, h
    output.mkdir(parents=True, exist_ok=True)
    result = []
    for archive in document['archives']:
        root = safe_path(archive['root'])
        assert len(root.parts) == 1
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            for row in archive['files']:
                rel = safe_path(row['path'])
                assert rel.parts[0] == root.name
                p = work / rel
                if row['is_dir']:
                    p.mkdir(parents=True, exist_ok=True)
                else:
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes(bodies[row['h']])
            intermediate = work / 'payloads.zip'
            subprocess.run(['zip', '-q', '-6', '-r', str(intermediate), root.name], cwd=work, check=True)
            raw = intermediate.read_bytes()
            payloads = {}
            with zipfile.ZipFile(intermediate) as z:
                for info in z.infolist():
                    n,e = struct.unpack_from('<HH', raw, info.header_offset + 26)
                    start = info.header_offset + 30 + n + e
                    payloads[info.filename] = raw[start:start + info.compress_size]
            reconstructed = b''.join(base64.b64decode(s['gap'], validate=True) +
                                     (payloads[s['path']] if 'path' in s else b'') for s in archive['recipe'])
            assert len(reconstructed) == archive['size'], archive['name']
            assert sha(reconstructed) == archive['sha256'], archive['name']
            target = output / safe_path(archive['name'])
            assert target.parent == output
            if target.exists():
                assert target.read_bytes() == reconstructed, target
            else:
                target.write_bytes(reconstructed)
            with zipfile.ZipFile(target) as z:
                assert z.testzip() is None
            source = output / root.name
            for row in archive['files']:
                rel = safe_path(row['path'])
                dest = output / rel
                if row['is_dir']:
                    dest.mkdir(parents=True, exist_ok=True)
                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    b = bodies[row['h']]
                    if dest.exists(): assert dest.read_bytes() == b, dest
                    else: dest.write_bytes(b)
            version = json.loads((source/'manifest.json').read_text())['version']
            report = {'version': version, 'archive': target.name, 'bytes': len(reconstructed),
                      'sha256': sha(reconstructed), 'git_blob_sha': blob_hash(reconstructed),
                      'source_root': root.name, 'source_files': sum(not f['is_dir'] for f in archive['files']),
                      'source_hashes': {str(PurePosixPath(f['path']).relative_to(root)): f['h'] for f in archive['files'] if not f['is_dir']},
                      'archive_crc': 'PASS', 'byte_identity': 'PASS', 'runtime_qa': 'NOT_RUN_BY_PUBLICATION_TOOL',
                      'release_acceptance': 'REJECTED' if version == '1.0.35' else 'NOT_ESTABLISHED'}
            result.append(report)
            print(json.dumps({k:report[k] for k in ('version','bytes','sha256','byte_identity')}))
    (output/'PUBLICATION_VERIFIED.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    sp=p.add_subparsers(dest='command',required=True)
    b=sp.add_parser('build'); b.add_argument('--output',type=Path,required=True); b.add_argument('zips',nargs='+',type=Path)
    m=sp.add_parser('materialize'); m.add_argument('--parts',type=Path,required=True); m.add_argument('--manifest',type=Path,required=True); m.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    if a.command=='build':build(a.zips,a.output)
    else:materialize(a.parts,a.manifest,a.output)

if __name__=='__main__':main()
