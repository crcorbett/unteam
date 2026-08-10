import { Redacted } from "effect";

import {
  BotAppId,
  BotConnectorProfile,
  ConnectionId,
  ConversationId,
  ScenarioV1,
  ServiceUrl,
  SigningKeyId,
  TenantId,
  UserId,
} from "./schemas";

export const exampleScenario: ScenarioV1 = {
  scenarioVersion: "scenario.v1",
  name: "two-tenant-loopback",
  profile: {
    protocol: "bot-connector",
    revision: "v3",
    capabilities: [
      "openid-metadata",
      "jwk-selection",
      "oauth-client-credentials",
      "send-activity",
      "signed-activity-delivery",
      "bounded-observations",
      "synthetic-installation",
    ],
  } satisfies typeof BotConnectorProfile.Type,
  bot: {
    botAppId: BotAppId.make("33333333-3333-4333-8333-333333333333"),
    clientSecret: Redacted.make("synthetic-client-secret"),
    scope: "https://api.botframework.com/.default",
  },
  connections: [
    {
      connectionId: ConnectionId.make("connection-a"),
      tenantId: TenantId.make("11111111-1111-4111-8111-111111111111"),
      userId: UserId.make("22222222-2222-4222-8222-222222222222"),
      conversationId: ConversationId.make("conversation-a"),
      serviceUrl: ServiceUrl.make(new URL("https://smba.trafficmanager.net/emea/")),
      installation: "installed",
      connectorOutcome: "success",
      signingKeyId: SigningKeyId.make("key-a"),
    },
    {
      connectionId: ConnectionId.make("connection-b"),
      tenantId: TenantId.make("44444444-4444-4444-8444-444444444444"),
      userId: UserId.make("55555555-5555-4555-8555-555555555555"),
      conversationId: ConversationId.make("conversation-b"),
      serviceUrl: ServiceUrl.make(new URL("https://smba.trafficmanager.net/amer/")),
      installation: "installed",
      connectorOutcome: "success",
      signingKeyId: SigningKeyId.make("key-b"),
    },
  ],
  signingKeys: [
    { keyId: SigningKeyId.make("key-a"), endorsements: ["msteams"] },
    { keyId: SigningKeyId.make("key-b"), endorsements: ["msteams"] },
  ],
  observationCapacity: 32,
  initialTimeMillis: 1_700_000_000_000,
};
