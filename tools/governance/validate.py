#!/usr/bin/env python3
"""Validate the repository governance/documentation router."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"governance validation failed: {message}")


def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    if "Apache License" not in (root / "LICENSE").read_text():
        fail("Apache-2.0 license is missing")
    router = (root / "docs/README.md").read_text()
    for link in (
        "architecture/owners.md",
        "architecture/compatibility.md",
        "architecture/versioning.md",
        "architecture/lifecycle.md",
        "architecture/http-boundary.md",
        "runbooks/local-emulator.md",
        "critical-journeys/journeys.json",
        "proof/unteam-emulator/proof-packet.json",
    ):
        if link not in router or not (root / "docs" / link).is_file():
            fail(f"docs router does not resolve {link}")
    spec = (root / "docs/product-specs/unteam-emulator/SPEC.md").read_text()
    for phrase in ("Non-goals and claim ceiling", "Invariants", "Acceptance evidence"):
        if phrase not in spec:
            fail(f"SPEC is missing {phrase}")
    proof = json.loads((root / "docs/proof/unteam-emulator/proof-packet.json").read_text())
    if not proof.get("nonClaims") or not proof.get("secretNegative"):
        fail("proof packet must carry non-claims and secret-negative rules")
    print("governance validation passed")


if __name__ == "__main__":
    main()
