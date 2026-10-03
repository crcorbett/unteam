import { Context } from "effect";
import type { Effect } from "effect";

import type { UnteamClientError } from "./errors";
import type {
  AdvanceSimulationTime,
  ControlReceiptV1,
  DeliverActivity,
  DeliveryReceiptV1,
  EmulatorSnapshotV1,
  ResetControl,
  SelectSigningKey,
  SetConnectorOutcome,
  SetInstallation,
  UnteamReadyV2,
} from "./schemas";

export interface IUnteamClient {
  readonly readiness: UnteamReadyV2;
  readonly deliverActivity: (body: DeliverActivity) => Effect.Effect<DeliveryReceiptV1, UnteamClientError>;
  readonly setInstallation: (body: SetInstallation) => Effect.Effect<ControlReceiptV1, UnteamClientError>;
  readonly setConnectorOutcome: (
    body: SetConnectorOutcome,
  ) => Effect.Effect<ControlReceiptV1, UnteamClientError>;
  readonly selectSigningKey: (body: SelectSigningKey) => Effect.Effect<ControlReceiptV1, UnteamClientError>;
  readonly advanceTime: (body: AdvanceSimulationTime) => Effect.Effect<ControlReceiptV1, UnteamClientError>;
  readonly reset: (body: ResetControl) => Effect.Effect<ControlReceiptV1, UnteamClientError>;
  readonly snapshot: () => Effect.Effect<EmulatorSnapshotV1, UnteamClientError>;
}

export class UnteamClient extends Context.Service<UnteamClient, IUnteamClient>()(
  "@unteam/client/UnteamClient",
) {}
