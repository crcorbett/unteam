# Configured standalone server verification

## Target

- implementation revision: `1a7409f`
- Effect family: exact `4.0.0-beta.107`
- boundary: local `127.0.0.1` HTTP only
- scenario input: Effect CLI file Schema plus canonical `ServerScenarioV1`
- listener input: required branded `ServerPort`
- readiness: `UnteamReadyV2` on stdout and `GET /ready`

## Evidence

- `bun --filter @unteam/emulator-bun test`: passed 3 Bun server tests.
- `bun --filter unteam test`: passed 4 compiled-executable CLI tests.
- `bun run verification`: passed formatting, lint, type checks, development and
  production dependency checks, all 12 repository tests, builds, executable
  build, package exports, repository/governance validation and packed-artifact
  proof.
- The CLI tests reject missing, zero, out-of-range and occupied ports; reject
  malformed/wrong-version/excess/missing scenarios; decode stdout and HTTP
  readiness; stop on `SIGTERM`; prove the exact listener closes; and restart
  fresh on the same port.

## Result

The standalone application owns one `BunRuntime.runMain` execution and one
scoped Bun HTTP listener. A consumer can be configured with only the loopback
origin and can decode scenario identity and all service URLs from `/ready`.
The consumer does not own the unteam process or finalizer.

## Limitations and non-claims

This is local synthetic evidence. It does not prove Microsoft, Teams, Entra,
Graph, live tenant, provider, hosted, remote-network, TLS, authentication,
publication, deployment, cross-platform, durability or production behaviour.
The compiled executable is a local ignored artifact, not a published release.
