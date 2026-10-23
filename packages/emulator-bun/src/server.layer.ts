import { Function as EffectFunction, Array as EffectArray } from "effect";
import { Context, Effect, Layer, Predicate, Schema } from "effect";
import { FetchHttpClient, HttpServerResponse } from "effect/http";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import {
  TeamsEmulatorLive,
  EmulatorConfiguration,
  ProtocolState,
  ScenarioV1,
  ServiceUrl,
  TeamsEmulator,
  type ScenarioV1 as Scenario,
  type TeamsEmulatorService,
} from "@unteam/emulator-core";
import { EmulatorStartupError } from "@unteam/emulator-core/errors";
import { exampleScenario } from "@unteam/emulator-core/fixtures";
import { makeProtocolHttpApp } from "@unteam/emulator-core/live";
import { UnteamLoopbackUrl, UnteamReadyV2, type ServerPort, type ServerScenarioV1 } from "./server.schemas";
type ScopedBunHttpServer = Effect.Success<ReturnType<typeof BunHttpServer.make>>;
export interface TeamsEmulatorServer {
  readonly origin: URL;
  readonly emulator: TeamsEmulatorService;
}
export interface ReadyTeamsEmulatorServer extends TeamsEmulatorServer {
  readonly readiness: UnteamReadyV2;
}
const buildTeamsEmulator = Effect.fnUntraced(function* ({
  origin,
  scenario,
}: {
  readonly origin: URL;
  readonly scenario: Scenario;
}) {
  const coreLayer = TeamsEmulatorLive.pipe(
    Layer.provide(
      Layer.succeed(EmulatorConfiguration, {
        scenario,
        origin,
      }),
    ),
    Layer.provide(FetchHttpClient.layer),
  );
  const services = yield* Layer.build(coreLayer);
  const state = Context.get(services, ProtocolState);
  const emulator = Context.get(services, TeamsEmulator);
  const router = yield* makeProtocolHttpApp({
    origin,
    state,
    emulator,
  });
  return {
    emulator,
    router,
  };
});
const serveTeamsEmulator = Effect.fnUntraced(function* ({
  server,
  origin,
  scenario,
}: {
  readonly server: ScopedBunHttpServer;
  readonly origin: URL;
  readonly scenario: Scenario;
}) {
  const { emulator, router } = yield* buildTeamsEmulator({
    origin: origin,
    scenario: scenario,
  });
  // Effect 4.0.5 gives its native router an unknown error channel. This
  // HTTP host converts it to a defect; process tests cover request failure and cleanup.
  // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context
  yield* server.serve(router.asHttpEffect().pipe(Effect.orDie));
  return {
    origin,
    emulator,
  } satisfies TeamsEmulatorServer;
});
const serveReadyTeamsEmulator = Effect.fnUntraced(function* ({
  server,
  origin,
  scenario,
}: {
  readonly server: ScopedBunHttpServer;
  readonly origin: URL;
  readonly scenario: Scenario;
}) {
  const { emulator, router } = yield* buildTeamsEmulator({
    origin: origin,
    scenario: scenario,
  });
  const snapshot = yield* emulator.snapshot;
  const decodeLoopbackUrl = Schema.decodeUnknownEffect(UnteamLoopbackUrl);
  const readiness = UnteamReadyV2.make({
    readinessVersion: "unteam.ready.v2",
    synthetic: true,
    scenarioName: scenario.name,
    origin: yield* decodeLoopbackUrl(origin.href),
    issuerUrl: yield* decodeLoopbackUrl(origin.href),
    openIdMetadataUrl: yield* decodeLoopbackUrl(new URL("/.well-known/openidconfiguration", origin).href),
    jwkSetUrl: yield* decodeLoopbackUrl(new URL("/.well-known/keys", origin).href),
    oauthTokenUrl: yield* decodeLoopbackUrl(new URL("/oauth2/v2.0/token", origin).href),
    controlBaseUrl: yield* decodeLoopbackUrl(new URL("/control/", origin).href),
    botAppId: snapshot.botAppId,
    connectorScope: scenario.bot.scope,
    connections: yield* Effect.forEach(snapshot.connections, (connection) =>
      decodeLoopbackUrl(connection.serviceUrl.href).pipe(
        Effect.map((serviceUrl) => ({
          connectionId: connection.connectionId,
          serviceUrl,
        })),
      ),
    ),
  });
  yield* router.add(
    "GET",
    "/ready",
    HttpServerResponse.schemaJson(UnteamReadyV2)(readiness).pipe(Effect.orDie),
  );
  // Effect 4.0.5 gives its native router an unknown error channel. This
  // HTTP host converts it to a defect; process tests cover request failure and cleanup.
  // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context
  yield* server.serve(router.asHttpEffect().pipe(Effect.orDie));
  return {
    origin,
    emulator,
    readiness,
  } satisfies ReadyTeamsEmulatorServer;
});
const acquireLoopbackServer = Effect.fnUntraced(function* ({ port }: { readonly port: number }) {
  const server = yield* BunHttpServer.make({
    hostname: "127.0.0.1",
    port,
    gracefulShutdownTimeout: "1 second",
  });
  if (!Predicate.isTagged("InetAddressV4")(server.address)) {
    return yield* new EmulatorStartupError({
      code: "unsupported-profile",
    });
  }
  return {
    server,
    origin: new URL(`http://127.0.0.1:${server.address.port}/`),
  } as const;
});
export const makeTeamsEmulatorServer = (scenario: Scenario = exampleScenario) =>
  Effect.gen(function* () {
    const acquired = yield* acquireLoopbackServer({
      port: 0,
    });
    return yield* serveTeamsEmulator({
      server: acquired.server,
      origin: acquired.origin,
      scenario: scenario,
    });
  }).pipe(Effect.provide(FetchHttpClient.layer));
export const makeTeamsEmulatorServerFromPaths = (
  scenario: ServerScenarioV1,
  options?: {
    readonly port?: ServerPort;
  },
) =>
  Effect.gen(function* () {
    const acquired = yield* acquireLoopbackServer({
      port: options?.port ?? 0,
    });
    const resolved = ScenarioV1.make({
      ...scenario,
      connections: EffectFunction.pipe(
        scenario.connections,
        EffectArray.map((connection) => ({
          ...connection,
          serviceUrl: ServiceUrl.make(new URL(connection.servicePath, acquired.origin)),
        })),
      ),
    });
    return yield* serveReadyTeamsEmulator({
      server: acquired.server,
      origin: acquired.origin,
      scenario: resolved,
    });
  }).pipe(Effect.provide(FetchHttpClient.layer));
export type TeamsEmulatorServerEffect = ReturnType<typeof makeTeamsEmulatorServer>;
