import { Context, Effect, Exit, Option, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import type { ActivitySignerService } from "./internal/activity-signer";
import type { ProtocolStateService } from "./internal/protocol-state";
import { EmulatorControlError, EmulatorDeliveryError } from "./errors";
import {
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
  ConnectorActivity,
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

const safeLoopback = (url: URL): boolean =>
  url.protocol === "http:" &&
  (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]") &&
  url.username === "" &&
  url.password === "" &&
  url.hash === "";

const acceptedStatus = (status: number): number => (status >= 100 && status <= 599 ? status : 599);

const receiptKind = {
  installation: "installation",
  connector: "connector-outcome",
  signingKey: "signing-key",
  time: "advance-time",
  reset: "reset",
} as const;

const controlReceipt = (operationId: ControlReceiptV1["operationId"], kind: ControlReceiptV1["kind"]) =>
  ({ receiptVersion: "receipt.v1", operationId, kind, accepted: true }) satisfies ControlReceiptV1;

const deliveryError = (code: EmulatorDeliveryError["code"]) => new EmulatorDeliveryError({ code });

const mapControlError = (error: EmulatorControlError): EmulatorControlError => error;

export const makeTeamsEmulatorService = (
  origin: URL,
  state: ProtocolStateService,
  signer: ActivitySignerService,
  client: HttpClient.HttpClient | undefined,
): TeamsEmulatorService => {
  const deliverActivity = (request: DeliverActivity) =>
    Effect.gen(function* () {
      const connection = yield* state.readConnection(request.connectionId);
      if (Option.isNone(connection)) return yield* deliveryError("unknown-connection");
      if (connection.value.installation === "blocked") return yield* deliveryError("blocked-installation");
      if (connection.value.installation === "uninstalled") return yield* deliveryError("uninstalled");
      if (!safeLoopback(request.ingressUrl)) {
        yield* state.recordObservation({
          kind: "delivery",
          detail: "invalid-target",
          connectionId: request.connectionId,
          status: 400,
        });
        return yield* deliveryError("invalid-loopback-target");
      }

      const seen = yield* state.markActivity(request.activityId);
      if (seen === "duplicate") {
        const observationId = yield* state.recordObservation({
          kind: "replay",
          detail: "duplicate",
          connectionId: request.connectionId,
          status: 200,
        });
        return {
          receiptVersion: "receipt.v1",
          operationId: request.operationId,
          activityId: request.activityId,
          connectionId: request.connectionId,
          result: "duplicate",
          status: 200,
          attempts: 0,
          observationId,
        } satisfies DeliveryReceiptV1;
      }

      const nowMillis = yield* state.now;
      const keyId = yield* state
        .readSelectedSigningKey(request.connectionId)
        .pipe(Effect.mapError(() => deliveryError("signing-failure")));
      const signed = yield* signer
        .sign({
          keyId,
          issuer: origin,
          audience: state.scenario.bot.botAppId,
          serviceUrl: connection.value.serviceUrl,
          tenantId: connection.value.tenantId,
          userId: connection.value.userId,
          conversationId: connection.value.conversationId,
          activityId: request.activityId,
          text: request.text,
          nowMillis,
        })
        .pipe(Effect.mapError(() => deliveryError("signing-failure")));
      const encodedActivity = yield* Schema.encodeUnknownEffect(ConnectorActivity)(signed.activity).pipe(
        Effect.mapError(() => deliveryError("signing-failure")),
      );
      if (client === undefined) {
        const observationId = yield* state.recordObservation({
          kind: "delivery",
          detail: "uncertain",
          connectionId: request.connectionId,
          status: 599,
        });
        return {
          receiptVersion: "receipt.v1",
          operationId: request.operationId,
          activityId: request.activityId,
          connectionId: request.connectionId,
          result: "uncertain",
          status: 599,
          attempts: 0,
          observationId,
        } satisfies DeliveryReceiptV1;
      }
      const outbound = HttpClientRequest.post(request.ingressUrl).pipe(
        HttpClientRequest.setHeaders({
          authorization: `Bearer ${signed.token}`,
          "content-type": "application/json",
        }),
        HttpClientRequest.bodyJsonUnsafe(encodedActivity),
      );
      const response = yield* Effect.exit(client.execute(outbound));
      if (Exit.isFailure(response)) {
        const observationId = yield* state.recordObservation({
          kind: "delivery",
          detail: "uncertain",
          connectionId: request.connectionId,
          status: 599,
        });
        return {
          receiptVersion: "receipt.v1",
          operationId: request.operationId,
          activityId: request.activityId,
          connectionId: request.connectionId,
          result: "uncertain",
          status: 599,
          attempts: 1,
          observationId,
        } satisfies DeliveryReceiptV1;
      }
      const status = acceptedStatus(response.value.status);
      const result = status >= 200 && status < 300 ? "delivered" : "provider-failure";
      const detail = status >= 200 && status < 300 ? "accepted" : "uncertain";
      const observationId = yield* state.recordObservation({
        kind: "delivery",
        detail,
        connectionId: request.connectionId,
        status,
      });
      return {
        receiptVersion: "receipt.v1",
        operationId: request.operationId,
        activityId: request.activityId,
        connectionId: request.connectionId,
        result,
        status,
        attempts: 1,
        observationId,
      } satisfies DeliveryReceiptV1;
    });

  const setInstallation = (request: SetInstallation) =>
    state.setInstallation(request.connectionId, request.state).pipe(
      Effect.map(() => controlReceipt(request.operationId, receiptKind.installation)),
      Effect.mapError(mapControlError),
    );

  const setConnectorOutcome = (request: SetConnectorOutcome) =>
    state.setConnectorOutcome(request.connectionId, request.outcome).pipe(
      Effect.map(() => controlReceipt(request.operationId, receiptKind.connector)),
      Effect.mapError(mapControlError),
    );

  const selectSigningKey = (request: SelectSigningKey) =>
    state.selectSigningKey(request.connectionId, request.keyId).pipe(
      Effect.map(() => controlReceipt(request.operationId, receiptKind.signingKey)),
      Effect.mapError(mapControlError),
    );

  const advanceTime = (request: AdvanceSimulationTime) =>
    state.advance(request.duration).pipe(
      Effect.map(() => controlReceipt(request.operationId, receiptKind.time)),
      Effect.mapError(mapControlError),
    );

  const reset = (request: ResetControl) =>
    state.reset.pipe(
      Effect.map(() => controlReceipt(request.operationId, receiptKind.reset)),
      Effect.mapError(mapControlError),
    );

  return {
    origin: Effect.succeed(origin),
    deliverActivity,
    setInstallation,
    setConnectorOutcome,
    selectSigningKey,
    advanceTime,
    snapshot: state.snapshot,
    observations: state.snapshot.pipe(Effect.map((snapshot) => snapshot.observations)),
    reset,
  } satisfies TeamsEmulatorService;
};
