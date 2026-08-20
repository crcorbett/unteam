# Lifecycle, state, and reset invariants

- The outer caller Scope owns the Bun server, core Layer resources, WebCrypto keys, clock, and any request resources.
- The standalone CLI has one root `BunRuntime.runMain` program. `SIGINT` or
  `SIGTERM` interrupts that root fibre; its outer Scope finalizes the Bun server.
  There are no manual signal listeners or nested runtime executions.
- Scenario JSON is fully read and Schema-decoded before the listener is
  acquired. Invalid startup emits no readiness record.
- Readiness is emitted only after the listener and scenario state are ready.
  It is one bounded `unteam.ready.v2` stdout line and the identical `GET
/ready` response. Neither is a server finalizer or a second lifecycle owner.
- The CLI port is explicit and Schema-decoded. A consumer may connect by
  configured origin, but it never owns or finalizes the unteam process.
- `BunHttpServer.make` is the listener boundary. Its finalizer stops the listener; no raw Bun or Node lifecycle is retained.
- The TestClock is created in the outer emulator Layer and is read effectfully. It is never acquired inside an already-finalized inner Scope.
- `advanceTime` accepts a positive `Duration` schema value. Live and test clocks share the same service contract.
- OAuth records hold raw bearer values only in private state. Every clock read prunes expired records; snapshots expose counts, not tokens.
- Observations and the synthetic Connector request transcript are bounded by scenario capacity. Once observations are full, new observations increment `total` and set `truncated`; protocol counters continue to record exact request totals without retaining additional content.
- `reset` clears connections to their scenario baseline, tokens, activity replay ledger, observations, counters, and clock offset.
- Delivery is one attempt. A transport error produces an `uncertain` receipt and never claims exactly-once or successful provider processing.
- Expected provider faults remain typed responses. Defects, interruption, and listener acquisition failures are not converted into arbitrary protocol messages.

The caller-owned consumer ingress listener is deliberately separate from the emulator protocol listener. The critical journey requires both listeners to finalize.
