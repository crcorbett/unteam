# @unteam/emulator-bun

The scoped Effect Platform Bun HTTP server for `@unteam/emulator-core`. It binds loopback, returns a stable local origin, and finalizes the listener with the caller-owned Scope.

Use `makeTeamsEmulatorServer` for fully resolved core scenarios. Use `makeTeamsEmulatorServerFromPaths` with `ServerScenarioV1` when connector service paths must be resolved only after the server acquires its ephemeral loopback origin. Both constructors expose the same scoped server/service result.
