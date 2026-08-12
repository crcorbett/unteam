import { Effect, Option, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse, UrlParams } from "effect/unstable/http";

import {
  EmulatorControlError,
  EmulatorDeliveryError,
  EmulatorProtocolError,
  ProtocolErrorCode,
} from "../errors";
import type { TeamsEmulatorService } from "../service";
import {
  ActivityId,
  ConnectorSendRequest,
  ConnectorSendResponse,
  ConnectorRequestV1,
  ConnectionId,
  ConversationId,
  ControlReceiptV1,
  decodeExact,
  DeliverActivity,
  deliverActivityKeys,
  DeliveryReceiptV1,
  EmulatorSnapshotV1,
  JwkSetV1,
  OpenIdDocumentV1,
  OAuthTokenResponseV1,
  ProtocolErrorResponseV1,
  ResetControl,
  resetKeys,
  SelectSigningKey,
  selectSigningKeyKeys,
  SetConnectorOutcome,
  setConnectorOutcomeKeys,
  SetInstallation,
  setInstallationKeys,
  AdvanceSimulationTime,
  advanceTimeKeys,
} from "../schemas";
import type { ProtocolStateService } from "./protocol-state";

type ResponseOptions = Parameters<typeof HttpServerResponse.jsonUnsafe>[1];

const schemaJson =
  <S extends Schema.ConstraintEncoder<unknown, never>>(schema: S) =>
  (body: S["Type"], options?: ResponseOptions) =>
    Effect.try({
      try: () => Schema.encodeUnknownSync(schema)(body),
      catch: () => new EmulatorProtocolError({ code: "malformed-response", status: 500 }),
    }).pipe(
      Effect.orDie,
      Effect.map((encoded) => HttpServerResponse.jsonUnsafe(encoded, options)),
    );

const OAuthForm = Schema.Struct({
  client_id: Schema.String,
  client_secret: Schema.String,
  grant_type: Schema.Literal("client_credentials"),
  scope: Schema.String,
});

const controlErrorResponse = (code: ProtocolErrorCode, status: EmulatorProtocolError["status"]) =>
  schemaJson(ProtocolErrorResponseV1)({ errorVersion: "control-error.v1", code }, { status });

const protocolErrorResponse = (error: EmulatorProtocolError) =>
  controlErrorResponse(error.code, error.status);

const controlErrorCode = (error: EmulatorControlError): ProtocolErrorCode => {
  switch (error.code) {
    case "unknown-connection":
    case "unknown-signing-key":
      return "unknown-connection";
    case "invalid-loopback-target":
      return "malformed-request";
    case "duplicate-activity":
    case "control-conflict":
      return "conversation-conflict";
    case "invalid-duration":
      return "malformed-request";
    case "delivery-failed":
      return "transient-failure";
  }
};

const controlStatus = (error: EmulatorControlError): EmulatorProtocolError["status"] => {
  switch (error.code) {
    case "unknown-connection":
    case "unknown-signing-key":
      return 404;
    case "invalid-loopback-target":
    case "invalid-duration":
      return 400;
    case "duplicate-activity":
    case "control-conflict":
      return 409;
    case "delivery-failed":
      return 503;
  }
};

const deliveryCode = (error: EmulatorDeliveryError): ProtocolErrorCode => {
  switch (error.code) {
    case "unknown-connection":
      return "unknown-connection";
    case "uninstalled":
      return "uninstalled";
    case "blocked-installation":
      return "blocked-installation";
    case "invalid-loopback-target":
      return "malformed-request";
    case "signing-failure":
    case "transmission-failure":
    case "uncertain":
      return "transient-failure";
    case "timeout":
    case "interrupted":
      return "transient-failure";
  }
};

const deliveryStatus = (error: EmulatorDeliveryError): EmulatorProtocolError["status"] => {
  switch (error.code) {
    case "unknown-connection":
    case "uninstalled":
      return 404;
    case "blocked-installation":
      return 403;
    case "invalid-loopback-target":
      return 400;
    case "timeout":
      return 503;
    case "signing-failure":
    case "transmission-failure":
    case "interrupted":
    case "uncertain":
      return 503;
  }
};

const parseConnectorPath = (request: HttpServerRequest.HttpServerRequest) => {
  const parts = new URL(request.originalUrl).pathname.split("/").filter(Boolean);
  if (
    parts.length !== 6 ||
    parts[0] !== "connector" ||
    parts[2] !== "v3" ||
    parts[3] !== "conversations" ||
    parts[5] !== "activities"
  ) {
    return Option.none<{ readonly connectionId: string; readonly conversationId: string }>();
  }
  const connectionId = parts[1];
  const conversationId = parts[4];
  return connectionId === undefined || conversationId === undefined
    ? Option.none()
    : Option.some({ connectionId, conversationId });
};

const bearerToken = (request: HttpServerRequest.HttpServerRequest) => {
  const authorization = request.headers.authorization;
  return authorization !== undefined && authorization.startsWith("Bearer ")
    ? Option.some(authorization.slice("Bearer ".length))
    : Option.none<string>();
};

const errorForStatus = (status: number): ProtocolErrorCode => {
  if (status === 401) return "invalid-token";
  if (status === 403) return "blocked-installation";
  if (status === 404) return "unknown-connection";
  if (status === 409) return "conversation-conflict";
  if (status === 429) return "throttled";
  return "transient-failure";
};

export const makeProtocolHttpApp = (options: {
  readonly origin: URL;
  readonly state: ProtocolStateService;
  readonly emulator: TeamsEmulatorService;
}) =>
  Effect.gen(function* () {
    const router = yield* HttpRouter.make;
    const openId = HttpRouter.route("GET", "/.well-known/openidconfiguration", () =>
      schemaJson(OpenIdDocumentV1)({
        protocolVersion: "protocol.v1",
        jwks_uri: new URL("/.well-known/keys", options.origin),
      }),
    );
    const keys = HttpRouter.route("GET", "/.well-known/keys", () =>
      options.state.recordJwkRequest.pipe(
        Effect.andThen(options.state.readSigningKeys),
        Effect.map((keys) => ({ protocolVersion: "protocol.v1", keys }) satisfies JwkSetV1),
        Effect.flatMap((body) => schemaJson(JwkSetV1)(body)),
      ),
    );
    const oauth = HttpRouter.route("POST", "/oauth2/v2.0/token", (request) =>
      request.urlParamsBody.pipe(
        Effect.flatMap((params) => Schema.decodeUnknownEffect(OAuthForm)(UrlParams.toRecord(params))),
        Effect.flatMap((form) =>
          options.state.issueToken(form.client_id, form.client_secret, form.scope).pipe(
            Effect.map(
              (issued) =>
                ({
                  protocolVersion: "protocol.v1",
                  access_token: issued.token,
                  token_type: "Bearer",
                  expires_in: issued.expiresInSeconds,
                }) satisfies OAuthTokenResponseV1,
            ),
          ),
        ),
        Effect.flatMap((body) => schemaJson(OAuthTokenResponseV1)(body)),
        Effect.catchTag("EmulatorProtocolError", protocolErrorResponse),
        Effect.catch(() => controlErrorResponse("malformed-request", 400)),
      ),
    );
    const connector = HttpRouter.route("POST", "/connector/*", (request) =>
      Effect.gen(function* () {
        const path = parseConnectorPath(request);
        if (Option.isNone(path)) return yield* controlErrorResponse("unknown-route", 404);
        const token = bearerToken(request);
        if (Option.isNone(token)) {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "missing-token",
            status: 401,
          });
          return yield* controlErrorResponse("missing-token", 401);
        }
        const claims = yield* options.state.readToken(token.value);
        const nowMillis = yield* options.state.now;
        if (Option.isNone(claims) || claims.value.expiresAtMillis <= nowMillis) {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "expired-token",
            status: 401,
          });
          return yield* controlErrorResponse("invalid-token", 401);
        }
        if (claims.value.botAppId !== options.state.scenario.bot.botAppId) {
          return yield* controlErrorResponse("invalid-token", 401);
        }
        if (claims.value.scope !== options.state.scenario.bot.scope) {
          return yield* controlErrorResponse("invalid-scope", 403);
        }
        const connectionId = yield* Schema.decodeUnknownEffect(ConnectionId)(path.value.connectionId).pipe(
          Effect.option,
        );
        const conversationId = yield* Schema.decodeUnknownEffect(ConversationId)(
          path.value.conversationId,
        ).pipe(Effect.option);
        if (Option.isNone(connectionId) || Option.isNone(conversationId)) {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "unknown-connection",
            status: 404,
          });
          return yield* controlErrorResponse("unknown-connection", 404);
        }
        const connection = yield* options.state.readConnection(connectionId.value);
        if (Option.isNone(connection) || connection.value.conversationId !== conversationId.value) {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "unknown-connection",
            status: 404,
          });
          return yield* controlErrorResponse("unknown-connection", 404);
        }
        if (connection.value.installation === "blocked") {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "blocked-installation",
            connectionId: connection.value.connectionId,
            status: 403,
          });
          return yield* controlErrorResponse("blocked-installation", 403);
        }
        if (connection.value.installation === "uninstalled") {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "uninstalled",
            connectionId: connection.value.connectionId,
            status: 404,
          });
          return yield* controlErrorResponse("uninstalled", 404);
        }
        const decoded = yield* request.json.pipe(
          Effect.flatMap((body) => decodeExact(ConnectorSendRequest, ["type", "text", "conversation"], body)),
          Effect.option,
        );
        if (Option.isNone(decoded)) {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "malformed-activity",
            connectionId: connection.value.connectionId,
            status: 400,
          });
          return yield* controlErrorResponse("malformed-request", 400);
        }
        if (decoded.value.conversation.id !== connection.value.conversationId) {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "conversation-conflict",
            connectionId: connection.value.connectionId,
            status: 409,
          });
          return yield* controlErrorResponse("conversation-conflict", 409);
        }
        yield* options.state.recordConnectorRequest(
          ConnectorRequestV1.make({
            connectionId: connection.value.connectionId,
            conversationId: connection.value.conversationId,
            text: decoded.value.text,
          }),
        );
        const outcome = connection.value.connectorOutcome;
        if (outcome === "success") {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "accepted",
            connectionId: connection.value.connectionId,
            status: 200,
          });
          return yield* schemaJson(ConnectorSendResponse)({
            protocolVersion: "protocol.v1",
            id: ActivityId.make(`connector-${connection.value.connectionId}`),
          });
        }
        if (outcome === "timeout") {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "timeout",
            connectionId: connection.value.connectionId,
            status: 503,
          });
          return yield* Effect.never;
        }
        if (outcome === "interrupted") {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "interrupted",
            connectionId: connection.value.connectionId,
            status: 503,
          });
          return yield* controlErrorResponse("transient-failure", 503);
        }
        const status =
          outcome === "unauthorized"
            ? 401
            : outcome === "forbidden"
              ? 403
              : outcome === "not-found"
                ? 404
                : outcome === "conflict"
                  ? 409
                  : outcome === "throttled"
                    ? 429
                    : outcome === "malformed-response"
                      ? 500
                      : 503;
        if (outcome === "malformed-response") {
          yield* options.state.recordObservation({
            kind: "connector-request",
            detail: "malformed-response",
            connectionId: connection.value.connectionId,
            status: 200,
          });
          return yield* schemaJson(ProtocolErrorResponseV1)({
            errorVersion: "control-error.v1",
            code: "malformed-response",
          });
        }
        const code = errorForStatus(status);
        yield* options.state.recordObservation({
          kind: "connector-request",
          detail:
            outcome === "throttled"
              ? "throttled"
              : outcome === "transient-failure"
                ? "transient-failure"
                : "uncertain",
          connectionId: connection.value.connectionId,
          status,
        });
        return yield* controlErrorResponse(code, status).pipe(
          Effect.map((response) =>
            outcome === "throttled"
              ? response.pipe(HttpServerResponse.setHeader("retry-after", "1"))
              : response,
          ),
        );
      }).pipe(Effect.catch(() => controlErrorResponse("malformed-request", 400))),
    );

    const addControl = <A>(
      path:
        | "/control/installation"
        | "/control/connector"
        | "/control/signing-key"
        | "/control/time"
        | "/control/reset",
      schema: Schema.ConstraintCodec<A, unknown, never, never>,
      keys: readonly string[],
      handler: (input: A) => Effect.Effect<ControlReceiptV1, EmulatorControlError>,
    ) =>
      HttpRouter.route("POST", path, (request) =>
        request.json.pipe(
          Effect.flatMap((body) => decodeExact(schema, keys, body)),
          Effect.flatMap((input) => handler(input)),
          Effect.flatMap((receipt) => schemaJson(ControlReceiptV1)(receipt)),
          Effect.catchTag("EmulatorControlError", (error) =>
            controlErrorResponse(controlErrorCode(error), controlStatus(error)),
          ),
          Effect.catch(() => controlErrorResponse("malformed-request", 400)),
        ),
      );

    yield* router
      .addAll([
        openId,
        keys,
        oauth,
        connector,
        addControl("/control/installation", SetInstallation, setInstallationKeys, (input) =>
          options.emulator.setInstallation(input),
        ),
        addControl("/control/connector", SetConnectorOutcome, setConnectorOutcomeKeys, (input) =>
          options.emulator.setConnectorOutcome(input),
        ),
        addControl("/control/signing-key", SelectSigningKey, selectSigningKeyKeys, (input) =>
          options.emulator.selectSigningKey(input),
        ),
        addControl("/control/time", AdvanceSimulationTime, advanceTimeKeys, (input) =>
          options.emulator.advanceTime(input),
        ),
        addControl("/control/reset", ResetControl, resetKeys, (input) => options.emulator.reset(input)),
        HttpRouter.route("POST", "/control/deliver", (request) =>
          request.json.pipe(
            Effect.flatMap((body) => decodeExact(DeliverActivity, deliverActivityKeys, body)),
            Effect.flatMap((input) => options.emulator.deliverActivity(input)),
            Effect.flatMap((receipt) => schemaJson(DeliveryReceiptV1)(receipt)),
            Effect.catchTag("EmulatorDeliveryError", (error) =>
              controlErrorResponse(deliveryCode(error), deliveryStatus(error)),
            ),
            Effect.catch(() => controlErrorResponse("malformed-request", 400)),
          ),
        ),
        HttpRouter.route("GET", "/control/snapshot", () =>
          options.emulator.snapshot.pipe(
            Effect.flatMap((snapshot) => schemaJson(EmulatorSnapshotV1)(snapshot)),
            Effect.orDie,
          ),
        ),
      ])
      .pipe(Effect.orDie);
    return router;
  });
