# Local emulator runbook

## Install and build

```sh
bun install --frozen-lockfile
bun run build
```

For a clean consumer, use the repository's packed-artifact proof; do not import `src` as a substitute for a package artifact.

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

## Safe loopback policy

Delivery accepts `http://127.0.0.1`, `http://localhost`, and `http://[::1]` with a path. It rejects HTTPS, public authorities, userinfo, and fragments. No live Microsoft service URL is contacted.

## Controls and receipts

Use the versioned `/control/*` routes for installation, Connector outcome, signing-key selection, time, reset, delivery, and snapshot. Decode every response with its versioned Schema. A delivery receipt's HTTP response status and its `receipt.status` are separate: the control response is normally `200`, while the receipt records the caller ingress status or a typed uncertainty.

## Reset and cleanup

Call the versioned reset control between journeys. Reset clears scenario state, token records, replay IDs, observations, and simulated time. Scope finalization stops listeners and releases WebCrypto/HTTP resources. If a test fails, verify both emulator and caller ingress ports with the Effect Platform socket probe before continuing.

## Receipts and secrets

Keep dated proof receipts under `docs/proof`; record statuses, counts, versions, revisions, and claim ceilings only. Never record OAuth bearer values, client secrets, private JWK members, raw request headers, home-directory paths, or Pollsor-only state.
