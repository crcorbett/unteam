# Supported protocol and compatibility matrix

This is a synthetic local contract, not a Microsoft compatibility statement.

| Surface                                     | Status            | Exact claim                                                                                                                                      |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multi-tenant bot/user/conversation identity | Supported         | Scenario-owned synthetic identities are isolated by connection and tenant fields.                                                                |
| Bot Connector profile                       | Supported         | Closed `bot-connector` / `v3` profile with enumerated capabilities.                                                                              |
| OpenID metadata                             | Supported         | Local `/.well-known/openidconfiguration` document advertises the local JWK URL.                                                                  |
| JWK retrieval and selection                 | Supported         | Local JWK set, stable test key, generated live keys, selection control, and rotation path.                                                       |
| OAuth client credentials                    | Supported         | Synthetic client-credentials form boundary with scoped, expiring local tokens.                                                                   |
| Connector sendActivity-shaped request       | Supported         | Local `/connector/{connection}/v3/conversations/{conversation}/activities` request and typed status outcomes.                                    |
| Signed Activity delivery                    | Supported         | One Effect HttpClient attempt to a caller-supplied HTTP loopback URL under the canonical authority policy.                                       |
| Installation                                | Synthetic only    | Installed/uninstalled/blocked address state; no Teams catalog or `conversationUpdate` Activity.                                                  |
| Replay/duplicate ledger                     | Supported         | Default delivery deduplicates with zero attempts; an explicit control policy can deliver a replay to test a consumer-owned idempotency boundary. |
| Faults                                      | Supported         | Typed unauthorized/forbidden/not-found/conflict/throttled/transient/malformed/timeout/interrupted outcomes.                                      |
| Observations                                | Supported         | Bounded, versioned, secret-negative observations plus exact protocol counters and a bounded synthetic Connector request transcript.              |
| Adversarial signed delivery                 | Supported         | Closed optional claim, service-URL, signing-key, and replay controls exercise consumer rejection paths without widening the default scenario.    |
| Microsoft Graph                             | Not implemented   | No Graph routes, SDK, tenant, catalog, or UI behavior.                                                                                           |
| Production durability                       | Not implemented   | State is process-local and resettable.                                                                                                           |
| Discovery resolution                        | Narrow claim only | Availability of the OpenID document and direct JWK retrieval are proven; no upstream discovery client is claimed.                                |

The emulator is unofficial, synthetic, local-only, and unaffiliated with Microsoft. Passing conformance tests proves this repository's local contract only.
