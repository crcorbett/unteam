# AGENTS.md

Start at `docs/README.md`. Stable ownership is routed by `ARCHITECTURE.md`; product intent lives in the active SPEC, repeatable operations live in runbooks, and claim evidence lives in dated proof receipts.

Owned TypeScript uses strict Effect boundaries: decode at ingress, encode at outward boundaries, keep Effects lazy and app-executed, use named services and Layers, and keep raw HTTP/runtime capabilities private to host adapters. Do not introduce raw `fetch`, `Bun.listen`, `Bun.connect`, `Date.now`, wall-clock sleeps, unchecked JSON, arbitrary callbacks, primitive semantic identifiers, or consumer-specific state.

The repository intentionally uses a qualified minimal variation of the generic repository renderer: `emulator-core`, `emulator-bun`, and one CLI host are the only runtime owners. Do not add generic protocol, client, testkit, domain, shared, Graph, or plugin packages without a second demonstrated owner.

Before handoff run `bun run verification`. Do not claim Microsoft, Entra, Teams, Graph, provider, credential, production-durability, or hosted-deployment behavior from this synthetic local emulator.
