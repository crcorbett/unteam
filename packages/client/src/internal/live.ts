import { Function as EffectFunction, Array as EffectArray } from "effect";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { UnteamClientError } from "../errors";
import {
  AdvanceSimulationTime,
  ControlReceiptV1,
  DeliverActivity,
  DeliveryReceiptV1,
  EmulatorSnapshotV1,
  JwkSetV1,
  OpenIdDocumentV1,
  ResetControl,
  SelectSigningKey,
  SetConnectorOutcome,
  SetInstallation,
  UnteamConnectionConfig,
  UnteamOrigin,
  UnteamReadyV2,
  type UnteamConnectionConfig as UnteamConnectionConfigType,
  type UnteamReadyV2 as UnteamReadyV2Type,
} from "../schemas";
import { UnteamClient } from "../service";
const clientError = (operation: UnteamClientError["operation"], reason: string) =>
  new UnteamClientError({
    operation,
    reason,
  });
const duration = (milliseconds: number): `${number} millis` => `${milliseconds} millis`;
const connectionConfig = Config.all({
  origin: Config.schema(UnteamOrigin, "UNTEAM_ORIGIN"),
  readinessTimeoutMillis: Config.schema(
    UnteamConnectionConfig.fields.readinessTimeoutMillis,
    "UNTEAM_READINESS_TIMEOUT_MILLIS",
  ).pipe(Config.withDefault(2_000)),
}).pipe(Config.map((input) => UnteamConnectionConfig.make(input)));
const requireSuccess = (
  response: HttpClientResponse.HttpClientResponse,
  operation: UnteamClientError["operation"],
) =>
  Effect.succeed(response).pipe(
    Effect.filterOrFail(
      (candidate) => candidate.status >= 200 && candidate.status < 300,
      () => clientError(operation, `Unteam rejected the request with status ${response.status}`),
    ),
  );
const responseBody = <A>(
  schema: Schema.Codec<A, unknown, never, never>,
  response: HttpClientResponse.HttpClientResponse,
  operation: UnteamClientError["operation"],
) =>
  HttpClientResponse.schemaBodyJson(schema, {
    onExcessProperty: "error",
  })(response).pipe(Effect.mapError(() => clientError(operation, "Unteam response failed decoding")));
const postControl = Effect.fnUntraced(function* <Request, Response>({
  client,
  url,
  requestSchema,
  body,
  responseSchema,
  operation,
}: {
  readonly client: HttpClient.HttpClient;
  readonly url: URL;
  readonly requestSchema: Schema.Codec<Request, unknown, never, never>;
  readonly body: Request;
  readonly responseSchema: Schema.Codec<Response, unknown, never, never>;
  readonly operation: UnteamClientError["operation"];
}) {
  const request = yield* HttpClientRequest.post(url).pipe(
    HttpClientRequest.schemaBodyJson(requestSchema)(body),
    Effect.mapError(() => clientError(operation, "Unteam request failed encoding")),
  );
  const response = yield* client.execute(request).pipe(
    Effect.mapError(() => clientError(operation, "Unteam request failed")),
    Effect.flatMap((received) => requireSuccess(received, operation)),
  );
  return yield* responseBody(responseSchema, response, operation);
});
const ensureConfiguredOrigin = Effect.fnUntraced(function* ({
  config,
  readiness,
}: {
  readonly config: UnteamConnectionConfigType;
  readonly readiness: UnteamReadyV2Type;
}) {
  const urls = [
    readiness.origin,
    readiness.issuerUrl,
    readiness.openIdMetadataUrl,
    readiness.jwkSetUrl,
    readiness.oauthTokenUrl,
    readiness.controlBaseUrl,
    ...EffectFunction.pipe(
      readiness.connections,
      EffectArray.map((connection) => connection.serviceUrl),
    ),
  ];
  if (readiness.origin.href !== config.origin.href) {
    return yield* clientError("readiness", "Readiness origin differs from UNTEAM_ORIGIN");
  }
  if (
    !EffectFunction.pipe(
      urls,
      EffectArray.every((url) => url.origin === config.origin.origin),
    )
  ) {
    return yield* clientError("readiness", "Readiness URLs cross loopback origins");
  }
});
const fetchReadiness = (client: HttpClient.HttpClient, config: UnteamConnectionConfigType) =>
  client.execute(HttpClientRequest.get(new URL("/ready", config.origin))).pipe(
    Effect.mapError(() => clientError("readiness", "Unteam is not reachable")),
    Effect.timeoutOrElse({
      duration: duration(config.readinessTimeoutMillis),
      orElse: () => Effect.fail(clientError("readiness", "Unteam readiness timed out")),
    }),
    Effect.flatMap((response) => requireSuccess(response, "readiness")),
    Effect.flatMap((response) => responseBody(UnteamReadyV2, response, "readiness")),
    Effect.tap((readiness) =>
      ensureConfiguredOrigin({
        config: config,
        readiness: readiness,
      }),
    ),
  );
const probeProtocol = Effect.fnUntraced(function* ({
  client,
  readiness,
}: {
  readonly client: HttpClient.HttpClient;
  readonly readiness: UnteamReadyV2Type;
}) {
  const metadataResponse = yield* client.execute(HttpClientRequest.get(readiness.openIdMetadataUrl)).pipe(
    Effect.mapError(() => clientError("readiness", "OpenID probe failed")),
    Effect.flatMap((response) => requireSuccess(response, "readiness")),
  );
  const metadata = yield* responseBody(OpenIdDocumentV1, metadataResponse, "readiness");
  if (metadata.jwks_uri.href !== readiness.jwkSetUrl.href) {
    return yield* clientError("readiness", "OpenID and readiness JWK URLs differ");
  }
  const jwkResponse = yield* client.execute(HttpClientRequest.get(readiness.jwkSetUrl)).pipe(
    Effect.mapError(() => clientError("readiness", "JWK probe failed")),
    Effect.flatMap((response) => requireSuccess(response, "readiness")),
  );
  yield* responseBody(JwkSetV1, jwkResponse, "readiness");
});
const makeUnteamClientConnection = Effect.fnUntraced(function* (readiness: UnteamReadyV2Type) {
  const client = yield* HttpClient.HttpClient;
  const controlUrl = (path: string) => new URL(path, readiness.controlBaseUrl);
  const snapshot = () =>
    client
      .execute(HttpClientRequest.get(controlUrl("snapshot")))
      .pipe(
        Effect.mapError(() => clientError("snapshot", "Unteam snapshot request failed")),
        Effect.flatMap((response) => requireSuccess(response, "snapshot")),
        Effect.flatMap((response) => responseBody(EmulatorSnapshotV1, response, "snapshot")),
      )
      .pipe(Effect.withSpan("UnteamClient.snapshot"));
  yield* probeProtocol({
    client: client,
    readiness: readiness,
  });
  yield* snapshot();
  return UnteamClient.of({
    // This imported type is plain data; the rule cannot resolve its declaration.
    // oxlint-disable-next-line effect/require-service-operation-instrumentation
    readiness,
    deliverActivity: (body: DeliverActivity) => {
      const _input = controlUrl("deliver");
      return postControl({
        client: client,
        url: _input,
        requestSchema: DeliverActivity,
        body: body,
        responseSchema: DeliveryReceiptV1,
        operation: "deliver",
      }).pipe(Effect.withSpan("UnteamClient.deliverActivity"));
    },
    setInstallation: (body: SetInstallation) => {
      const _input2 = controlUrl("installation");
      return postControl({
        client: client,
        url: _input2,
        requestSchema: SetInstallation,
        body: body,
        responseSchema: ControlReceiptV1,
        operation: "installation",
      }).pipe(Effect.withSpan("UnteamClient.setInstallation"));
    },
    setConnectorOutcome: (body: SetConnectorOutcome) => {
      const _input3 = controlUrl("connector");
      return postControl({
        client: client,
        url: _input3,
        requestSchema: SetConnectorOutcome,
        body: body,
        responseSchema: ControlReceiptV1,
        operation: "connector-outcome",
      }).pipe(Effect.withSpan("UnteamClient.setConnectorOutcome"));
    },
    selectSigningKey: (body: SelectSigningKey) => {
      const _input4 = controlUrl("signing-key");
      return postControl({
        client: client,
        url: _input4,
        requestSchema: SelectSigningKey,
        body: body,
        responseSchema: ControlReceiptV1,
        operation: "signing-key",
      }).pipe(Effect.withSpan("UnteamClient.selectSigningKey"));
    },
    advanceTime: (body: AdvanceSimulationTime) => {
      const _input5 = controlUrl("time");
      return postControl({
        client: client,
        url: _input5,
        requestSchema: AdvanceSimulationTime,
        body: body,
        responseSchema: ControlReceiptV1,
        operation: "advance-time",
      }).pipe(Effect.withSpan("UnteamClient.advanceTime"));
    },
    reset: (body: ResetControl) => {
      const _input6 = controlUrl("reset");
      return postControl({
        client: client,
        url: _input6,
        requestSchema: ResetControl,
        body: body,
        responseSchema: ControlReceiptV1,
        operation: "reset",
      }).pipe(Effect.withSpan("UnteamClient.reset"));
    },
    snapshot,
  });
});
export const UnteamClientLayer = Layer.effect(
  UnteamClient,
  Effect.gen(function* () {
    const config = yield* connectionConfig.pipe(
      Effect.mapError(() => clientError("readiness", "Unteam connection config failed decoding")),
    );
    const client = yield* HttpClient.HttpClient;
    return yield* fetchReadiness(client, config).pipe(
      Effect.flatMap(makeUnteamClientConnection),
      Effect.timeoutOrElse({
        duration: duration(config.readinessTimeoutMillis),
        orElse: () => Effect.fail(clientError("readiness", "Unteam connection check timed out")),
      }),
    );
  }),
);
