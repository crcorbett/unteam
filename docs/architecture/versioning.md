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

`@unteam/emulator-core` and `@unteam/emulator-bun` remain at `0.2.0`. `@unteam/client` starts at `0.1.0` and requires the matching local core artifact for its shared wire Schemas. The shared loopback URL brand retains its original Bun-host identifier so existing source consumers do not get an unnecessary brand change. No registry publication is implied by these local versions.
