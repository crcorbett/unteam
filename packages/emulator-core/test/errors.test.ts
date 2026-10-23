import { Function as EffectFunction, Array as EffectArray } from "effect";
import { Predicate } from "effect";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  ActivityIngressError,
  ActivitySigningError,
  ControlErrorCode,
  DeliveryErrorCode,
  EmulatorControlError,
  EmulatorDeliveryError,
  EmulatorProtocolError,
  EmulatorStartupError,
  ProtocolErrorCode,
  StartupErrorCode,
  statusForProtocolError,
} from "../src/errors";
describe("typed error contracts", () => {
  it.effect("keeps every tagged error family closed and status-mapped", () =>
    Effect.sync(() => {
      const startupCodes = [
        "invalid-scenario",
        "duplicate-connection",
        "duplicate-signing-key",
        "missing-selected-key",
        "unsupported-profile",
      ] as const satisfies readonly StartupErrorCode[];
      const controlCodes = [
        "unknown-connection",
        "unknown-signing-key",
        "invalid-loopback-target",
        "duplicate-activity",
        "control-conflict",
        "invalid-duration",
        "delivery-failed",
      ] as const satisfies readonly ControlErrorCode[];
      const deliveryCodes = [
        "unknown-connection",
        "uninstalled",
        "blocked-installation",
        "invalid-loopback-target",
        "signing-failure",
        "transmission-failure",
        "timeout",
        "interrupted",
        "uncertain",
      ] as const satisfies readonly DeliveryErrorCode[];
      const protocolCodes = [
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
      ] as const satisfies readonly ProtocolErrorCode[];
      EffectFunction.pipe(
        startupCodes,
        EffectArray.forEach((code) => {
          const error = new EmulatorStartupError({
            code,
          });
          assert.isTrue(Predicate.isTagged("EmulatorStartupError")(error));
          assert.strictEqual(error.code, code);
        }),
      );
      EffectFunction.pipe(
        controlCodes,
        EffectArray.forEach((code) => {
          const error = new EmulatorControlError({
            code,
          });
          assert.isTrue(Predicate.isTagged("EmulatorControlError")(error));
          assert.strictEqual(error.code, code);
        }),
      );
      EffectFunction.pipe(
        deliveryCodes,
        EffectArray.forEach((code) => {
          const error = new EmulatorDeliveryError({
            code,
          });
          assert.isTrue(Predicate.isTagged("EmulatorDeliveryError")(error));
          assert.strictEqual(error.code, code);
        }),
      );
      EffectFunction.pipe(
        protocolCodes,
        EffectArray.forEach((code) => {
          const error = new EmulatorProtocolError({
            code,
            status: statusForProtocolError(code),
          });
          assert.isTrue(Predicate.isTagged("EmulatorProtocolError")(error));
          assert.strictEqual(error.code, code);
          assert.strictEqual(error.status, statusForProtocolError(code));
        }),
      );
      EffectFunction.pipe(
        ["key-unavailable", "web-crypto-failure", "claims-encoding-failure"] as const,
        EffectArray.forEach((code) => {
          const error = new ActivitySigningError({
            code,
          });
          assert.isTrue(Predicate.isTagged("ActivitySigningError")(error));
          assert.strictEqual(error.code, code);
        }),
      );
      EffectFunction.pipe(
        ["request-failure", "response-failure", "timeout", "interrupted"] as const,
        EffectArray.forEach((code) => {
          const error = new ActivityIngressError({
            code,
          });
          assert.isTrue(Predicate.isTagged("ActivityIngressError")(error));
          assert.strictEqual(error.code, code);
        }),
      );
    }),
  );
});
