import { BotAppId, ConnectionId } from "@unteam/emulator-core";
import { Schema } from "effect";

const Text = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(256));

export const UnteamLoopbackUrl = Schema.URLFromString.check(
  Schema.makeFilter(
    (value: URL) =>
      value.protocol === "http:" &&
      (value.hostname === "127.0.0.1" || value.hostname === "[::1]") &&
      value.username.length === 0 &&
      value.password.length === 0,
    { description: "a loopback HTTP URL without user information" },
  ),
).pipe(Schema.brand("@unteam/cli/UnteamLoopbackUrl"));
export type UnteamLoopbackUrl = typeof UnteamLoopbackUrl.Type;

const UnteamReadyConnectionV1 = Schema.Struct({
  connectionId: ConnectionId,
  serviceUrl: UnteamLoopbackUrl,
});

export const UnteamReadyV1 = Schema.Struct({
  readinessVersion: Schema.Literal("unteam.ready.v1"),
  synthetic: Schema.Literal(true),
  origin: UnteamLoopbackUrl,
  issuerUrl: UnteamLoopbackUrl,
  openIdMetadataUrl: UnteamLoopbackUrl,
  jwkSetUrl: UnteamLoopbackUrl,
  oauthTokenUrl: UnteamLoopbackUrl,
  controlBaseUrl: UnteamLoopbackUrl,
  botAppId: BotAppId,
  connectorScope: Text,
  connections: Schema.Array(UnteamReadyConnectionV1).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type UnteamReadyV1 = typeof UnteamReadyV1.Type;

export const UnteamDiagnosticV1 = Schema.Struct({
  diagnosticVersion: Schema.Literal("unteam.diagnostic.v1"),
  event: Schema.Literals(["started", "startup-failed"]),
  synthetic: Schema.Literal(true),
});
export type UnteamDiagnosticV1 = typeof UnteamDiagnosticV1.Type;
