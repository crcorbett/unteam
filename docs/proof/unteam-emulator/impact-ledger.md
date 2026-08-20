# Impact ledger

| Area                | Impact                                                                                                                                                                                       | Evidence/owner                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| New public topology | Added `@unteam/emulator-core`, `@unteam/emulator-bun`, and one `unteam` CLI host.                                                                                                            | `docs/architecture/owners.md`        |
| Pollsor             | No Pollsor product state or workflow was copied. Pollsor's server adapter consumes local `0.2.0` artifacts while retaining its product composition and two-listener journey.                 | Pollsor TSE-010 task/proof           |
| Protocol claims     | Claims are limited to the synthetic matrix; no Microsoft affiliation or tenant behavior is implied.                                                                                          | `docs/architecture/compatibility.md` |
| Security            | Loopback-only delivery, redacted credentials, bounded observations, private tokens/keys, and secret-negative receipts.                                                                       | `SECURITY.md`, lifecycle proof       |
| Runtime             | Listener and clock lifetimes are Scope-owned; `BunRuntime.runMain` owns CLI interruption and readiness follows scenario-ready acquisition.                                                   | `docs/architecture/lifecycle.md`     |
| CLI boundary        | Required JSON input is decoded by Effect CLI with `ServerScenarioV1`; a compiled local executable exposes only versioned readiness and existing HTTP controls.                               | `apps/cli`, local process receipt    |
| Package consumers   | Export maps include JavaScript, declarations, source condition, fixtures/observations/test subpaths, Bun server entrypoints, and the root-exported path-resolving server schema/constructor. | package manifests and packed proof   |

No npm publication, release, tenant access, deployment, billing, or unrelated repository mutation is part of this task.
