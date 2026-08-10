# Impact ledger

| Area                | Impact                                                                                                                           | Evidence/owner                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| New public topology | Added `@unteam/emulator-core`, `@unteam/emulator-bun`, and one `unteam` CLI host.                                                | `docs/architecture/owners.md`        |
| Pollsor             | No Pollsor product state or workflow was copied. A separate consumer branch records the packed artifact seam.                    | Pollsor adapter task/proof           |
| Protocol claims     | Claims are limited to the synthetic matrix; no Microsoft affiliation or tenant behavior is implied.                              | `docs/architecture/compatibility.md` |
| Security            | Loopback-only delivery, redacted credentials, bounded observations, private tokens/keys, and secret-negative receipts.           | `SECURITY.md`, lifecycle proof       |
| Runtime             | Listener and clock lifetimes are Scope-owned; CLI owns signals and shutdown.                                                     | `docs/architecture/lifecycle.md`     |
| Package consumers   | Export maps include JavaScript, declarations, source condition, fixtures/observations/test subpaths, and Bun server entrypoints. | package manifests and packed proof   |

No npm publication, release, tenant access, deployment, billing, or unrelated repository mutation is part of this task.
