import {
  BotAppSpec,
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
