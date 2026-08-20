# Local emulator runbook

## Install and build

```sh
bun install --frozen-lockfile
bun run build
bun run build:executable
```

For a clean consumer, use the repository's packed-artifact proof; do not import `src` as a substitute for a package artifact.

## Standalone process lifecycle

Prepare a JSON file matching the encoded `ServerScenarioV1` shape, then run:

```sh
./artifacts/unteam --scenario ./unteam.scenario.json
```

The CLI rejects a missing file, malformed JSON, unknown `scenarioVersion`,
excess properties, invalid service paths, and invalid bounds before acquiring a
listener. Keep the scenario file owner-readable only because it contains the
synthetic Connector client secret.

Read exactly one newline-delimited `unteam.ready.v1` record from stdout. It
contains the loopback origin, issuer, OpenID/JWK, OAuth, control, and resolved
Connector service URLs. Do not treat help text or stderr diagnostics as
readiness. Send `SIGTERM` or `SIGINT` to stop the process, wait for exit, then
probe the recorded origin: a fresh connection must fail. The process owns its
server finalizer; a consumer owns only its process handle and client resources.

## Programmatic lifecycle

Create the server inside `Effect.scoped`, use the returned stable local `origin`, and let the scope finalize it:

```ts
const program = Effect.scoped(
  Effect.gen(function* () {
    const server = yield* makeTeamsEmulatorServer();
    return yield* server.emulator.snapshot;
  }),
);
```

The server binds `127.0.0.1` on an ephemeral port. A caller-owned ingress listener is a separate resource and must be in the same outer Scope for a two-listener journey.

If scenario Connector URLs must target the acquired emulator port, decode a `ServerScenarioV1` with canonical absolute `servicePath` values and call `makeTeamsEmulatorServerFromPaths`. The Bun package resolves each path against the acquired origin before constructing the core scenario; callers must not guess an ephemeral port or import package source.

## Safe loopback policy

Delivery accepts `http://127.0.0.1`, `http://localhost`, and `http://[::1]` with a path. It rejects HTTPS, public authorities, userinfo, and fragments. No live Microsoft service URL is contacted.

## Controls and receipts

Use the versioned `/control/*` routes for installation, Connector outcome, signing-key selection, time, reset, delivery, and snapshot. Decode every response with its versioned Schema. A delivery receipt's HTTP response status and its `receipt.status` are separate: the control response is normally `200`, while the receipt records the caller ingress status or a typed uncertainty.

Delivery defaults to `replayPolicy: "deduplicate"`. Use `"deliver"` only when the journey must send the same Activity ID to a consumer-owned replay/idempotency boundary. Claim and signing-key overrides are bounded adversarial test inputs; keep normal journeys on connection-owned defaults. Snapshot Connector request text is synthetic test content and must never be populated from credentials or live tenant data.

## Reset and cleanup

Call the versioned reset control between journeys. Reset clears scenario state,
token records, replay IDs, observations, and simulated time. Scope finalization
stops listeners and releases WebCrypto/HTTP resources. The standalone process
follows the same rule through `BunRuntime.runMain` interruption. If a test
fails, verify both emulator and caller ingress ports with the Effect Platform
socket probe before continuing.

## Receipts and secrets

Keep dated proof receipts under `docs/proof`; record statuses, counts, versions, revisions, and claim ceilings only. Never record OAuth bearer values, client secrets, private JWK members, raw request headers, home-directory paths, or Pollsor-only state.
