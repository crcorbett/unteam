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

      for (const code of startupCodes) {
        const error = new EmulatorStartupError({ code });
        assert.strictEqual(error._tag, "EmulatorStartupError");
        assert.strictEqual(error.code, code);
      }
      for (const code of controlCodes) {
        const error = new EmulatorControlError({ code });
        assert.strictEqual(error._tag, "EmulatorControlError");
        assert.strictEqual(error.code, code);
      }
      for (const code of deliveryCodes) {
        const error = new EmulatorDeliveryError({ code });
        assert.strictEqual(error._tag, "EmulatorDeliveryError");
        assert.strictEqual(error.code, code);
      }
      for (const code of protocolCodes) {
        const error = new EmulatorProtocolError({ code, status: statusForProtocolError(code) });
        assert.strictEqual(error._tag, "EmulatorProtocolError");
        assert.strictEqual(error.code, code);
        assert.strictEqual(error.status, statusForProtocolError(code));
      }

      for (const code of ["key-unavailable", "web-crypto-failure", "claims-encoding-failure"] as const) {
        const error = new ActivitySigningError({ code });
        assert.strictEqual(error._tag, "ActivitySigningError");
        assert.strictEqual(error.code, code);
      }
      for (const code of ["request-failure", "response-failure", "timeout", "interrupted"] as const) {
        const error = new ActivityIngressError({ code });
        assert.strictEqual(error._tag, "ActivityIngressError");
        assert.strictEqual(error.code, code);
      }
    }),
  );
});
