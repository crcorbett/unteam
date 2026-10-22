import { Duration, Effect, Schema } from "effect";
import * as SchemaIssue from "effect/SchemaIssue";

const Text = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const LongText = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(4096));
const KeyMaterialText = Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(1024));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

const boundedArray = <S extends Schema.Constraint>(item: S, maximum: number) =>
  Schema.Array(item).check(Schema.isMaxLength(maximum));

export const TenantId = Text.pipe(Schema.brand("TenantId"));
export type TenantId = Schema.Schema.Type<typeof TenantId>;

export const BotAppId = Text.pipe(Schema.brand("BotAppId"));
export type BotAppId = Schema.Schema.Type<typeof BotAppId>;

export const UserId = Text.pipe(Schema.brand("UserId"));
export type UserId = Schema.Schema.Type<typeof UserId>;

export const ConversationId = Text.pipe(Schema.brand("ConversationId"));
export type ConversationId = Schema.Schema.Type<typeof ConversationId>;

export const ActivityId = Text.pipe(Schema.brand("ActivityId"));
export type ActivityId = Schema.Schema.Type<typeof ActivityId>;

export const ConnectionId = Text.pipe(Schema.brand("ConnectionId"));
export type ConnectionId = Schema.Schema.Type<typeof ConnectionId>;

export const SigningKeyId = Text.pipe(Schema.brand("SigningKeyId"));
export type SigningKeyId = Schema.Schema.Type<typeof SigningKeyId>;

export const OperationId = Text.pipe(Schema.brand("OperationId"));
export type OperationId = Schema.Schema.Type<typeof OperationId>;

export const ObservationId = Text.pipe(Schema.brand("ObservationId"));
export type ObservationId = Schema.Schema.Type<typeof ObservationId>;

export const LoopbackUrl = Schema.URLFromString.pipe(Schema.brand("LoopbackUrl"));
export type LoopbackUrl = Schema.Schema.Type<typeof LoopbackUrl>;

export const ServiceUrl = Schema.URLFromString.pipe(Schema.brand("ServiceUrl"));
export type ServiceUrl = Schema.Schema.Type<typeof ServiceUrl>;

export const ServicePath = Text.check(
  Schema.makeFilter(
    (value: string) =>
      value.startsWith("/") &&
      value.endsWith("/") &&
      !value.includes("//") &&
      !value.includes("\\") &&
      !value.includes("%") &&
      !value.includes("?") &&
      !value.includes("#") &&
      !value.split("/").some((segment) => segment === "." || segment === ".."),
    { description: "a canonical absolute connector service path ending in a slash" },
  ),
).pipe(Schema.brand("ServicePath"));
export type ServicePath = Schema.Schema.Type<typeof ServicePath>;

export const DurationFromMillis = Schema.DurationFromMillis.check(
  Schema.makeFilter<Duration.Duration>(
    (duration) => Duration.isFinite(duration) && Duration.isPositive(duration),
  ),
);
export type SimulationDuration = Schema.Schema.Type<typeof DurationFromMillis>;

export const SecretText = Schema.RedactedFromValue(Text, { disallowEncode: true });
export type SecretText = Schema.Schema.Type<typeof SecretText>;

export const BotConnectorProfile = Schema.Struct({
  protocol: Schema.Literal("bot-connector"),
  revision: Schema.Literal("v3"),
  capabilities: boundedArray(
    Schema.Literals([
      "openid-metadata",
      "jwk-selection",
      "oauth-client-credentials",
      "send-activity",
      "signed-activity-delivery",
      "bounded-observations",
      "synthetic-installation",
    ]),
    16,
  ),
});
export type BotConnectorProfile = Schema.Schema.Type<typeof BotConnectorProfile>;

export const SigningKeySpec = Schema.Struct({
  keyId: SigningKeyId,
  endorsements: boundedArray(Text, 8),
});
export type SigningKeySpec = Schema.Schema.Type<typeof SigningKeySpec>;

export const InstallationState = Schema.Literals(["installed", "uninstalled", "blocked"]);
export type InstallationState = Schema.Schema.Type<typeof InstallationState>;

export const ConnectorOutcome = Schema.Union([
  Schema.Literal("success"),
  Schema.Literal("unauthorized"),
  Schema.Literal("forbidden"),
  Schema.Literal("not-found"),
  Schema.Literal("conflict"),
  Schema.Literal("throttled"),
  Schema.Literal("transient-failure"),
  Schema.Literal("malformed-response"),
  Schema.Literal("timeout"),
  Schema.Literal("interrupted"),
  Schema.Literal("uncertain"),
]);
export type ConnectorOutcome = Schema.Schema.Type<typeof ConnectorOutcome>;

export const BotAppSpec = Schema.Struct({
  botAppId: BotAppId,
  clientSecret: SecretText,
  scope: Text,
});
export type BotAppSpec = Schema.Schema.Type<typeof BotAppSpec>;

export const ConnectionSpec = Schema.Struct({
  connectionId: ConnectionId,
  tenantId: TenantId,
  userId: UserId,
  conversationId: ConversationId,
  serviceUrl: ServiceUrl,
  installation: InstallationState,
  connectorOutcome: ConnectorOutcome,
  signingKeyId: SigningKeyId,
});
export type ConnectionSpec = Schema.Schema.Type<typeof ConnectionSpec>;

export const ScenarioV1 = Schema.Struct({
  scenarioVersion: Schema.Literal("scenario.v1"),
  name: Text,
  profile: BotConnectorProfile,
  bot: BotAppSpec,
  connections: Schema.Array(ConnectionSpec).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  signingKeys: Schema.Array(SigningKeySpec).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  observationCapacity: PositiveInt.check(Schema.isLessThanOrEqualTo(128)),
  initialTimeMillis: NonNegativeInt,
});
export type ScenarioV1 = Schema.Schema.Type<typeof ScenarioV1>;

// Standalone-server wire values belong to core so the Bun host and HTTP client
// share one versioned contract without depending on each other's runtime.
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
export type ServerConnectionSpec = typeof ServerConnectionSpec.Type;

export const ServerScenarioV1 = Schema.Struct({
  scenarioVersion: Schema.Literal("scenario.v1"),
  name: Text,
  profile: BotConnectorProfile,
  bot: BotAppSpec,
  connections: Schema.Array(ServerConnectionSpec).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  signingKeys: Schema.Array(SigningKeySpec).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  observationCapacity: PositiveInt.check(Schema.isLessThanOrEqualTo(128)),
  initialTimeMillis: NonNegativeInt,
});
export type ServerScenarioV1 = typeof ServerScenarioV1.Type;

const UnteamReadyConnectionV2 = Schema.Struct({
  connectionId: ConnectionId,
  serviceUrl: UnteamLoopbackUrl,
});

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
});
export type UnteamReadyV2 = typeof UnteamReadyV2.Type;

export const ActivityDeliveryClaims = Schema.Struct({
  audience: Schema.optionalKey(BotAppId),
  tokenServiceUrl: Schema.optionalKey(ServiceUrl),
  activityServiceUrl: Schema.optionalKey(ServiceUrl),
  tenantId: Schema.optionalKey(TenantId),
  userId: Schema.optionalKey(UserId),
  conversationId: Schema.optionalKey(ConversationId),
});
export type ActivityDeliveryClaims = Schema.Schema.Type<typeof ActivityDeliveryClaims>;

export const DeliverActivity = Schema.Struct({
  controlVersion: Schema.Literal("control.v1"),
  kind: Schema.Literal("deliver-activity"),
  operationId: OperationId,
  connectionId: ConnectionId,
  activityId: ActivityId,
  text: LongText,
  ingressUrl: LoopbackUrl,
  replayPolicy: Schema.optionalKey(Schema.Literals(["deduplicate", "deliver"])),
  signingKeyId: Schema.optionalKey(SigningKeyId),
  claims: Schema.optionalKey(ActivityDeliveryClaims),
});
export type DeliverActivity = Schema.Schema.Type<typeof DeliverActivity>;

export const SetInstallation = Schema.Struct({
  controlVersion: Schema.Literal("control.v1"),
  kind: Schema.Literal("set-installation"),
  operationId: OperationId,
  connectionId: ConnectionId,
  state: InstallationState,
});
export type SetInstallation = Schema.Schema.Type<typeof SetInstallation>;

export const SetConnectorOutcome = Schema.Struct({
  controlVersion: Schema.Literal("control.v1"),
  kind: Schema.Literal("set-connector-outcome"),
  operationId: OperationId,
  connectionId: ConnectionId,
  outcome: ConnectorOutcome,
});
export type SetConnectorOutcome = Schema.Schema.Type<typeof SetConnectorOutcome>;

export const SelectSigningKey = Schema.Struct({
  controlVersion: Schema.Literal("control.v1"),
  kind: Schema.Literal("select-signing-key"),
  operationId: OperationId,
  connectionId: ConnectionId,
  keyId: SigningKeyId,
});
export type SelectSigningKey = Schema.Schema.Type<typeof SelectSigningKey>;

export const AdvanceSimulationTime = Schema.Struct({
  controlVersion: Schema.Literal("control.v1"),
  kind: Schema.Literal("advance-time"),
  operationId: OperationId,
  duration: DurationFromMillis,
});
export type AdvanceSimulationTime = Schema.Schema.Type<typeof AdvanceSimulationTime>;

export const ResetControl = Schema.Struct({
  controlVersion: Schema.Literal("control.v1"),
  kind: Schema.Literal("reset"),
  operationId: OperationId,
});
export type ResetControl = Schema.Schema.Type<typeof ResetControl>;

export const ControlRequest = Schema.Union([
  DeliverActivity,
  SetInstallation,
  SetConnectorOutcome,
  SelectSigningKey,
  AdvanceSimulationTime,
  ResetControl,
]);
export type ControlRequest = Schema.Schema.Type<typeof ControlRequest>;

export const ReceiptKind = Schema.Literals([
  "delivery",
  "installation",
  "connector-outcome",
  "signing-key",
  "advance-time",
  "reset",
]);

export const ControlReceiptV1 = Schema.Struct({
  receiptVersion: Schema.Literal("receipt.v1"),
  operationId: OperationId,
  kind: ReceiptKind,
  accepted: Schema.Boolean,
});
export type ControlReceiptV1 = Schema.Schema.Type<typeof ControlReceiptV1>;

export const DeliveryResult = Schema.Literals([
  "delivered",
  "duplicate",
  "rejected",
  "uncertain",
  "provider-failure",
]);

export const DeliveryReceiptV1 = Schema.Struct({
  receiptVersion: Schema.Literal("receipt.v1"),
  operationId: OperationId,
  activityId: ActivityId,
  connectionId: ConnectionId,
  result: DeliveryResult,
  status: Schema.Int.check(Schema.isGreaterThanOrEqualTo(200), Schema.isLessThan(600)),
  attempts: NonNegativeInt,
  observationId: ObservationId,
});
export type DeliveryReceiptV1 = Schema.Schema.Type<typeof DeliveryReceiptV1>;

export const ObservationKind = Schema.Literals([
  "delivery",
  "connector-request",
  "oauth-request",
  "rejected-control",
  "replay",
]);
export type ObservationKind = Schema.Schema.Type<typeof ObservationKind>;

export const ObservationV1 = Schema.Struct({
  observationVersion: Schema.Literal("observation.v1"),
  observationId: ObservationId,
  kind: ObservationKind,
  connectionId: Schema.optionalKey(ConnectionId),
  status: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(100), Schema.isLessThan(600))),
  detail: Schema.Literals([
    "accepted",
    "duplicate",
    "invalid-target",
    "missing-token",
    "expired-token",
    "invalid-client",
    "invalid-scope",
    "unknown-connection",
    "blocked-installation",
    "uninstalled",
    "conversation-conflict",
    "malformed-activity",
    "throttled",
    "transient-failure",
    "malformed-response",
    "timeout",
    "interrupted",
    "uncertain",
  ]),
});
export type ObservationV1 = Schema.Schema.Type<typeof ObservationV1>;

export const ObservationSummaryV1 = Schema.Struct({
  observationVersion: Schema.Literal("observation.v1"),
  capacity: PositiveInt,
  total: NonNegativeInt,
  truncated: Schema.Boolean,
  items: boundedArray(ObservationV1, 128),
});
export type ObservationSummaryV1 = Schema.Schema.Type<typeof ObservationSummaryV1>;

export const ConnectorRequestV1 = Schema.Struct({
  connectionId: ConnectionId,
  conversationId: ConversationId,
  text: LongText,
});
export type ConnectorRequestV1 = Schema.Schema.Type<typeof ConnectorRequestV1>;

export const ProtocolCountersV1 = Schema.Struct({
  jwkRequestCount: NonNegativeInt,
  oauthRequestCount: NonNegativeInt,
  connectorRequestCount: NonNegativeInt,
  controlDeliveryRequestCount: NonNegativeInt,
});
export type ProtocolCountersV1 = Schema.Schema.Type<typeof ProtocolCountersV1>;

export const ConnectionSnapshotV1 = Schema.Struct({
  connectionId: ConnectionId,
  tenantId: TenantId,
  userId: UserId,
  conversationId: ConversationId,
  serviceUrl: ServiceUrl,
  installation: InstallationState,
  connectorOutcome: ConnectorOutcome,
  selectedSigningKeyId: SigningKeyId,
});

export const EmulatorSnapshotV1 = Schema.Struct({
  snapshotVersion: Schema.Literal("snapshot.v1"),
  profile: BotConnectorProfile,
  botAppId: BotAppId,
  simulatedAtMillis: NonNegativeInt,
  connections: Schema.Array(ConnectionSnapshotV1).check(Schema.isMaxLength(64)),
  activeTokenCount: NonNegativeInt,
  prunedTokenCount: NonNegativeInt,
  seenActivityCount: NonNegativeInt,
  protocol: ProtocolCountersV1,
  connectorRequests: boundedArray(ConnectorRequestV1, 128),
  observations: ObservationSummaryV1,
});
export type EmulatorSnapshotV1 = Schema.Schema.Type<typeof EmulatorSnapshotV1>;

export const ProtocolJwk = Schema.Struct({
  kty: Schema.Literal("RSA"),
  kid: SigningKeyId,
  use: Schema.Literal("sig"),
  alg: Schema.Literal("RS256"),
  endorsements: boundedArray(Text, 8),
  n: KeyMaterialText,
  e: KeyMaterialText,
});
export type ProtocolJwk = Schema.Schema.Type<typeof ProtocolJwk>;

export const OpenIdDocumentV1 = Schema.Struct({
  protocolVersion: Schema.Literal("protocol.v1"),
  jwks_uri: Schema.URLFromString,
});
export type OpenIdDocumentV1 = Schema.Schema.Type<typeof OpenIdDocumentV1>;

export const JwkSetV1 = Schema.Struct({
  protocolVersion: Schema.Literal("protocol.v1"),
  keys: Schema.Array(ProtocolJwk).check(Schema.isMaxLength(16)),
});
export type JwkSetV1 = Schema.Schema.Type<typeof JwkSetV1>;

export const OAuthTokenResponseV1 = Schema.Struct({
  protocolVersion: Schema.Literal("protocol.v1"),
  access_token: Text,
  token_type: Schema.Literal("Bearer"),
  expires_in: PositiveInt,
});
export type OAuthTokenResponseV1 = Schema.Schema.Type<typeof OAuthTokenResponseV1>;

export const ConnectorActivity = Schema.Struct({
  type: Schema.Literal("message"),
  id: ActivityId,
  timestamp: Schema.String,
  serviceUrl: ServiceUrl,
  channelId: Schema.Literal("msteams"),
  channelData: Schema.Struct({ tenant: Schema.Struct({ id: TenantId }) }),
  from: Schema.Struct({ aadObjectId: UserId }),
  conversation: Schema.Struct({ id: ConversationId }),
  recipient: Schema.Struct({ id: BotAppId }),
  text: LongText,
});
export type ConnectorActivity = Schema.Schema.Type<typeof ConnectorActivity>;

export const ConnectorSendRequest = Schema.Struct({
  type: Schema.Literal("message"),
  text: LongText,
  conversation: Schema.Struct({ id: ConversationId }),
});
export type ConnectorSendRequest = Schema.Schema.Type<typeof ConnectorSendRequest>;

export const ConnectorSendResponse = Schema.Struct({
  protocolVersion: Schema.Literal("protocol.v1"),
  id: ActivityId,
});
export type ConnectorSendResponse = Schema.Schema.Type<typeof ConnectorSendResponse>;

export const ProtocolErrorResponseV1 = Schema.Struct({
  errorVersion: Schema.Literal("control-error.v1"),
  code: Schema.Literals([
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
  ]),
});
export type ProtocolErrorResponseV1 = Schema.Schema.Type<typeof ProtocolErrorResponseV1>;

const exactObject = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

export const decodeExact = <S extends Schema.Constraint>(
  schema: S,
  keys: readonly string[],
  input: unknown,
): Effect.Effect<S["Type"], Schema.SchemaError, S["DecodingServices"]> => {
  if (exactObject(input)) {
    const extra = Object.keys(input).find((key) => !keys.includes(key));
    if (extra !== undefined) {
      return Effect.fail(
        new Schema.SchemaError(new SchemaIssue.InvalidValue({ message: "unexpected property" })),
      );
    }
  }
  return Schema.decodeUnknownEffect(schema)(input);
};

export const scenarioKeys = [
  "scenarioVersion",
  "name",
  "profile",
  "bot",
  "connections",
  "signingKeys",
  "observationCapacity",
  "initialTimeMillis",
] as const;

export const deliverActivityKeys = [
  "controlVersion",
  "kind",
  "operationId",
  "connectionId",
  "activityId",
  "text",
  "ingressUrl",
  "replayPolicy",
  "signingKeyId",
  "claims",
] as const;

export const setInstallationKeys = [
  "controlVersion",
  "kind",
  "operationId",
  "connectionId",
  "state",
] as const;
export const setConnectorOutcomeKeys = [
  "controlVersion",
  "kind",
  "operationId",
  "connectionId",
  "outcome",
] as const;
export const selectSigningKeyKeys = [
  "controlVersion",
  "kind",
  "operationId",
  "connectionId",
  "keyId",
] as const;
export const advanceTimeKeys = ["controlVersion", "kind", "operationId", "duration"] as const;
export const resetKeys = ["controlVersion", "kind", "operationId"] as const;
