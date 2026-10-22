export { UnteamReadyV2 } from "@unteam/emulator-bun";
import { Schema } from "effect";

export const UnteamDiagnosticV1 = Schema.Struct({
  diagnosticVersion: Schema.Literal("unteam.diagnostic.v1"),
  event: Schema.Literals(["started", "startup-failed", "recording-failed"]),
  synthetic: Schema.Literal(true),
});
export type UnteamDiagnosticV1 = typeof UnteamDiagnosticV1.Type;
