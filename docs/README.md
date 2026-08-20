# Documentation router

Read this router first. Stable boundaries live in `docs/architecture`, repeatable operations live in `docs/runbooks`, active work state lives in `docs/product-specs`, and mutable claim evidence lives in dated `docs/proof` receipts.

## Stable architecture

- [`architecture/owners.md`](architecture/owners.md) — package, state, Effect, HTTP, and CLI ownership.
- [`architecture/compatibility.md`](architecture/compatibility.md) — supported synthetic protocol matrix and claim ceiling.
- [`architecture/versioning.md`](architecture/versioning.md) — independent schema and profile version policy.
- [`architecture/lifecycle.md`](architecture/lifecycle.md) — Scope, reset, token, observation, and cleanup invariants.
- [`architecture/http-boundary.md`](architecture/http-boundary.md) — Effect Platform client/server and serialization boundary.
- [`repository-harness.md`](repository-harness.md) — tooling, versions, governance, and validation profile.

## Active intent and work state

- [`product-specs/unteam-emulator/SPEC.md`](product-specs/unteam-emulator/SPEC.md) — scope, invariants, non-goals, and exact claim ceiling.
- [`product-specs/unteam-emulator/tasks.json`](product-specs/unteam-emulator/tasks.json) — current implementation and closeout tasks.

## Operations and journeys

- [`runbooks/local-emulator.md`](runbooks/local-emulator.md) — install, start, safe loopback policy, reset, receipts, and cleanup.
- [`critical-journeys/journeys.json`](critical-journeys/journeys.json) — critical journey and false-green oracle.

## Proof and closeout

- [`proof/unteam-emulator/proof-packet.json`](proof/unteam-emulator/proof-packet.json) — dated claim/evidence packet.
- [`proof/unteam-emulator/verification.receipt.json`](proof/unteam-emulator/verification.receipt.json) — repository verification receipt.
- [`proof/unteam-emulator/standalone-process.receipt.json`](proof/unteam-emulator/standalone-process.receipt.json) — standalone JSON scenario, readiness, HTTP, and process-finalization receipt.
- [`proof/unteam-emulator/impact-ledger.md`](proof/unteam-emulator/impact-ledger.md) — affected owners, compatibility impact, and non-impacts.

Do not copy Pollsor provider state into this repository. Pollsor remains the source/current-consumer evidence for its adapter and full-system journey.
