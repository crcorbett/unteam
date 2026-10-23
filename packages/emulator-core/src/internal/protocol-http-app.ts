import { Match } from "effect";
import type { TrafficEventData } from "../events";
import { Data } from "effect";
import { Effect, Option, Ref, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse, UrlParams } from "effect/http";
import {
  EmulatorControlError,
  EmulatorDeliveryError,
  EmulatorProtocolError,
  ProtocolErrorCode,
} from "../errors";
import type { TeamsEmulatorService } from "../service";
import { TrafficEvents } from "../events";
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
  <A>(schema: Schema.ConstraintCodec<A, unknown, unknown, never>) =>
  (body: A, options?: ResponseOptions) =>
    HttpServerResponse.schemaJson(schema)(body, options).pipe(Effect.orDie);
const OAuthForm = Schema.Struct({
  client_id: Schema.String,
  client_secret: Schema.String,
  grant_type: Schema.Literal("client_credentials"),
  scope: Schema.String,
});
const controlErrorResponse = (code: ProtocolErrorCode, status: EmulatorProtocolError["status"]) =>
  schemaJson(ProtocolErrorResponseV1)(
    {
      errorVersion: "control-error.v1",
      code,
    },
    {
      status,
    },
  );
const protocolErrorResponse = (error: EmulatorProtocolError) =>
  controlErrorResponse(error.code, error.status);
const controlErrorCode = (error: EmulatorControlError): ProtocolErrorCode => {
  return Match.value(error.code).pipe(
    Match.whenOr(
      "unknown-connection",
      "unknown-signing-key",
      (): "unknown-connection" => "unknown-connection",
    ),
    Match.when("invalid-loopback-target", (): "malformed-request" => "malformed-request"),
    Match.whenOr(
      "duplicate-activity",
      "control-conflict",
      (): "conversation-conflict" => "conversation-conflict",
    ),
    Match.when("invalid-duration", (): "malformed-request" => "malformed-request"),
    Match.when("delivery-failed", (): "transient-failure" => "transient-failure"),
    Match.exhaustive,
  );
};
const controlStatus = (error: EmulatorControlError): EmulatorProtocolError["status"] => {
  return Match.value(error.code).pipe(
    Match.whenOr("unknown-connection", "unknown-signing-key", (): 404 => 404),
    Match.whenOr("invalid-loopback-target", "invalid-duration", (): 400 => 400),
    Match.whenOr("duplicate-activity", "control-conflict", (): 409 => 409),
    Match.when("delivery-failed", (): 503 => 503),
    Match.exhaustive,
  );
};
const deliveryCode = (error: EmulatorDeliveryError): ProtocolErrorCode => {
  return Match.value(error.code).pipe(
    Match.when("unknown-connection", (): "unknown-connection" => "unknown-connection"),
    Match.when("uninstalled", (): "uninstalled" => "uninstalled"),
    Match.when("blocked-installation", (): "blocked-installation" => "blocked-installation"),
    Match.when("invalid-loopback-target", (): "malformed-request" => "malformed-request"),
    Match.whenOr(
      "signing-failure",
      "transmission-failure",
      "uncertain",
      (): "transient-failure" => "transient-failure",
    ),
    Match.whenOr("timeout", "interrupted", (): "transient-failure" => "transient-failure"),
    Match.exhaustive,
  );
};
const deliveryStatus = (error: EmulatorDeliveryError): EmulatorProtocolError["status"] => {
  return Match.value(error.code).pipe(
    Match.whenOr("unknown-connection", "uninstalled", (): 404 => 404),
    Match.when("blocked-installation", (): 403 => 403),
    Match.when("invalid-loopback-target", (): 400 => 400),
    Match.when("timeout", (): 503 => 503),
    Match.whenOr("signing-failure", "transmission-failure", "interrupted", "uncertain", (): 503 => 503),
    Match.exhaustive,
  );
};
const ConnectorPath = Schema.Struct({
  connectionId: Schema.String,
  conversationId: Schema.String,
});
const parseConnectorPath = (request: HttpServerRequest.HttpServerRequest) => {
  const parts = new URL(request.originalUrl).pathname.split("/");
  return Schema.decodeUnknownOption(
    Schema.Tuple([
      Schema.Literal(""),
      Schema.Literal("connector"),
      Schema.String,
      Schema.Literal("v3"),
      Schema.Literal("conversations"),
      Schema.String,
      Schema.Literal("activities"),
    ]),
  )(parts).pipe(
    Option.map(([, , connectionId, , , conversationId]) =>
      ConnectorPath.make({
        connectionId,
        conversationId,
      }),
    ),
  );
};
const bearerToken = (request: HttpServerRequest.HttpServerRequest) =>
  Option.fromUndefinedOr(request.headers.authorization).pipe(
    Option.filter((value) => value.startsWith("Bearer ")),
    Option.map((value) => value.slice("Bearer ".length)),
  );
const errorForStatus = (status: number): ProtocolErrorCode => {
  if (status === 401) return "invalid-token";
  if (status === 403) return "blocked-installation";
  if (status === 404) return "unknown-connection";
  if (status === 409) return "conversation-conflict";
  if (status === 429) return "throttled";
  return "transient-failure";
};
export const makeProtocolHttpApp = Effect.fnUntraced(function* (options: {
  readonly origin: URL;
  readonly state: ProtocolStateService;
  readonly emulator: TeamsEmulatorService;
}) {
  const router = yield* HttpRouter.make;
  const events = yield* TrafficEvents;
  const exchanges = yield* Ref.make(0);
  yield* router.addGlobalMiddleware((httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const pathname = new URL(request.originalUrl, options.origin).pathname;
      const route = (() => {
        if (pathname === "/.well-known/openidconfiguration") return "openid";
        return (() => {
          if (pathname === "/.well-known/keys") return "keys";
          return (() => {
            if (pathname === "/oauth2/v2.0/token") return "oauth";
            return (() => {
              if (pathname.startsWith("/connector/")) return "connector";
              return (() => {
                if (pathname.startsWith("/control/")) return "control";
                return (() => {
                  if (pathname === "/ready") return "ready";
                  return "unknown";
                })();
              })();
            })();
          })();
        })();
      })();
      const exchange = `request-${yield* Ref.updateAndGet(exchanges, (current) => current + 1)}`;
      const data = Data.taggedEnum<
        Omit<(typeof TrafficEventData.members)[1]["Type"], "phase" | "status">
      >().Http({
        exchange,
        method: request.method,
        route,
      });
      yield* events.record({
        ...data,
        phase: "received",
        status: Option.none(),
      });
      return yield* httpEffect.pipe(
        Effect.tap((response) =>
          events.record({
            ...data,
            phase: "responded",
            status: Option.some(response.status),
          }),
        ),
        Effect.onInterrupt(() =>
          events.record({
            ...data,
            phase: "interrupted",
            status: Option.none(),
          }),
        ),
      );
    }),
  );
  const openId = HttpRouter.route("GET", "/.well-known/openidconfiguration", () =>
    schemaJson(OpenIdDocumentV1)({
      protocolVersion: "protocol.v1",
      jwks_uri: new URL("/.well-known/keys", options.origin),
    }),
  );
  const keys = HttpRouter.route("GET", "/.well-known/keys", () =>
    options.state.recordJwkRequest.pipe(
      Effect.andThen(options.state.readSigningKeys),
      Effect.map(
        (keys) =>
          ({
            protocolVersion: "protocol.v1",
            keys,
          }) satisfies JwkSetV1,
      ),
      Effect.flatMap((body) => schemaJson(JwkSetV1)(body)),
    ),
  );
  const oauth = HttpRouter.route("POST", "/oauth2/v2.0/token", (request) =>
    request.urlParamsBody.pipe(
      Effect.flatMap((params) => Schema.decodeUnknownEffect(OAuthForm)(UrlParams.toRecord(params))),
      Effect.flatMap((form) =>
        options.state
          .issueToken({
            clientId: form.client_id,
            clientSecret: form.client_secret,
            scope: form.scope,
          })
          .pipe(
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
      yield* events.record(
        Data.taggedEnum<TrafficEventData>().Message({
          botAppId: options.state.scenario.bot.botAppId,
          direction: "received",
          phase: "started",
          connectionId: connection.value.connectionId,
          tenantId: connection.value.tenantId,
          userId: connection.value.userId,
          conversationId: connection.value.conversationId,
          activityId: Option.none(),
          text: decoded.value.text,
          status: Option.none(),
        }),
      );
      yield* options.state.recordConnectorRequest(
        ConnectorRequestV1.make({
          connectionId: connection.value.connectionId,
          conversationId: connection.value.conversationId,
          text: decoded.value.text,
        }),
      );
      const outcome = connection.value.connectorOutcome;
      yield* events.record(
        Data.taggedEnum<TrafficEventData>().Message({
          botAppId: options.state.scenario.bot.botAppId,
          direction: "received",
          phase: (() => {
            if (outcome === "success") return "accepted";
            return (() => {
              if (outcome === "timeout") return "uncertain";
              return "rejected";
            })();
          })(),
          connectionId: connection.value.connectionId,
          tenantId: connection.value.tenantId,
          userId: connection.value.userId,
          conversationId: connection.value.conversationId,
          activityId: Option.none(),
          text: decoded.value.text,
          status: (() => {
            if (outcome === "timeout") return Option.none();
            return Option.some(
              (() => {
                if (outcome === "success" || outcome === "malformed-response") return 200;
                return (() => {
                  if (outcome === "unauthorized") return 401;
                  return (() => {
                    if (outcome === "forbidden") return 403;
                    return (() => {
                      if (outcome === "not-found") return 404;
                      return (() => {
                        if (outcome === "conflict") return 409;
                        return (() => {
                          if (outcome === "throttled") return 429;
                          return 503;
                        })();
                      })();
                    })();
                  })();
                })();
              })(),
            );
          })(),
        }),
      );
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
      const status = (() => {
        if (outcome === "unauthorized") return 401;
        return (() => {
          if (outcome === "forbidden") return 403;
          return (() => {
            if (outcome === "not-found") return 404;
            return (() => {
              if (outcome === "conflict") return 409;
              return (() => {
                if (outcome === "throttled") return 429;
                return (() => {
                  if (outcome === "malformed-response") return 500;
                  return 503;
                })();
              })();
            })();
          })();
        })();
      })();
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
        detail: (() => {
          if (outcome === "throttled") return "throttled";
          return (() => {
            if (outcome === "transient-failure") return "transient-failure";
            return "uncertain";
          })();
        })(),
        connectionId: connection.value.connectionId,
        status,
      });
      return yield* controlErrorResponse(code, status).pipe(
        Effect.map((response) =>
          (() => {
            if (outcome === "throttled")
              return response.pipe(HttpServerResponse.setHeader("retry-after", "1"));
            return response;
          })(),
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
        Effect.catchTag("EmulatorControlError", (error) => {
          const _input = controlErrorCode(error);
          const _input2 = controlStatus(error);
          return controlErrorResponse(_input, _input2);
        }),
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
          Effect.catchTag("EmulatorDeliveryError", (error) => {
            const _input3 = deliveryCode(error);
            const _input4 = deliveryStatus(error);
            return controlErrorResponse(_input3, _input4);
          }),
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
