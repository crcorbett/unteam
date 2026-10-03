# HTTP and serialization boundary

`@unteam/emulator-core` owns the protocol router as an Effect application. `@unteam/emulator-bun` supplies the scoped Effect Platform Bun listener and `FetchHttpClient` Layer. Tests use Effect Platform `HttpClient`, `HttpClientRequest`, and `HttpClientResponse`; they do not use raw `fetch`.

Ingress rules:

1. Request paths, bearer headers, forms, and JSON bodies enter as untrusted values.
2. Schema decoding occurs before state mutation or protocol dispatch.
3. Exact request helpers reject excess top-level properties and enforce bounds.
4. Protocol errors are mapped to a closed `ProtocolErrorResponseV1` with explicit `400/401/403/404/409/429/500/503` status semantics.
5. Outbound Activity, JWK, OAuth, Connector, receipt, snapshot, and observation values are schema-encoded before response/body construction.
6. The only unsafe JSON helper is used after schema encoding for the Effect Platform response/body adapter; encoding failure is converted to a defect because the typed invariant has already been established.

`@unteam/client` is a narrow consumer-side wrapper for this emulator's versioned local HTTP contract. It is not a general Teams or Microsoft client. Its live Layer reads a decoded loopback origin, checks `unteam.ready.v2` and the OpenID/JWK and snapshot responses, then exposes named, Schema-encoded controls. HTTP or decoding failures become a closed `UnteamClientError`; the test Layer replaces the same service without starting a listener. The client never imports the Bun host at runtime. The core delivery HTTP client remains private to the emulator and is a separate role.

Safe delivery authorities are `http://127.0.0.1`, `http://localhost`, and `http://[::1]` without credentials or fragments. HTTPS, public hosts, userinfo, and fragments are rejected by the public delivery service.

The standalone CLI has a separate process boundary. It decodes one
`ServerScenarioV1` JSON file and one bounded port before acquiring the HTTP
listener, then Schema-encodes `UnteamReadyV2` after acquisition. The CLI emits
one stdout copy and serves the same record from `GET /ready`. A separately
running consumer may be configured with only the loopback origin. It does not
import the Bun host package or infer readiness from help text, diagnostics,
timing, or an open process handle. A consumer may use the independent
`@unteam/client` package for these checks and controls.
