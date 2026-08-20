# @unteam/emulator-bun

The scoped Effect Platform Bun HTTP server for `@unteam/emulator-core`. It binds loopback, returns a stable local origin, and finalizes the listener with the caller-owned Scope.

Use `makeTeamsEmulatorServer` for fully resolved core scenarios. Use
`makeTeamsEmulatorServerFromPaths` with `ServerScenarioV1` when connector
service paths must be resolved only after the server acquires its loopback
origin. Its optional branded port is used by the standalone CLI; library tests
may still request an ephemeral port. Both constructors expose the scoped
server, service, origin, and `UnteamReadyV2` record.
