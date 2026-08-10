# Architecture

`@unteam/emulator-core` owns the synthetic Bot Connector protocol model, versioned schemas, typed errors, state machine, activity signing boundary, protocol HTTP application, and the `TeamsEmulator` service contract. It has no runtime listener or consumer-domain dependency.

`@unteam/emulator-bun` owns the scoped Effect Platform Bun HTTP server and the private loopback HTTP delivery adapter. It composes core Layers and exposes a stable local origin without exposing a raw server, client, socket, token, or key.

`unteam` CLI owns configuration decoding, filesystem/configuration boundaries, structured logging, signal handling, and one application runtime. Package code does not run Effects at import time.

State is held behind one scoped protocol-state service using Effect collections and synchronized updates. The state owner keeps raw OAuth secrets private, expires/prunes tokens using the Effect clock, and stores bounded observation ledgers with total and truncation metadata. Public snapshots contain synthetic protocol state only.

The server lifecycle is an outer Scope boundary. `BunHttpServer.make` and any socket capability are acquired and finalized by Effect Platform; no raw Bun or Node listener is introduced. A caller-owned loopback ingress remains a separate listener in conformance tests.

The local renderer was inspected and rejected for this topology because it is Site/TanStack-shaped and generates unrelated web, domain, RPC, and deployment owners. This is the documented repository variation; governance, version snapshots, source conditions, validation, receipts, and local-skill principles are retained.
