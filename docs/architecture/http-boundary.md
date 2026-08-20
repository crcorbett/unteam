# HTTP and serialization boundary

`@unteam/emulator-core` owns the protocol router as an Effect application. `@unteam/emulator-bun` supplies the scoped Effect Platform Bun listener and `FetchHttpClient` Layer. Tests use Effect Platform `HttpClient`, `HttpClientRequest`, and `HttpClientResponse`; they do not use raw `fetch`.

Ingress rules:

1. Request paths, bearer headers, forms, and JSON bodies enter as untrusted values.
2. Schema decoding occurs before state mutation or protocol dispatch.
3. Exact request helpers reject excess top-level properties and enforce bounds.
4. Protocol errors are mapped to a closed `ProtocolErrorResponseV1` with explicit `400/401/403/404/409/429/500/503` status semantics.
5. Outbound Activity, JWK, OAuth, Connector, receipt, snapshot, and observation values are schema-encoded before response/body construction.
6. The only unsafe JSON helper is used after schema encoding for the Effect Platform response/body adapter; encoding failure is converted to a defect because the typed invariant has already been established.

The repository does not introduce a generic client package. The protocol client boundary is private to the core delivery service and is represented by Effect Platform `HttpClient`; a second emulator or consumer-owned client would be required before extracting a reusable wrapper.

Safe delivery authorities are `http://127.0.0.1`, `http://localhost`, and `http://[::1]` without credentials or fragments. HTTPS, public hosts, userinfo, and fragments are rejected by the public delivery service.

The standalone CLI has a separate process boundary. It decodes one
`ServerScenarioV1` JSON file before acquiring the HTTP listener, then
Schema-encodes one `unteam.ready.v1` line after acquisition. Consumers decode
that line to discover the loopback HTTP URLs. They do not import the emulator's
server package or infer readiness from help text, diagnostics, timing, or an
open process handle.
