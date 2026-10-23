# Versioning policy

The protocol has independent versioned envelope families. A change to one family does not silently version another.

| Family            | Current version      | Compatibility rule                                                                                                                |
| ----------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Scenario          | `scenario.v1`        | Startup accepts exactly the supported scenario version and bounded fields.                                                        |
| Control           | `control.v1`         | Controls decode exact top-level properties and return `receipt.v1` or `control-error.v1`.                                         |
| Observation       | `observation.v1`     | Observation kind/detail additions require an explicit version decision; capacity and truncation remain visible.                   |
| Receipt           | `receipt.v1`         | Delivery/control result fields are closed and are never widened by arbitrary provider output.                                     |
| Snapshot          | `snapshot.v1`        | Snapshots omit raw credentials, bearer tokens, private keys, and consumer state.                                                  |
| Protocol profile  | `protocol.v1`        | OpenID/JWK/OAuth/Connector response codecs share only this protocol profile marker.                                               |
| Activity          | Bot Connector-shaped | Activity fields are decoded/encoded at the HTTP boundary; protocol-profile changes are not inferred from Activity text.           |
| Process readiness | `unteam.ready.v2`    | One secret-negative stdout JSON line and identical `GET /ready` response expose bounded scenario identity and loopback endpoints. |

Exact excess-property policy applies to scenario/control/protocol request envelopes at their ingress boundary. Meaningful text, key material, array, observation, and connection bounds are part of the contract. Expected failures use bounded codes/details and explicit status mapping.

Public package versions are independent of envelope versions. A breaking package API or schema change requires a package major/version decision; a compatible envelope addition may be released without changing unrelated envelope markers.

`@unteam/emulator-core` and `@unteam/emulator-bun` use version `0.4.0`;
`@unteam/client` and the CLI use `0.3.0`. These pre-1.0 minor releases mark the
strict Effect migration. Core Layer factories are replaced by static Layers
requiring `EmulatorConfiguration`; client test substitution uses native
`Layer.succeed(UnteamClient, implementation)`. The Bun package follows its
matching core dependency. Effect remains 4.0.5 and all wire envelope versions
remain unchanged. GitHub release tags follow the CLI version. Package archives
are release downloads; no npm registry publication is implied.
