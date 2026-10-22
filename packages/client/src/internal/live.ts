import { Config, Effect, Schema } from "effect";
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
  new UnteamClientError({ operation, reason });

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
  HttpClientResponse.schemaBodyJson(schema, { onExcessProperty: "error" })(response).pipe(
    Effect.mapError(() => clientError(operation, "Unteam response failed decoding")),
  );

const postControl = <Request, Response>(
  client: HttpClient.HttpClient,
  url: URL,
  requestSchema: Schema.Codec<Request, unknown, never, never>,
  body: Request,
  responseSchema: Schema.Codec<Response, unknown, never, never>,
  operation: UnteamClientError["operation"],
) =>
  Effect.gen(function* () {
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

const ensureConfiguredOrigin = (config: UnteamConnectionConfigType, readiness: UnteamReadyV2Type) =>
  Effect.gen(function* () {
    const urls = [
      readiness.origin,
      readiness.issuerUrl,
      readiness.openIdMetadataUrl,
      readiness.jwkSetUrl,
      readiness.oauthTokenUrl,
      readiness.controlBaseUrl,
      ...readiness.connections.map((connection) => connection.serviceUrl),
    ];
    if (readiness.origin.href !== config.origin.href) {
      return yield* clientError("readiness", "Readiness origin differs from UNTEAM_ORIGIN");
    }
    if (!urls.every((url) => url.origin === config.origin.origin)) {
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
    Effect.tap((readiness) => ensureConfiguredOrigin(config, readiness)),
  );

const probeProtocol = (client: HttpClient.HttpClient, readiness: UnteamReadyV2Type) =>
  Effect.gen(function* () {
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

const makeUnteamClientConnection = (readiness: UnteamReadyV2Type) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const controlUrl = (path: string) => new URL(path, readiness.controlBaseUrl);
    const snapshot = () =>
      client.execute(HttpClientRequest.get(controlUrl("snapshot"))).pipe(
        Effect.mapError(() => clientError("snapshot", "Unteam snapshot request failed")),
        Effect.flatMap((response) => requireSuccess(response, "snapshot")),
        Effect.flatMap((response) => responseBody(EmulatorSnapshotV1, response, "snapshot")),
      );
    yield* probeProtocol(client, readiness);
    yield* snapshot();
    return UnteamClient.of({
      readiness,
      deliverActivity: (body: DeliverActivity) =>
        postControl(client, controlUrl("deliver"), DeliverActivity, body, DeliveryReceiptV1, "deliver"),
      setInstallation: (body: SetInstallation) =>
        postControl(
          client,
          controlUrl("installation"),
          SetInstallation,
          body,
          ControlReceiptV1,
          "installation",
        ),
      setConnectorOutcome: (body: SetConnectorOutcome) =>
        postControl(
          client,
          controlUrl("connector"),
          SetConnectorOutcome,
          body,
          ControlReceiptV1,
          "connector-outcome",
        ),
      selectSigningKey: (body: SelectSigningKey) =>
        postControl(
          client,
          controlUrl("signing-key"),
          SelectSigningKey,
          body,
          ControlReceiptV1,
          "signing-key",
        ),
      advanceTime: (body: AdvanceSimulationTime) =>
        postControl(
          client,
          controlUrl("time"),
          AdvanceSimulationTime,
          body,
          ControlReceiptV1,
          "advance-time",
        ),
      reset: (body: ResetControl) =>
        postControl(client, controlUrl("reset"), ResetControl, body, ControlReceiptV1, "reset"),
      snapshot,
    });
  });

export const makeUnteamClientConnectionFromConfig = Effect.gen(function* () {
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
});
