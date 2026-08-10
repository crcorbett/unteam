#!/usr/bin/env python3
"""Validate public package export maps and their build targets."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"package validation failed: {message}")


def main() -> None:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    expected = {
        "@unteam/emulator-core": {".", "./schemas", "./errors", "./service", "./live", "./test", "./fixtures", "./observations"},
        "@unteam/emulator-bun": {".", "./server"},
    }
    for package_dir in sorted((root / "packages").iterdir()):
        manifest_path = package_dir / "package.json"
        if not manifest_path.is_file():
            continue
        manifest = json.loads(manifest_path.read_text())
        name = manifest.get("name")
        if name not in expected:
            continue
        exports = manifest.get("exports", {})
        publish_exports = manifest.get("publishConfig", {}).get("exports", {})
        if set(exports) != expected[name] or set(publish_exports) != expected[name]:
            fail(f"{name} export keys are not explicit and complete")
        if "src" not in manifest.get("files", []) or "dist" not in manifest.get("files", []):
            fail(f"{name} must pack source and declarations")
        for key, descriptor in exports.items():
            if "@unteam/source" not in descriptor:
                fail(f"{name}{key} is missing the @unteam/source condition")
            for condition in ("types", "default"):
                if condition not in descriptor:
                    fail(f"{name}{key} is missing {condition}")
            source_path = root / package_dir.relative_to(root) / descriptor["@unteam/source"].removeprefix("./")
            if not source_path.is_file():
                fail(f"{name}{key} source target is missing")
            for condition in ("types", "default"):
                target = root / package_dir.relative_to(root) / descriptor[condition].removeprefix("./")
                if not target.is_file():
                    fail(f"{name}{key} build target is missing: {target.relative_to(root)}")
        for key, descriptor in publish_exports.items():
            if "@unteam/source" not in descriptor:
                fail(f"{name}{key} publishConfig is missing the source condition")
    cli = json.loads((root / "apps/cli/package.json").read_text())
    if cli.get("bin", {}).get("unteam") != "dist/main.js":
        fail("CLI bin must point at dist/main.js")
    print("package validation passed")


if __name__ == "__main__":
    main()
