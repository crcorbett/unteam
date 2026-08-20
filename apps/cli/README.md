# unteam CLI

The single application runtime for local CLI use. It requires one
`--scenario <json-file-path>` input, decodes it through Effect CLI and
`ServerScenarioV1`, and starts the scoped Bun server only after that boundary
succeeds.

`BunRuntime.runMain` owns signals and root-fibre interruption. The outer Scope
owns listener cleanup. Successful startup writes one `unteam.ready.v1` JSON
line to stdout; bounded secret-negative diagnostics use stderr. The library
packages remain runtime-free.
