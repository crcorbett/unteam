import { Schema } from "effect";

export class UnteamClientError extends Schema.TaggedError<UnteamClientError>()("UnteamClientError", {
  operation: Schema.Literals([
    "readiness",
    "deliver",
    "installation",
    "connector-outcome",
    "signing-key",
    "advance-time",
    "reset",
    "snapshot",
  ]),
  reason: Schema.Trimmed.check(Schema.isMinLength(1)),
}) {}
