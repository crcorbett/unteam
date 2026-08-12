# @unteam/emulator-core

The runtime-free strict Effect service and synthetic Bot Connector protocol model. The package owns versioned schemas, typed errors, state, signing, protocol HTTP application, deterministic test substitutions, bounded protocol counters, and synthetic Connector request transcripts; it does not own a listener or a consumer application runtime.

Version `0.2.0` adds explicit replay delivery policy, bounded adversarial claim/key overrides, separate token and Activity service URL claims, and snapshot protocol counters. Overrides are test controls only; the default delivery path remains connection-owned and duplicate-deduplicating.
