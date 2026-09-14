from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get("AF_V144_WORK", ROOT / "подбор авито расширение" / "releases" / "v1.0.44" / "v144_work"))
CONTRACT = WORK / "tests" / "contract_audit_v129.test.js"
EMBEDDED_GREEN = WORK / "tests" / "global_avito_request_authority_v144.test.js"

DIRECT_OLD = "assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.match(r.blocked_reason,/PROXY_NOT_ACTIVE|SUPPRESSED/);assert.equal(requests,0);"
DIRECT_NEW = "assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.equal(r.avito_network_authority?.blocked,true);assert.notEqual(r.avito_network_authority?.egress_change_confirmed,true);assert.equal(requests,0);"

GREEN_OLD = "const repo = path.resolve(__dirname, '..', '..');\nconst sourceRoot = process.env.AF_SOURCE_ROOT || path.join(repo, 'подбор авито расширение', 'releases', 'v1.0.44', 'v144_work');"
GREEN_NEW = "const sourceRoot = process.env.AF_SOURCE_ROOT || path.resolve(__dirname, '..');"


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def main() -> None:
    replace_once(
        CONTRACT,
        DIRECT_OLD,
        DIRECT_NEW,
        "DIRECT rate-limit durable authority assertion",
    )
    replace_once(
        EMBEDDED_GREEN,
        GREEN_OLD,
        GREEN_NEW,
        "embedded GREEN self-contained source root",
    )
    print("DIRECT rate-limit regression asserts durable blocked-egress authority")
    print("embedded v1.0.44 invariant regression resolves its materialized worktree with AF_SOURCE_ROOT sanitized")


if __name__ == "__main__":
    main()
