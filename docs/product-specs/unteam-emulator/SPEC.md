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

## Scope

The current slice includes synthetic OpenID/JWK, OAuth client credentials, Connector sendActivity-shaped requests, signed Activity delivery, installation/address state, connector outcomes, rotation, replay, reset, bounded observations, and a closed BotConnectorProfile.

## Non-goals and claim ceiling

No Graph, Teams UI/catalog, production durability, tenant credentials, live Microsoft requests, proactive provider behavior, or `conversationUpdate` installation Activity is implemented. OpenID document availability and direct JWK retrieval are proven; discovery resolution by a client is not claimed. A successful local test is not Microsoft compatibility evidence.

## Acceptance evidence

The active tasks and dated proof receipt record the exact commands and artifacts. Pollsor remains the source/current consumer; its adapter must consume packed `unteam` artifacts and preserve Pollsor's TeamsChannel ingress/egress boundary.
