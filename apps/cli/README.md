# unteam CLI

The single application runtime for local CLI use. It requires
`--scenario <json-file-path>` and `--port <loopback-port>` inputs, decodes them
through Effect CLI and Schema, and starts the scoped Bun server only after
those boundaries succeed.

`BunRuntime.runMain` owns signals and root-fibre interruption. The outer Scope
owns listener cleanup. Successful startup writes one `unteam.ready.v2` JSON
line to stdout and serves the same record from `GET /ready`; bounded
secret-negative diagnostics use stderr. The library packages remain
runtime-free.
