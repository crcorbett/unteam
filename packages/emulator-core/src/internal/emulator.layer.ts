import type { TrafficEventData } from "../events";
import { Data } from "effect";
import { Effect, Layer, Exit, Option, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { TrafficEvents, type TrafficEventsService } from "../events";
import { ActivitySigner, type ActivitySignerService } from "./activity-signer";
import { ProtocolState, type ProtocolStateService } from "./protocol-state";
import { EmulatorDeliveryError } from "../errors";
import {
  AdvanceSimulationTime,
  ControlReceiptV1,
  DeliverActivity,
  DeliveryReceiptV1,
  ResetControl,
  SelectSigningKey,
  SetConnectorOutcome,
  SetInstallation,
  ConnectorActivity,
} from "../schemas";
import { EmulatorConfiguration } from "../configuration";
import { TeamsEmulator, type TeamsEmulatorService } from "../service";
const safeLoopback = (url: URL): boolean =>
  url.protocol === "http:" &&
  (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]") &&
  url.username === "" &&
  url.password === "" &&
  url.hash === "";
const acceptedStatus = (status: number): number => {
  if (status >= 100 && status <= 599) return status;
  return 599;
};
const receiptKind = {
  installation: "installation",
  connector: "connector-outcome",
  signingKey: "signing-key",
  time: "advance-time",
  reset: "reset",
} as const;
const controlReceipt = (operationId: ControlReceiptV1["operationId"], kind: ControlReceiptV1["kind"]) =>
  ({
    receiptVersion: "receipt.v1",
    operationId,
    kind,
    accepted: true,
  }) satisfies ControlReceiptV1;
const deliveryError = (code: EmulatorDeliveryError["code"]) =>
  new EmulatorDeliveryError({
    code,
  });
const makeTeamsEmulatorService = (
  origin: URL,
  state: ProtocolStateService,
  signer: ActivitySignerService,
  client: Option.Option<HttpClient.HttpClient>,
  events: TrafficEventsService = {
    record: () => Effect.void,
  },
): TeamsEmulatorService => {
  const deliverActivity = Effect.fnUntraced(function* (request: DeliverActivity) {
    if (!safeLoopback(request.ingressUrl)) {
      yield* state.recordObservation({
        kind: "delivery",
        detail: "invalid-target",
        connectionId: request.connectionId,
        status: 400,
      });
      return yield* deliveryError("invalid-loopback-target");
    }
    yield* state.recordControlDelivery;
    const connection = yield* state.readConnection(request.connectionId);
    if (Option.isNone(connection)) return yield* deliveryError("unknown-connection");
    if (connection.value.installation === "blocked") return yield* deliveryError("blocked-installation");
    if (connection.value.installation === "uninstalled") return yield* deliveryError("uninstalled");
    const seen = yield* state.markActivity(request.activityId);
    if (seen === "duplicate" && request.replayPolicy !== "deliver") {
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
    const keyId =
      request.signingKeyId ??
      (yield* state
        .readSelectedSigningKey(request.connectionId)
        .pipe(Effect.mapError(() => deliveryError("signing-failure"))));
    const signed = yield* signer
      .sign({
        keyId,
        issuer: origin,
        audience: request.claims?.audience ?? state.scenario.bot.botAppId,
        tokenServiceUrl: request.claims?.tokenServiceUrl ?? connection.value.serviceUrl,
        activityServiceUrl: request.claims?.activityServiceUrl ?? connection.value.serviceUrl,
        tenantId: request.claims?.tenantId ?? connection.value.tenantId,
        userId: request.claims?.userId ?? connection.value.userId,
        conversationId: request.claims?.conversationId ?? connection.value.conversationId,
        activityId: request.activityId,
        text: request.text,
        nowMillis,
      })
      .pipe(Effect.mapError(() => deliveryError("signing-failure")));
    const encodedActivity = yield* Schema.encodeUnknownEffect(ConnectorActivity)(signed.activity).pipe(
      Effect.mapError(() => deliveryError("signing-failure")),
    );
    if (Option.isNone(client)) {
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
    const message = Data.taggedEnum<
      Omit<(typeof TrafficEventData.members)[2]["Type"], "phase" | "status">
    >().Message({
      botAppId: state.scenario.bot.botAppId,
      direction: "sent",
      connectionId: connection.value.connectionId,
      tenantId: connection.value.tenantId,
      userId: connection.value.userId,
      conversationId: connection.value.conversationId,
      activityId: Option.some(request.activityId),
      text: request.text,
    });
    yield* events.record({
      ...message,
      phase: "started",
      status: Option.none(),
    });
    const outbound = HttpClientRequest.post(request.ingressUrl).pipe(
      HttpClientRequest.setHeaders({
        authorization: `Bearer ${signed.token}`,
        "content-type": "application/json",
      }),
      HttpClientRequest.bodyJsonUnsafe(encodedActivity),
    );
    const response = yield* Effect.exit(
      client.value.execute(outbound).pipe(
        Effect.onInterrupt(() =>
          events.record({
            ...message,
            phase: "interrupted",
            status: Option.none(),
          }),
        ),
      ),
    );
    if (Exit.isFailure(response)) {
      yield* events.record({
        ...message,
        phase: "uncertain",
        status: Option.none(),
      });
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
    yield* events.record({
      ...message,
      phase: (() => {
        if (status >= 200 && status < 300) return "accepted";
        return "rejected";
      })(),
      status: Option.some(status),
    });
    const result = (() => {
      if (status >= 200 && status < 300) return "delivered";
      return "provider-failure";
    })();
    const detail = (() => {
      if (status >= 200 && status < 300) return "accepted";
      return "uncertain";
    })();
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
      Effect.mapError((error) => error),
    );
  const setConnectorOutcome = (request: SetConnectorOutcome) =>
    state.setConnectorOutcome(request.connectionId, request.outcome).pipe(
      Effect.map(() => controlReceipt(request.operationId, receiptKind.connector)),
      Effect.mapError((error) => error),
    );
  const selectSigningKey = (request: SelectSigningKey) =>
    state
      .selectSigningKey({
        connectionId: request.connectionId,
        keyId: request.keyId,
      })
      .pipe(
        Effect.map(() => controlReceipt(request.operationId, receiptKind.signingKey)),
        Effect.mapError((error) => error),
      );
  const advanceTime = (request: AdvanceSimulationTime) =>
    state.advance(request.duration).pipe(
      Effect.map(() => controlReceipt(request.operationId, receiptKind.time)),
      Effect.mapError((error) => error),
    );
  const reset = (request: ResetControl) =>
    state.reset.pipe(
      Effect.tap(() =>
        events.record(
          Data.taggedEnum<TrafficEventData>().Lifecycle({
            action: "reset",
            scenario: state.scenario.name,
          }),
        ),
      ),
      Effect.map(() => controlReceipt(request.operationId, receiptKind.reset)),
      Effect.mapError((error) => error),
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
export const EmulatorServiceLive = Layer.effect(
  TeamsEmulator,
  Effect.gen(function* () {
    const { origin } = yield* EmulatorConfiguration;
    const state = yield* ProtocolState;
    const signer = yield* ActivitySigner;
    const events = yield* TrafficEvents;
    const client = yield* Effect.serviceOption(HttpClient.HttpClient);
    return makeTeamsEmulatorService(origin, state, signer, client, events);
  }),
);
