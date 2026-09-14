from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get("AF_V144_WORK", ROOT / "подбор авито расширение" / "releases" / "v1.0.44" / "v144_work"))
TARGET = WORK / "tests" / "global_avito_request_authority_v144.test.js"

OLD = "const repo = path.resolve(__dirname, '..', '..');\nconst sourceRoot = process.env.AF_SOURCE_ROOT || path.join(repo, 'подбор авито расширение', 'releases', 'v1.0.44', 'v144_work');"
NEW = "const sourceRoot = process.env.AF_SOURCE_ROOT || path.resolve(__dirname, '..');"


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")
    count = text.count(OLD)
    if count != 1:
        raise RuntimeError(f"expected exactly one embedded GREEN source-root fallback, got {count}")
    TARGET.write_text(text.replace(OLD, NEW, 1), encoding="utf-8")
    print("embedded v1.0.44 invariant regression now resolves its own materialized worktree when AF_SOURCE_ROOT is sanitized")


if __name__ == "__main__":
    main()
