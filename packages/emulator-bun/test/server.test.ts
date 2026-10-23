import { Predicate } from "effect";
import { Function as EffectFunction, Array as EffectArray } from "effect";
import * as BunSocket from "@effect/platform-bun/BunSocket";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Redacted, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpRouter,
  HttpServerResponse,
} from "effect/http";
import { makeTeamsEmulatorServer, makeTeamsEmulatorServerFromPaths } from "../src/server.layer";
import { ServerPort, ServerScenarioV1, UnteamReadyV2 } from "../src/server.schemas";
import { exampleScenario } from "@unteam/emulator-core/fixtures";
import {
  AdvanceSimulationTime,
  ConnectorActivity,
  ConnectorSendRequest,
  ControlReceiptV1,
  DeliverActivity,
  DeliveryReceiptV1,
  EmulatorSnapshotV1,
  JwkSetV1,
  OpenIdDocumentV1,
  OAuthTokenResponseV1,
  ScenarioV1,
  ServicePath,
  SelectSigningKey,
  SetConnectorOutcome,
  SetInstallation,
} from "@unteam/emulator-core/schemas";
const scenario: Schema.Schema.Type<typeof ScenarioV1> = {
  ...exampleScenario,
  initialTimeMillis: 1_700_000_000_000,
};
const [connection] = scenario.connections;
const jsonBody = <S extends Schema.Constraint>(schema: S, body: S["Type"]) =>
  HttpClientRequest.schemaBodyJson(schema)(body);
const decodeBody = <S extends Schema.ConstraintDecoder<unknown, never>>(
  schema: S,
  response: HttpClientResponse.HttpClientResponse,
) => response.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(schema)));
const connectorUrl = (origin: URL) =>
  new URL(
    `/connector/${connection.connectionId}/v3/conversations/${connection.conversationId}/activities`,
    origin,
  );
const connectorBody = ConnectorSendRequest.make({
  type: "message",
  text: "A Connector response probe.",
  conversation: {
    id: connection.conversationId,
  },
});
const freshTcpProbe = (url: URL) =>
  Effect.scoped(
    Effect.gen(function* () {
      const socket = yield* BunSocket.makeNet({
        host: url.hostname,
        port: Number(url.port),
      });
      yield* socket.reader;
    }),
  );
const makeIngressServer = Effect.gen(function* () {
  const server = yield* BunHttpServer.make({
    hostname: "127.0.0.1",
    port: 0,
  });
  if (!Predicate.isTagged("InetAddressV4")(server.address))
    return yield* Effect.die("test ingress requires TCP");
  const origin = new URL(`http://127.0.0.1:${server.address.port}`);
  const received = yield* Deferred.make<{
    readonly authorization: string | undefined;
    readonly body: unknown;
  }>();
  const router = yield* HttpRouter.make;
  yield* router.add("POST", "/ingress", (request) =>
    Effect.gen(function* () {
      const body = yield* request.json;
      yield* Deferred.succeed(received, {
        authorization: request.headers.authorization,
        body,
      });
      return HttpServerResponse.empty({
        status: 202,
      });
    }).pipe(Effect.orDie),
  );
  // Effect 4.0.5 gives its native router an unknown error channel. This
  // HTTP host converts it to a defect; process tests cover request failure and cleanup.
  // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context
  yield* server.serve(router.asHttpEffect().pipe(Effect.orDie));
  return {
    origin,
    url: new URL("/ingress", origin),
    received,
  };
});
const setConnectorOutcome = Effect.fnUntraced(function* ({
  origin,
  outcome,
}: {
  readonly origin: URL;
  readonly outcome: Schema.Schema.Type<typeof SetConnectorOutcome>;
}) {
  const client = yield* HttpClient.HttpClient;
  const request = yield* HttpClientRequest.post(new URL("/control/connector", origin)).pipe(
    jsonBody(SetConnectorOutcome, outcome),
  );
  const response = yield* client.execute(request);
  assert.strictEqual(response.status, 200);
  return yield* decodeBody(ControlReceiptV1, response);
});
describe("@unteam/emulator-bun server", () => {
  it.effect("follows OpenID/JWK, OAuth, Connector, control, delivery, and rotation boundaries", () => {
    return Effect.scoped(
      Effect.gen(function* () {
        const ingress = yield* makeIngressServer;
        const setup = yield* makeTeamsEmulatorServer(scenario);
        const client = yield* HttpClient.HttpClient;
        const missingToken = yield* client.execute(HttpClientRequest.post(connectorUrl(setup.origin)));
        assert.strictEqual(missingToken.status, 401);
        const openIdResponse = yield* client.execute(
          HttpClientRequest.get(new URL("/.well-known/openidconfiguration", setup.origin)),
        );
        assert.strictEqual(openIdResponse.status, 200);
        const openId = yield* decodeBody(OpenIdDocumentV1, openIdResponse);
        const jwkResponse = yield* client.execute(HttpClientRequest.get(openId.jwks_uri));
        assert.strictEqual(jwkResponse.status, 200);
        const jwks = yield* decodeBody(JwkSetV1, jwkResponse);
        assert.strictEqual(jwks.keys.length, scenario.signingKeys.length);
        const tokenRequest = HttpClientRequest.post(new URL("/oauth2/v2.0/token", setup.origin)).pipe(
          HttpClientRequest.bodyUrlParams({
            client_id: scenario.bot.botAppId,
            client_secret: Redacted.value(scenario.bot.clientSecret),
            grant_type: "client_credentials",
            scope: scenario.bot.scope,
          }),
        );
        const tokenResponse = yield* client.execute(tokenRequest);
        assert.strictEqual(tokenResponse.status, 200);
        const token = yield* decodeBody(OAuthTokenResponseV1, tokenResponse);
        const connectorRequest = yield* HttpClientRequest.post(connectorUrl(setup.origin)).pipe(
          HttpClientRequest.bearerToken(token.access_token),
          jsonBody(ConnectorSendRequest, connectorBody),
        );
        const accepted = yield* client.execute(connectorRequest);
        assert.strictEqual(accepted.status, 200);
        const outcomes = [
          ["unauthorized", 401],
          ["forbidden", 403],
          ["not-found", 404],
          ["conflict", 409],
          ["throttled", 429],
          ["malformed-response", 200],
          ["transient-failure", 503],
        ] as const;
        yield* Effect.forEach(outcomes, ([outcome, status]) =>
          Effect.gen(function* () {
            yield* setConnectorOutcome({
              origin: setup.origin,
              outcome: {
                controlVersion: "control.v1",
                kind: "set-connector-outcome",
                operationId: (yield* Schema.decodeUnknownEffect(SetConnectorOutcome)({
                  controlVersion: "control.v1",
                  kind: "set-connector-outcome",
                  operationId: `outcome-${outcome}`,
                  connectionId: connection.connectionId,
                  outcome,
                })).operationId,
                connectionId: connection.connectionId,
                outcome,
              },
            });
            const response = yield* client.execute(connectorRequest);
            assert.strictEqual(response.status, status);
          }),
        );
        const _input = yield* Schema.decodeUnknownEffect(SetConnectorOutcome)({
          controlVersion: "control.v1",
          kind: "set-connector-outcome",
          operationId: "interrupted-outcome",
          connectionId: connection.connectionId,
          outcome: "interrupted",
        });
        yield* setConnectorOutcome({
          origin: setup.origin,
          outcome: _input,
        });
        const interrupted = yield* client.execute(connectorRequest);
        assert.strictEqual(interrupted.status, 503);
        const _input2 = yield* Schema.decodeUnknownEffect(SetInstallation)({
          controlVersion: "control.v1",
          kind: "set-installation",
          operationId: "block-connection",
          connectionId: connection.connectionId,
          state: "blocked",
        });
        const blockedRequest = yield* HttpClientRequest.post(
          new URL("/control/installation", setup.origin),
        ).pipe(jsonBody(SetInstallation, _input2));
        const blockedControl = yield* client.execute(blockedRequest);
        assert.strictEqual(blockedControl.status, 200);
        const blocked = yield* client.execute(connectorRequest);
        assert.strictEqual(blocked.status, 403);
        const _input3 = yield* Schema.decodeUnknownEffect(SetInstallation)({
          controlVersion: "control.v1",
          kind: "set-installation",
          operationId: "install-connection",
          connectionId: connection.connectionId,
          state: "installed",
        });
        const installRequest = yield* HttpClientRequest.post(
          new URL("/control/installation", setup.origin),
        ).pipe(jsonBody(SetInstallation, _input3));
        const installResponse = yield* client.execute(installRequest);
        assert.strictEqual(installResponse.status, 200);
        const secondKey = yield* EffectArray.get(scenario.signingKeys, 1).pipe(
          Effect.fromOption(() => "test fixture requires key rotation"),
          Effect.orDie,
        );
        const rotation = yield* Schema.decodeUnknownEffect(SelectSigningKey)({
          controlVersion: "control.v1",
          kind: "select-signing-key",
          operationId: "rotate-key",
          connectionId: connection.connectionId,
          keyId: secondKey.keyId,
        });
        const rotationRequest = yield* HttpClientRequest.post(
          new URL("/control/signing-key", setup.origin),
        ).pipe(jsonBody(SelectSigningKey, rotation));
        const rotationResponse = yield* client.execute(rotationRequest);
        assert.strictEqual(rotationResponse.status, 200);
        const _input4 = yield* Schema.decodeUnknownEffect(SetConnectorOutcome)({
          controlVersion: "control.v1",
          kind: "set-connector-outcome",
          operationId: "restore-success",
          connectionId: connection.connectionId,
          outcome: "success",
        });
        yield* setConnectorOutcome({
          origin: setup.origin,
          outcome: _input4,
        });
        const deliveryInput = yield* Schema.decodeUnknownEffect(DeliverActivity)({
          controlVersion: "control.v1",
          kind: "deliver-activity",
          operationId: "deliver-through-ingress",
          connectionId: connection.connectionId,
          activityId: "activity-through-ingress",
          text: "A signed synthetic Activity.",
          ingressUrl: ingress.url.href,
        });
        const deliverRequest = yield* HttpClientRequest.post(new URL("/control/deliver", setup.origin)).pipe(
          jsonBody(DeliverActivity, deliveryInput),
        );
        const deliveredResponse = yield* client.execute(deliverRequest);
        assert.strictEqual(deliveredResponse.status, 200);
        const delivered = yield* decodeBody(DeliveryReceiptV1, deliveredResponse);
        assert.strictEqual(delivered.result, "delivered");
        assert.strictEqual(delivered.status, 202);
        const received = yield* Deferred.await(ingress.received);
        assert.isTrue(received.authorization?.startsWith("Bearer ") === true);
        const activity = yield* Schema.decodeUnknownEffect(ConnectorActivity)(received.body);
        assert.strictEqual(activity.channelId, "msteams");
        assert.strictEqual(activity.channelData.tenant.id, connection.tenantId);
        const advance = yield* Schema.decodeUnknownEffect(AdvanceSimulationTime)({
          controlVersion: "control.v1",
          kind: "advance-time",
          operationId: "expire-token",
          duration: 3_600_001,
        });
        const advanceRequest = yield* HttpClientRequest.post(new URL("/control/time", setup.origin)).pipe(
          jsonBody(AdvanceSimulationTime, advance),
        );
        const advanced = yield* client.execute(advanceRequest);
        assert.strictEqual(advanced.status, 200);
        const expired = yield* client.execute(connectorRequest);
        assert.strictEqual(expired.status, 401);
        const snapshotResponse = yield* client.execute(
          HttpClientRequest.get(new URL("/control/snapshot", setup.origin)),
        );
        const snapshot = yield* decodeBody(EmulatorSnapshotV1, snapshotResponse);
        assert.strictEqual(snapshot.activeTokenCount, 0);
        assert.strictEqual(snapshot.prunedTokenCount, 1);
        assert.deepEqual(snapshot.protocol, {
          jwkRequestCount: 1,
          oauthRequestCount: 1,
          connectorRequestCount: 9,
          controlDeliveryRequestCount: 1,
        });
        assert.strictEqual(snapshot.connectorRequests.length, 9);
      }),
    ).pipe(Effect.provide(FetchHttpClient.layer));
  });
  it.effect("finalizes its scoped listener and reports timeout/interruption outcomes", () =>
    Effect.gen(function* () {
      const origin = yield* Effect.scoped(
        Effect.gen(function* () {
          const setup = yield* makeTeamsEmulatorServer(scenario);
          const client = yield* HttpClient.HttpClient;
          const response = yield* client.execute(
            HttpClientRequest.get(new URL("/.well-known/openidconfiguration", setup.origin)),
          );
          assert.strictEqual(response.status, 200);
          return setup.origin;
        }),
      );
      const afterClose = yield* freshTcpProbe(origin).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(afterClose));
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );
  it.effect("resolves bounded connector service paths against the scoped server origin", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const pathScenario = ServerScenarioV1.make({
          ...scenario,
          connections: EffectFunction.pipe(
            scenario.connections,
            EffectArray.map(({ serviceUrl: _serviceUrl, ...item }) => ({
              ...item,
              servicePath: ServicePath.make(`/connector/${item.connectionId}/`),
            })),
          ),
        });
        const port = yield* Effect.scoped(
          Effect.gen(function* () {
            const reservation = yield* BunHttpServer.make({
              hostname: "127.0.0.1",
              port: 0,
            });
            if (!Predicate.isTagged("InetAddressV4")(reservation.address)) {
              return yield* Effect.die("fixed-port test requires TCP");
            }
            return ServerPort.make(reservation.address.port);
          }),
        );
        const setup = yield* makeTeamsEmulatorServerFromPaths(pathScenario, {
          port,
        });
        const snapshot = yield* setup.emulator.snapshot;
        const client = yield* HttpClient.HttpClient;
        const readinessResponse = yield* client.execute(
          HttpClientRequest.get(new URL("/ready", setup.origin)),
        );
        const readiness = yield* decodeBody(UnteamReadyV2, readinessResponse);
        assert.strictEqual(Number(setup.origin.port), port);
        assert.strictEqual(readiness.scenarioName, pathScenario.name);
        assert.strictEqual(readiness.origin.href, setup.origin.href);
        assert.deepEqual(
          EffectFunction.pipe(
            snapshot.connections,
            EffectArray.map((item) => item.serviceUrl.origin),
          ),
          EffectFunction.pipe(
            scenario.connections,
            EffectArray.map(() => setup.origin.origin),
          ),
        );
      }),
    ).pipe(Effect.provide(FetchHttpClient.layer)),
  );
});
