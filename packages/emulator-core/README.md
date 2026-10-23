# @unteam/emulator-core

The runtime-free strict Effect service and synthetic Bot Connector protocol model. The package owns versioned schemas, typed errors, state, signing, protocol HTTP application, deterministic test substitutions, bounded protocol counters, and synthetic Connector request transcripts; it does not own a listener or a consumer application runtime.

Version `0.2.0` adds explicit replay delivery policy, bounded adversarial claim/key overrides, separate token and Activity service URL claims, and snapshot protocol counters. Overrides are test controls only; the default delivery path remains connection-owned and duplicate-deduplicating.

`./events` exports `TrafficEvent`, its checked event data and the
`TrafficEvents` recording capability. The CLI supplies its required recorder;
library-only consumers may omit recording. Core owns no file or terminal.
JWT validity uses the actual clock independently of adjustable scenario time.

`./live` exports static `TeamsEmulatorLive` and `TeamsEmulatorTest` Layers.
Supply the decoded scenario and actual listener origin through
`Layer.succeed(EmulatorConfiguration, { scenario, origin })`, then provide that
Layer to the emulator Layer. `EmulatorConfiguration` is exported from `./live`.
The test Layer owns its controlled clock and deterministic signer. Application
hosts own execution and listener lifetime; there is no Layer factory callback.
