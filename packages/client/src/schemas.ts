import { UnteamLoopbackUrl } from "@unteam/emulator-core/schemas";
import { Schema } from "effect";

export {
  AdvanceSimulationTime,
  ConnectionId,
  ConnectorOutcome,
  ConnectorRequestV1,
  ControlReceiptV1,
  DeliverActivity,
  DeliveryReceiptV1,
  EmulatorSnapshotV1,
  JwkSetV1,
  OpenIdDocumentV1,
  ResetControl,
  SelectSigningKey,
  ServicePath,
  ServerScenarioV1,
  SetConnectorOutcome,
  SetInstallation,
  SigningKeyId,
  UnteamLoopbackUrl,
  UnteamReadyV2,
} from "@unteam/emulator-core/schemas";

export const UnteamOrigin = UnteamLoopbackUrl.check(
  Schema.makeFilter((value: URL) => value.pathname === "/" && value.search === "" && value.hash === "", {
    description: "a loopback HTTP origin without a path, query or fragment",
  }),
).pipe(Schema.brand("@unteam/client/UnteamOrigin"));
export type UnteamOrigin = typeof UnteamOrigin.Type;

export const UnteamConnectionConfig = Schema.Struct({
  origin: UnteamOrigin,
  readinessTimeoutMillis: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(60_000)),
});
export type UnteamConnectionConfig = typeof UnteamConnectionConfig.Type;
