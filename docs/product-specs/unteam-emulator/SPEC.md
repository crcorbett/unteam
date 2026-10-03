# unteam emulator SPEC

## Intent

Create a small public strict-Effect monorepo that extracts only Pollsor's synthetic Bot Connector protocol/state/server capabilities. It must support local conformance journeys without contacting Microsoft or importing Pollsor domain/application state.

## Invariants

- All public operations have closed request/result/error contracts.
- Scenario, control, observation, receipt, snapshot, and protocol profile envelopes are independently versioned.
- Exact excess-property policy and meaningful bounds apply at ingress.
- Tenant, bot, user, conversation, service URL, signing key, token, installation, and replay identities remain isolated.
- Tokens and private keys never appear in snapshots, observations, proof receipts, or logs.
- Observation capacity and truncation totals are explicit.
- Test substitution means deterministic replacement of one service contract; the composed emulator is a separate external-system simulation.
- The emulator accepts only safe loopback delivery authorities.
- Scope owns server/clock/key lifetime; reset is effectful and deterministic.
- The standalone CLI requires `--scenario <json-file-path>` and `--port
<loopback-port>` flags, reads the
  JSON through Effect CLI's file-Schema boundary, and decodes it with the
  canonical Bun-owned `ServerScenarioV1` before acquiring a listener.
- The CLI owns one `BunRuntime.runMain` execution. Process interruption closes
  the outer Scope, which finalizes the Bun server; no manual signal handler or
  nested Effect runtime is allowed.
- Successful startup emits exactly one `unteam.ready.v2` JSON line to stdout
  and serves the same record from `GET /ready`.
  Bounded diagnostics use stderr, and neither stream may expose secrets,
  tokens, private key material, raw environment values, or workstation paths.

## Scope

The current slice includes synthetic OpenID/JWK, OAuth client credentials, Connector sendActivity-shaped requests, signed Activity delivery, installation/address state, connector outcomes, rotation, explicit replay policy, bounded adversarial claim/key overrides, path-resolved scoped server scenarios, a standalone JSON scenario-file CLI, versioned secret-negative readiness, reset, bounded observations/protocol counters/synthetic Connector transcripts, and a closed BotConnectorProfile.

## Standalone CLI boundary

The CLI command is:

```text
unteam --scenario <json-file-path> --port <loopback-port>
```

The file must contain the encoded `ServerScenarioV1` shape. Effect CLI parses
the file as JSON and Effect Schema decodes it with excess properties rejected.
Missing files, malformed JSON, unsupported scenario versions, invalid paths,
invalid identities, invalid bounds, and invalid secret values fail before
listener acquisition and before readiness output.

After the scoped server has bound `127.0.0.1` on the requested port and the
scenario has been constructed, the CLI Schema-encodes one newline-delimited
readiness record:

```text
UnteamReadyV2
  readinessVersion: "unteam.ready.v2"
  synthetic: true
  scenarioName
  origin
  issuerUrl
  openIdMetadataUrl
  jwkSetUrl
  oauthTokenUrl
  controlBaseUrl
  botAppId
  connectorScope
  connections[]: connectionId + resolved serviceUrl
```

`GET /ready` returns this same exact Schema-encoded record. A client can
therefore be configured with only the origin and can fail closed when the
server is absent, reports the wrong version, or runs the wrong scenario.

All URLs are loopback HTTP. Readiness omits the scenario path, client secret,
signing material, bearer values, raw environment, and diagnostics. The CLI then
waits inside the same Scope until `BunRuntime.runMain` interruption finalizes
the server.

## Standalone connection successor — 2026-08-20

The earlier `unteam.ready.v1` stdout contract remains historical evidence for
UNTEAM-008. The current contract is `unteam.ready.v2`: it adds the bounded
scenario name, requires an explicit listener port, and exposes the readiness
record over HTTP. This lets a consumer start unteam independently and supply
only `http://127.0.0.1:<port>/`. The consumer does not import unteam packages,
read unteam stdout, pass a process handle, or own the emulator finalizer.

Loopback is required for the current local synthetic claim. It keeps scenario
data and synthetic credentials on the same machine and prevents an accidental
public listener. A future remotely hosted emulator would need separate
authentication, transport-security, exposure, lifecycle and evidence work; it
is not implied by this SPEC.

## Reusable local client successor — 2026-10-03

`@unteam/client` is a separate `0.1.0` package for test and development
consumers that control a running local emulator. It shares the exact
`ServerScenarioV1` and `UnteamReadyV2` wire Schemas with core, without
depending on the Bun host or Pollsor. It provides one named Effect service,
a live HTTP Layer, and a deterministic test Layer. The live Layer decodes a
loopback origin from configuration and fails closed unless readiness reports
the expected version and origin, OpenID points to the same JWK URL, JWKs
decode, and a snapshot decodes. Every control request is Schema-encoded and
every response is Schema-decoded; expected transport and protocol failures
have a bounded typed error. No process launch, listener, Microsoft credential,
or Pollsor workflow belongs in this package.

This package is for synthetic local testing only. It is not a production
Teams client and does not change the Microsoft/provider claim ceiling. Its
packed artifact must install and run in a clean consumer together with the
matching core artifact before Pollsor takes a pinned local copy. Publication
and deployment remain separate future decisions.

## Non-goals and claim ceiling

No Graph, Teams UI/catalog, production durability, tenant credentials, live Microsoft requests, proactive provider behavior, or `conversationUpdate` installation Activity is implemented. OpenID document availability and direct JWK retrieval are proven; discovery resolution by a client is not claimed. A successful local test is not Microsoft compatibility evidence.

## Acceptance evidence

The active tasks and dated proof receipt record the exact commands and artifacts. Pollsor remains the source/current consumer; its adapter consumes the standalone executable through the versioned JSON/readiness/HTTP boundary and preserves Pollsor's TeamsChannel ingress/egress plus tenant/inbox/agent/workflow/outbox composition boundaries. This repository does not import Pollsor state.
