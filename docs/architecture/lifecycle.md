# Lifecycle, state, and reset invariants

- The outer caller Scope owns the Bun server, core Layer resources, WebCrypto keys, clock, and any request resources.
- `BunHttpServer.make` is the listener boundary. Its finalizer stops the listener; no raw Bun or Node lifecycle is retained.
- The TestClock is created in the outer emulator Layer and is read effectfully. It is never acquired inside an already-finalized inner Scope.
- `advanceTime` accepts a positive `Duration` schema value. Live and test clocks share the same service contract.
- OAuth records hold raw bearer values only in private state. Every clock read prunes expired records; snapshots expose counts, not tokens.
- Observations are bounded by scenario capacity. Once full, new observations increment `total` and set `truncated` while retaining the bounded tail/order defined by the state owner.
- `reset` clears connections to their scenario baseline, tokens, activity replay ledger, observations, counters, and clock offset.
- Delivery is one attempt. A transport error produces an `uncertain` receipt and never claims exactly-once or successful provider processing.
- Expected provider faults remain typed responses. Defects, interruption, and listener acquisition failures are not converted into arbitrary protocol messages.

The caller-owned consumer ingress listener is deliberately separate from the emulator protocol listener. The critical journey requires both listeners to finalize.
