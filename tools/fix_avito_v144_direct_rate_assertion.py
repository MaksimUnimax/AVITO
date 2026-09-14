from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get("AF_V144_WORK", ROOT / "подбор авито расширение" / "releases" / "v1.0.44" / "v144_work"))
TARGET = WORK / "tests" / "contract_audit_v129.test.js"

OLD = "assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.match(r.blocked_reason,/PROXY_NOT_ACTIVE|SUPPRESSED/);assert.equal(requests,0);"
NEW = "assert.equal(r.status,'WAITING_FOR_NEXT_ASSISTANT_FORM');assert.equal(r.avito_network_authority?.blocked,true);assert.notEqual(r.avito_network_authority?.egress_change_confirmed,true);assert.equal(requests,0);"


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")
    count = text.count(OLD)
    if count != 1:
        raise RuntimeError(f"expected exactly one DIRECT rate-limit assertion to migrate, got {count}")
    TARGET.write_text(text.replace(OLD, NEW, 1), encoding="utf-8")
    print("DIRECT rate-limit regression now asserts durable blocked-egress authority; transient blocked_reason is not used")


if __name__ == "__main__":
    main()
