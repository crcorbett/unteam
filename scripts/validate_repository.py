#!/usr/bin/env python3
"""Small repository contract validator for the unteam topology."""

from __future__ import annotations

import json
import sys
from pathlib import Path


REQUIRED = (
    "AGENTS.md",
    "ARCHITECTURE.md",
    "README.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "LICENSE",
    "docs/README.md",
    "docs/architecture/owners.md",
    "docs/architecture/compatibility.md",
    "docs/architecture/versioning.md",
    "docs/architecture/lifecycle.md",
    "docs/architecture/http-boundary.md",
    "docs/repository-harness.md",
    "docs/product-specs/unteam-emulator/SPEC.md",
    "docs/product-specs/unteam-emulator/tasks.json",
    "docs/runbooks/local-emulator.md",
    "docs/critical-journeys/journeys.json",
    "docs/proof/unteam-emulator/proof-packet.json",
    "docs/proof/unteam-emulator/verification.receipt.json",
    "docs/proof/unteam-emulator/impact-ledger.md",
    "scripts/packed-artifact-proof.ts",
    "tools/governance/validate.py",
)


def fail(message: str) -> None:
    raise SystemExit(f"repository validation failed: {message}")


def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    for relative in REQUIRED:
        if not (root / relative).is_file():
            fail(f"missing required file {relative}")

    package = json.loads((root / "package.json").read_text())
    if package.get("packageManager") != "bun@1.4.3":
        fail("packageManager must remain bun@1.4.3")
    if package.get("workspaces", {}).get("packages") != ["apps/*", "packages/*"]:
        fail("workspace topology changed")

    forbidden_source_tokens = ("Date.now(", "Bun.listen(", "Bun.connect(", "fetch(")
    source_files = [
        path
        for base in (root / "packages", root / "apps")
        for path in base.rglob("*.ts")
        if "/test/" not in path.as_posix() and not path.name.endswith(".test.ts")
    ]
    for path in source_files:
        text = path.read_text()
        for token in forbidden_source_tokens:
            if token in text:
                fail(f"unmanaged boundary {token} in {path.relative_to(root)}")

    for path in root.rglob("*"):
        if not path.is_file() or any(part in {".git", "node_modules", "dist", ".turbo", "artifacts"} for part in path.parts):
            continue
        text = path.read_text(errors="ignore")
        local_path_markers = ("/" + "Users/", "\\" + "Users\\")
        if any(marker in text for marker in local_path_markers):
            fail(f"absolute local path in {path.relative_to(root)}")
        if ("Bearer " + "eyJ") in text:
            fail(f"raw bearer token in {path.relative_to(root)}")

    json.loads((root / "docs/product-specs/unteam-emulator/tasks.json").read_text())
    json.loads((root / "docs/critical-journeys/journeys.json").read_text())
    json.loads((root / "docs/proof/unteam-emulator/proof-packet.json").read_text())
    json.loads((root / "docs/proof/unteam-emulator/verification.receipt.json").read_text())
    print("repository validation passed")


if __name__ == "__main__":
    main()
