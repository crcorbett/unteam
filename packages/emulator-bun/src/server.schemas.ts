import {
  BotAppSpec,
  BotAppId,
  BotConnectorProfile,
  ConnectionId,
  ConnectorOutcome,
  ConversationId,
  InstallationState,
  ServicePath,
  SigningKeyId,
  SigningKeySpec,
  TenantId,
  UserId,
} from "@unteam/emulator-core/schemas";
import { Schema } from "effect";

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Text = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(256));

export const ServerPort = PositiveInt.check(Schema.isLessThanOrEqualTo(65_535)).pipe(
  Schema.brand("@unteam/emulator-bun/ServerPort"),
);
export type ServerPort = typeof ServerPort.Type;

export const UnteamLoopbackUrl = Schema.URLFromString.check(
  Schema.makeFilter(
    (value: URL) =>
      value.protocol === "http:" &&
      (value.hostname === "127.0.0.1" || value.hostname === "[::1]") &&
      value.username.length === 0 &&
      value.password.length === 0,
    { description: "a loopback HTTP URL without user information" },
  ),
).pipe(Schema.brand("@unteam/emulator-bun/UnteamLoopbackUrl"));
export type UnteamLoopbackUrl = typeof UnteamLoopbackUrl.Type;

export const ServerConnectionSpec = Schema.Struct({
  connectionId: ConnectionId,
  tenantId: TenantId,
  userId: UserId,
  conversationId: ConversationId,
  servicePath: ServicePath,
  installation: InstallationState,
  connectorOutcome: ConnectorOutcome,
  signingKeyId: SigningKeyId,
});
export type ServerConnectionSpec = Schema.Schema.Type<typeof ServerConnectionSpec>;

export const ServerScenarioV1 = Schema.Struct({
  scenarioVersion: Schema.Literal("scenario.v1"),
  name: Text,
  profile: BotConnectorProfile,
  bot: BotAppSpec,
  connections: Schema.Array(ServerConnectionSpec).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  signingKeys: Schema.Array(SigningKeySpec).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  observationCapacity: PositiveInt.check(Schema.isLessThanOrEqualTo(128)),
  initialTimeMillis: NonNegativeInt,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type ServerScenarioV1 = Schema.Schema.Type<typeof ServerScenarioV1>;

const UnteamReadyConnectionV2 = Schema.Struct({
  connectionId: ConnectionId,
  serviceUrl: UnteamLoopbackUrl,
}).annotate({ parseOptions: { onExcessProperty: "error" } });

export const UnteamReadyV2 = Schema.Struct({
  readinessVersion: Schema.Literal("unteam.ready.v2"),
  synthetic: Schema.Literal(true),
  scenarioName: Text,
  origin: UnteamLoopbackUrl,
  issuerUrl: UnteamLoopbackUrl,
  openIdMetadataUrl: UnteamLoopbackUrl,
  jwkSetUrl: UnteamLoopbackUrl,
  oauthTokenUrl: UnteamLoopbackUrl,
  controlBaseUrl: UnteamLoopbackUrl,
  botAppId: BotAppId,
  connectorScope: Text,
  connections: Schema.Array(UnteamReadyConnectionV2).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type UnteamReadyV2 = typeof UnteamReadyV2.Type;
