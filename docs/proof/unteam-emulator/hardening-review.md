# Strict-Effect hardening review

The extraction deliberately corrects the Pollsor fixture boundary:

- Pollsor tenant, agent, inbox, outbox, workflow, and directory types are absent from public schemas and server composition.
- Public operations expose branded/versioned semantic values and closed Effects, not Request objects, primitive semantic milliseconds, raw clients/servers/tokens/keys, consumer Layers, or consumer snapshots.
- Activity signing is a named `ActivitySigner` service with a live WebCrypto Layer and deterministic fixed-key test Layer. Claims are Schema-encoded before signing.
- TestClock lifetime belongs to the outer emulator Layer; clock reads are effectful.
- Observation capacity, total/truncated metadata, token expiry, and token pruning are explicit.
- Exact request decoding, bounded text/arrays, typed control errors, and explicit status mappings prevent arbitrary error echo.
- The profile is closed and capability-enumerated; no generic callback/plugin package was introduced.
- Effect Platform Bun HTTP server and HttpClient are the only owned network/lifecycle boundaries.

The fixed private JWK in the test Layer is deterministic test fixture material only. It is not a credential, is not accepted by production code, and must never be reused outside tests.
