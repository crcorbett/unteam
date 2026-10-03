# unteam

`unteam` is an unofficial, local-only, synthetic Microsoft Teams/Bot Connector emulator for strict Effect tests. It models a bounded multi-tenant Bot Connector protocol surface without contacting Microsoft services.

## Install

```sh
bun add @unteam/emulator-core @unteam/emulator-bun
```

The packages are currently verified as local packed artifacts. Add `@unteam/client` as well only when a separate test program needs typed HTTP controls for a running emulator. npm publication is intentionally out of scope.

## Programmatic use

```ts
import { Effect } from "effect";
import { makeTeamsEmulatorServer } from "@unteam/emulator-bun";

const program = Effect.scoped(
  Effect.gen(function* () {
    const server = yield* makeTeamsEmulatorServer();
    const snapshot = yield* server.emulator.snapshot;
    return { origin: server.origin, snapshot };
  }),
);
```

Use `@unteam/emulator-core/fixtures` for bounded scenario fixtures and `@unteam/emulator-core/observations` for typed observation views. The public service has closed controls for delivery, installation, Connector outcomes, signing-key selection, simulation time, snapshot, and reset. `makeTeamsEmulatorServerFromPaths` accepts the Bun-owned `ServerScenarioV1` when a consumer needs connector service URLs resolved against the scoped server's ephemeral origin.

## CLI

```sh
bunx unteam --help
bunx unteam --scenario ./unteam.scenario.json --port 4311
```

The required JSON file is decoded with the public `ServerScenarioV1` Schema.
After binding `127.0.0.1` on the configured port, the CLI writes one
`unteam.ready.v2` JSON line to stdout and serves the same record from
`http://127.0.0.1:4311/ready`. It contains the scenario name, safe URLs and
resolved service URLs, but no client secret, token, private key, or local path.

For a local standalone executable:

```sh
bun run build:executable
./artifacts/unteam --scenario ./unteam.scenario.json --port 4311
```

The CLI is a local harness host, not a production service. `BunRuntime.runMain`
owns interruption and the outer Effect Scope finalizes the server.

## Supported surface and claim ceiling

Supported: synthetic multi-tenant bot identities, users, conversations, local service URLs, OpenID metadata/JWK rotation, OAuth client credentials, Connector `sendActivity`-shaped requests, signed Activity delivery to a caller-supplied safe loopback URL, bounded protocol counters and synthetic Connector transcripts, deterministic controls, explicit duplicate/replay delivery policy, bounded adversarial claim/key overrides, and reset.

Not claimed: Microsoft or Teams compatibility, Entra identity, Graph, Teams UI/catalog installation, proactive provider behavior, production durability, cloud deployment, credentials, exactly-once delivery, or any live tenant access. “Installation” means synthetic local address availability; no `conversationUpdate` Activity is implemented.

See [`docs/README.md`](docs/README.md) for architecture, compatibility, runbooks, critical journeys, and proof receipts.
