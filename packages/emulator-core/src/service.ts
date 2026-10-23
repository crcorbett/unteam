import { Context, type Effect } from "effect";
import type { EmulatorControlError, EmulatorDeliveryError } from "./errors";
import type {
  AdvanceSimulationTime,
  ControlReceiptV1,
  DeliverActivity,
  DeliveryReceiptV1,
  EmulatorSnapshotV1,
  ObservationSummaryV1,
  ResetControl,
  SelectSigningKey,
  SetConnectorOutcome,
  SetInstallation,
} from "./schemas";
export interface TeamsEmulatorService {
  readonly origin: Effect.Effect<URL>;
  readonly deliverActivity: (
    request: DeliverActivity,
  ) => Effect.Effect<DeliveryReceiptV1, EmulatorDeliveryError>;
  readonly setInstallation: (
    request: SetInstallation,
  ) => Effect.Effect<ControlReceiptV1, EmulatorControlError>;
  readonly setConnectorOutcome: (
    request: SetConnectorOutcome,
  ) => Effect.Effect<ControlReceiptV1, EmulatorControlError>;
  readonly selectSigningKey: (
    request: SelectSigningKey,
  ) => Effect.Effect<ControlReceiptV1, EmulatorControlError>;
  readonly advanceTime: (
    request: AdvanceSimulationTime,
  ) => Effect.Effect<ControlReceiptV1, EmulatorControlError>;
  readonly snapshot: Effect.Effect<EmulatorSnapshotV1>;
  readonly observations: Effect.Effect<ObservationSummaryV1>;
  readonly reset: (request: ResetControl) => Effect.Effect<ControlReceiptV1, EmulatorControlError>;
}
export class TeamsEmulator extends Context.Service<TeamsEmulator, TeamsEmulatorService>()(
  "@unteam/emulator-core/TeamsEmulator",
) {}
