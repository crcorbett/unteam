# Retained traffic logs

The standalone CLI requires a file recorder. Core owns `TrafficEvent` and the
`TrafficEvents` recording capability; the Bun host owns `TrafficLogLive`, file
access and readers. The CLI supplies that recorder before starting the server.
Library-only consumers can omit recording.

Each server process creates a retained `run-*` directory under
`UNTEAM_LOG_DIRECTORY` (default `.unteam/runs`) with a private `events.jsonl`
file. Its `unteam.event.v1` records contain a run ID, increasing sequence number,
current UTC timestamp and checked lifecycle, HTTP or message data. Messages
include direction, sender identity, tenant, conversation, full checked text and
outcome. HTTP records contain route categories and statuses, never raw headers,
OAuth forms, tokens, private keys or arbitrary response bodies.

One semaphore orders appends. An append writes the complete encoded line and
syncs the file before advancing the committed sequence and byte count. A write
failure signals the owning CLI, interrupts the unrecorded operation and ends the
server scope. Later recording attempts also interrupt instead of reporting
success without a saved record. A disk failure can leave a partial final line; earlier confirmed
records remain on disk. Readers must report an invalid tail rather than invent
a successful event. This local recorder is not a production durability claim.

Reset clears simulated protocol state and appends a reset marker in the same
file. Shutdown closes the listener and finishes its requests, then appends its marker
before closing the file. Neither operation
deletes history. A new process starts a new run.

Terminal output reads committed byte ranges from the file. A bounded notification
only wakes the reader; the file holds the records. A slow reader catches up even
when notifications merge. Terminal string fields are quoted so fixture control characters cannot add
lines or commands to the display. Terminal failures do not change the required file
recorder. A later browser reader can use the same event Schema and file records.

Effect EventLog was considered and rejected for this recorder. Its handler and
replay model adds behaviour that a traffic transcript does not need. Effect
Schema, FileSystem, Semaphore, PubSub and Stream provide the required ordering,
failure reporting and independent readers directly.

Authentication uses the actual clock for JWT validity. Adjustable scenario time
still controls synthetic Activity timestamps and simulation controls; advancing
or resetting it cannot produce an expired authentication token for an ordinary
consumer.
