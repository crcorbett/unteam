# @unteam/client

Named Effect HTTP operations for an already-running local unteam server. The
client owns loopback configuration, readiness checks, encoded requests and
decoded responses. It does not start a server or know a consumer's tenants,
inbox, agent, workflow or outbox.

Use `@unteam/client/live` at a test or development application boundary after
setting `UNTEAM_ORIGIN` to the server's loopback root URL. The optional
`UNTEAM_READINESS_TIMEOUT_MILLIS` bounds the startup check. The service contract
is `@unteam/client/service`; `@unteam/client/test` exports the same named
service for deterministic substitution with `Layer.succeed(UnteamClient,
implementation)`. Tests supply the named methods directly; no generic client
callback or Layer factory is required. `@unteam/client/schemas` exposes the
versioned wire values owned by `@unteam/emulator-core/schemas` and the client
connection configuration. There is no raw HTTP-client export.

The local emulator runbook owns server startup and reset steps. This package's
tests prove only its synthetic HTTP contract. They do not prove Microsoft,
hosted or production behaviour, nor a published registry artifact.
