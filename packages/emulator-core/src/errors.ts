import { Match } from "effect";
import { Data, Schema } from "effect";
export const StartupErrorCode = Schema.Literals([
  "invalid-scenario",
  "duplicate-connection",
  "duplicate-signing-key",
  "missing-selected-key",
  "unsupported-profile",
]);
export type StartupErrorCode = Schema.Schema.Type<typeof StartupErrorCode>;
export class EmulatorStartupError extends Data.TaggedError("EmulatorStartupError")<{
  readonly code: StartupErrorCode;
}> {}
export const ControlErrorCode = Schema.Literals([
  "unknown-connection",
  "unknown-signing-key",
  "invalid-loopback-target",
  "duplicate-activity",
  "control-conflict",
  "invalid-duration",
  "delivery-failed",
]);
export type ControlErrorCode = Schema.Schema.Type<typeof ControlErrorCode>;
export class EmulatorControlError extends Data.TaggedError("EmulatorControlError")<{
  readonly code: ControlErrorCode;
}> {}
export const DeliveryErrorCode = Schema.Literals([
  "unknown-connection",
  "uninstalled",
  "blocked-installation",
  "invalid-loopback-target",
  "signing-failure",
  "transmission-failure",
  "timeout",
  "interrupted",
  "uncertain",
]);
export type DeliveryErrorCode = Schema.Schema.Type<typeof DeliveryErrorCode>;
export class EmulatorDeliveryError extends Data.TaggedError("EmulatorDeliveryError")<{
  readonly code: DeliveryErrorCode;
}> {}
export const ProtocolErrorCode = Schema.Literals([
  "malformed-request",
  "missing-token",
  "invalid-token",
  "invalid-client",
  "invalid-scope",
  "unknown-route",
  "unknown-connection",
  "blocked-installation",
  "uninstalled",
  "conversation-conflict",
  "throttled",
  "transient-failure",
  "malformed-response",
]);
export type ProtocolErrorCode = Schema.Schema.Type<typeof ProtocolErrorCode>;
export class EmulatorProtocolError extends Data.TaggedError("EmulatorProtocolError")<{
  readonly code: ProtocolErrorCode;
  readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503;
}> {}
export class ActivitySigningError extends Data.TaggedError("ActivitySigningError")<{
  readonly code: "key-unavailable" | "web-crypto-failure" | "claims-encoding-failure";
}> {}
export class ActivityIngressError extends Data.TaggedError("ActivityIngressError")<{
  readonly code: "request-failure" | "response-failure" | "timeout" | "interrupted";
  readonly status?: number;
}> {}
export type EmulatorError =
  | EmulatorControlError
  | EmulatorDeliveryError
  | EmulatorProtocolError
  | ActivitySigningError
  | ActivityIngressError;
export const statusForProtocolError = (error: ProtocolErrorCode): EmulatorProtocolError["status"] => {
  return Match.value(error).pipe(
    Match.when("malformed-request", (): 400 => 400),
    Match.whenOr("missing-token", "invalid-token", "invalid-client", (): 401 => 401),
    Match.whenOr("invalid-scope", "blocked-installation", (): 403 => 403),
    Match.whenOr("unknown-route", "unknown-connection", "uninstalled", (): 404 => 404),
    Match.when("conversation-conflict", (): 409 => 409),
    Match.when("throttled", (): 429 => 429),
    Match.when("transient-failure", (): 503 => 503),
    Match.when("malformed-response", (): 500 => 500),
    Match.exhaustive,
  );
};
